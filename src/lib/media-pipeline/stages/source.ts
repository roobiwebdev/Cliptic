/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: resolveSource, ResolveSourceParams
 *
 * WHAT:  STAGE 1 — turn a raw input (YouTube URL, or an uploaded file the worker
 *        downloaded from R2) into a `Source` with a 16 kHz mono WAV on scratch.
 * WHY:   For YouTube we download AUDIO ONLY here (tiny) and defer the video to
 *        the cut stage (section-download); uploads are already local so we just
 *        extract audio. No disk cache keyed by videoId — the worker owns per-job
 *        state (DB) and the scratch dir, which fixes the CLI's cache-key bug.
 * WHERE: Called by the clip worker processor.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mediaConfig } from '../config'
import { runWithProgress, commandExists } from '../lib/exec'
import { createLogger } from '../lib/log'
import { extractAudioForTranscription } from '../lib/media'
import type { Source } from '../types'

const log = createLogger('source')

/**
 * SOURCE OF TRUTH KEYWORDS: classifyYoutubeError, YoutubeDownloadError, bot check,
 *   429, sign in to confirm, download error classification
 *
 * WHAT:  Turn a raw yt-dlp failure (now carrying real stderr — see lib/exec.ts)
 *        into a SHORT, user-safe, ACTIONABLE message. Unknown failures keep a
 *        trimmed raw tail so nothing is hidden.
 * WHY:   "yt-dlp exited with code 1" told the user nothing. The dominant real
 *        cause is YouTube's bot wall (429 + "sign in to confirm you're not a
 *        bot"), which needs authenticated cookies — the message now says so.
 * WHERE: Wraps every yt-dlp call in this stage; the worker stores the message
 *        on ClipJob.error (already user-facing).
 */
export class YoutubeDownloadError extends Error {}

export function classifyYoutubeError(raw: string): string {
  const r = raw.toLowerCase()
  /* Age FIRST: YouTube's age gate also says "sign in to confirm your age", which
   * would otherwise be caught by the bot-wall rule below. */
  if (/age.?restricted|confirm your age|inappropriate/.test(r)) {
    return 'This video is age-restricted; downloading it requires authenticated YouTube cookies (YTDLP_COOKIES).'
  }
  if (/sign in to confirm|not a bot|429|too many requests/.test(r)) {
    return (
      'YouTube is blocking automated downloads for this video right now (bot check / rate limit). ' +
      'This is fixed with authenticated YouTube cookies (YTDLP_COOKIES) on the worker — a signed-in ' +
      'session that YouTube trusts. If cookies are already set, they may have expired; refresh them. ' +
      'You can also wait a few minutes and retry.'
    )
  }
  if (/private video/.test(r)) return 'This video is private, so it can’t be downloaded.'
  if (/members-only|join this channel/.test(r)) return 'This is a members-only video, so it can’t be downloaded.'
  if (/video unavailable|has been removed|no longer available|not available in your/.test(r)) {
    return 'This video is unavailable (removed, private, or region-blocked).'
  }
  if (/requested format is not available|no video formats/.test(r)) {
    return 'No downloadable video format was available for this URL.'
  }
  if (/unsupported url|is not a valid url/.test(r)) return 'That link isn’t a supported video URL.'
  /* Unknown — keep the real tail so failures are never opaque again. */
  const tail = raw.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 400)
  return `Could not download the video. ${tail}`.trim()
}

/** Run a yt-dlp download, re-throwing failures as a classified, user-safe error. */
async function runYtdlp(bin: string, args: string[], onLine: (line: string) => void): Promise<void> {
  try {
    await runWithProgress(bin, args, onLine)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    throw new YoutubeDownloadError(classifyYoutubeError(raw))
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: parseYouTubeVideoId, youtube video id, url parse
 *
 * WHAT:  Extract the 11-char YouTube video id straight from the URL (youtu.be,
 *        watch?v=, /shorts/, /embed/, /live/, /v/), with a stable hash fallback.
 * WHY:   Avoids a SEPARATE yt-dlp `--print id` extraction. That extra probe was a
 *        second, retry-less YouTube hit that 429'd FIRST on datacenter IPs and
 *        failed the whole AI job before the download began — while the manual path
 *        (which never probed) kept working. The id is already in the URL; no
 *        network round-trip is needed.
 * WHERE: resolveYoutube (this file). The value becomes ClipJob.externalVideoId.
 */
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/
export function parseYouTubeVideoId(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www|m|music)\./, '').toLowerCase()
    let candidate: string | undefined
    if (host === 'youtu.be') {
      candidate = u.pathname.split('/').filter(Boolean)[0]
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) {
        candidate = v
      } else {
        const parts = u.pathname.split('/').filter(Boolean)
        const kind = parts[0]
        if (kind && ['shorts', 'embed', 'live', 'v'].includes(kind)) candidate = parts[1]
      }
    }
    if (candidate && YT_ID_RE.test(candidate)) return candidate
  } catch {
    /* not a parseable URL — fall through to the stable hash */
  }
  return 'yt-' + createHash('sha256').update(url).digest('hex').slice(0, 10)
}

