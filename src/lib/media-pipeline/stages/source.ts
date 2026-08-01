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
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mediaConfig } from '../config'
import { capture, runWithProgress, commandExists } from '../lib/exec'
import { createLogger } from '../lib/log'
import { extractAudioForTranscription } from '../lib/media'
import type { Source } from '../types'

const log = createLogger('source')

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
    '--concurrent-fragments',
    '4',
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
  const videoId = params.videoId ?? (await capture(bin, ['--print', 'id', '--no-download', url]))
  if (!videoId) throw new Error(`Could not resolve a video id for: ${url}`)

  const maxHeight = mediaConfig.download.maxHeight
  const videoPath = path.join(scratchDir, 'source.mp4')
  const audioPath = path.join(scratchDir, 'audio.mp3')

  log(`downloading source once (≤${maxHeight}p): ${url}`)
  await runWithProgress(
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