/**
 * Base flags applied to EVERY yt-dlp call (the download + manual section fetch).
 * - `--ignore-config`: run HERMETIC — never inherit the machine's global
 *   ~/.config/yt-dlp/config. A dev's personal config (cookies-from-browser,
 *   -P/-o playlist templates, --download-archive, --embed-*) would otherwise
 *   hijack the pipeline's controlled invocation and fail the download.
 * - cookies / proxy: the two levers that beat YouTube's datacenter-IP
 *   bot-blocking / HTTP 429. The cookies file is written once from YTDLP_COOKIES
 *   and reused (memoised) across jobs.
 */
let cookiesPath: string | undefined | null = null
function ytdlpAuthArgs(): string[] {
  if (cookiesPath === null) {
    const raw = mediaConfig.download.cookies
    if (raw) {
      const filePath = path.join(os.tmpdir(), 'cliptic-yt-cookies.txt')
      fs.writeFileSync(filePath, raw.endsWith('\n') ? raw : raw + '\n', { mode: 0o600 })
      cookiesPath = filePath
    } else {
      cookiesPath = undefined
    }
  }
  const args: string[] = ['--ignore-config']
  if (cookiesPath) args.push('--cookies', cookiesPath)
  if (mediaConfig.download.proxy) args.push('--proxy', mediaConfig.download.proxy)
  /* PO token: only when a provider is configured (worker container). Locally
   * this is unset, so yt-dlp behaves exactly as before. */
  if (mediaConfig.download.potBaseUrl) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${mediaConfig.download.potBaseUrl}`)
  }
  /* EJS challenge solver: YouTube now requires solving a JS "n challenge" to get
   * working format URLs — without it every download fails with "no downloadable
   * format". yt-dlp fetches + caches the solver once (needs the Deno runtime the
   * worker image ships). This is the current keystone of YouTube extraction. */
  if (mediaConfig.download.remoteComponents) {
    args.push('--remote-components', mediaConfig.download.remoteComponents)
  }
  return args
}

export interface ResolveSourceParams {
  sourceType: 'youtube' | 'upload'
  /** Per-job scratch directory (owned + cleaned up by the worker). */
  scratchDir: string
  /** youtube: the pasted URL. */
  url?: string
  /** upload: local path to the file the worker downloaded from R2. */
  localPath?: string
  /** Optional stable id override (e.g. ClipJob.externalVideoId). */
  videoId?: string
  /** Called with the download percentage (0–100) so the UI can show real progress. */
  onProgress?: (pct: number) => void
}

/**
 * Common yt-dlp flags: throttle mitigation + aria2c multi-connection (when
 * available) + optional player_client override. aria2c's parallel connections
 * are the primary fix for YouTube CDN throttling; --throttled-rate is the
 * native fallback (re-extracts a fresh URL when a single stream is throttled).
 */
function ytdlpNetworkArgs(): string[] {
  const { downloader, playerClient } = mediaConfig.download
  const args: string[] = [
    '--newline',
    '--throttled-rate',
    '100K',
    '--retries',
    '10',
    /* Bot-wall resilience: retry the EXTRACTION step (not just the download)
     * and sleep between attempts so a transient HTTP 429 self-recovers instead
     * of failing the whole job. */
    '--extractor-retries',
    '3',
    '--retry-sleep',
    'http:exp=2:30',
    '--sleep-requests',
    '1',
    '--concurrent-fragments',
    '4',
    ...ytdlpAuthArgs(),
  ]
  const useAria = downloader === 'aria2c' || (downloader === 'auto' && commandExists('aria2c'))
  if (useAria) {
    args.push('--downloader', 'aria2c', '--downloader-args', 'aria2c:-x16 -s16 -k1M')
  }
  if (playerClient) {
    args.push('--extractor-args', `youtube:player_client=${playerClient}`)
  }
  return args
}

/**
 * YouTube: download the video ONCE at a capped resolution, then extract audio
 * for transcription. Every clip is later cut from this LOCAL file — no per-clip
 * section re-download (the old design fetched from YouTube 1 + N times). This is
 * the single biggest speed win; combined with aria2c it also crushes throttling.
 */
async function resolveYoutube(params: ResolveSourceParams): Promise<Source> {
  const { url, scratchDir } = params
  if (!url) throw new Error('resolveSource: YouTube source requires a url.')

  const bin = mediaConfig.download.ytdlpBin
  /* Derive the id from the URL — NO extra yt-dlp extraction. The old `--print id`
   * probe was a second, retry-less YouTube hit that 429'd first on datacenter IPs
   * (manual mode never probed, which is why it kept working). */
  const videoId = params.videoId ?? parseYouTubeVideoId(url)

  const maxHeight = mediaConfig.download.maxHeight
  const videoPath = path.join(scratchDir, 'source.mp4')
  const audioPath = path.join(scratchDir, 'audio.mp3')

  log(`downloading source once (≤${maxHeight}p): ${url}`)
  await runYtdlp(
    bin,
    [
      '-f',
      `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]/b[height<=${maxHeight}][ext=mp4]/b[height<=${maxHeight}]/b`,
      '--merge-output-format',
      'mp4',
      ...ytdlpNetworkArgs(),
      '-o',
      videoPath,
      url,
    ],
    (line) => {
      const match = line.match(/\[download\]\s+([\d.]+)%/)
      if (match?.[1] && params.onProgress) params.onProgress(Number(match[1]))
    }
  )

  log('extracting audio for transcription')
  await extractAudioForTranscription(videoPath, audioPath)

  /* isLocal: true — the cut stage encodes clips straight from this local mp4. */
  return { videoId, sourceType: 'youtube', isLocal: true, videoSource: videoPath, audioPath, scratchDir }
}

/**
 * SOURCE OF TRUTH KEYWORDS: resolveYoutubeSection, download-sections, manual clip
 *
 * WHAT:  Download ONLY the [startSec, endSec] slice of a YouTube video (yt-dlp
 *        --download-sections via the ffmpeg downloader, keyframe-exact), extract
 *        its audio, and return a Source whose file IS that section (timeline 0..len).
 * WHY:   Manual clips are a precise short range — fetching just that slice is fast
 *        and cheap (no full-video download / transcribe / analyze). The cut stage
 *        then re-encodes [0, len] from this local section.
 * WHERE: The worker's manual-cut path (YouTube, no persisted source).
 */
export interface ResolveSectionParams {
  url: string
  startSec: number
  endSec: number
  scratchDir: string
  onProgress?: (pct: number) => void
}

export async function resolveYoutubeSection(params: ResolveSectionParams): Promise<Source> {
  const { url, scratchDir } = params
  const bin = mediaConfig.download.ytdlpBin
  const maxHeight = mediaConfig.download.maxHeight
  const start = Math.max(0, params.startSec)
  const end = Math.max(start + 0.5, params.endSec)
  const videoPath = path.join(scratchDir, 'section.mp4')
  const audioPath = path.join(scratchDir, 'section-audio.mp3')

  log(`downloading section ${start.toFixed(1)}–${end.toFixed(1)}s (≤${maxHeight}p): ${url}`)
  await runYtdlp(
    bin,
    [
      '-f',
      `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]/b[height<=${maxHeight}][ext=mp4]/b[height<=${maxHeight}]/b`,
      /* ffmpeg downloader fetches only the section's byte ranges; force-keyframes
       * makes the cut boundaries exact (slight re-encode, cheap for a short clip). */
      '--downloader',
      'ffmpeg',
      '--download-sections',
      `*${start.toFixed(2)}-${end.toFixed(2)}`,
      '--force-keyframes-at-cuts',
      '--merge-output-format',
      'mp4',
      '--newline',
      '--retries',
      '10',
      /* Same bot-wall resilience as the full download (survives transient 429). */
      '--extractor-retries',
      '3',
      '--retry-sleep',
      'http:exp=2:30',
      ...ytdlpAuthArgs(),
      '-o',
      videoPath,
      url,
    ],
    (line) => {
      const match = line.match(/\[download\]\s+([\d.]+)%/)
      if (match?.[1] && params.onProgress) params.onProgress(Number(match[1]))
    }
  )

  /* Section audio (short → fast) so the manual clip's AI title can be transcribed. */
  await extractAudioForTranscription(videoPath, audioPath)

  const videoId = 'section-' + createHash('sha256').update(`${url}:${start}:${end}`).digest('hex').slice(0, 10)
  return { videoId, sourceType: 'youtube', isLocal: true, videoSource: videoPath, audioPath, scratchDir }
}

/** Uploaded file (already local on the worker): extract audio, cut from it directly. */
async function resolveUpload(params: ResolveSourceParams): Promise<Source> {
  const { localPath, scratchDir } = params
  if (!localPath) throw new Error('resolveSource: upload source requires a localPath.')

  const videoId =
    params.videoId ?? 'upload-' + createHash('sha256').update(localPath).digest('hex').slice(0, 10)
  const audioPath = path.join(scratchDir, 'audio.mp3')

  log(`extracting audio from uploaded file: ${localPath}`)
  await extractAudioForTranscription(localPath, audioPath)

  return { videoId, sourceType: 'upload', isLocal: true, videoSource: localPath, audioPath, scratchDir }
}

/** Resolve any input into a Source. */
export async function resolveSource(params: ResolveSourceParams): Promise<Source> {
  return params.sourceType === 'youtube' ? resolveYoutube(params) : resolveUpload(params)
}
