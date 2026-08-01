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
import { unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { run, capture } from '../lib/exec'
import { createLogger } from '../lib/log'
import { extractAudio16kMono } from '../lib/media'
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
}

/** YouTube (or any yt-dlp URL): audio-only download → 16 kHz mono WAV. */
async function resolveYoutube(params: ResolveSourceParams): Promise<Source> {
  const { url, scratchDir } = params
  if (!url) throw new Error('resolveSource: YouTube source requires a url.')

  const videoId = params.videoId ?? (await capture('yt-dlp', ['--print', 'id', '--no-download', url]))
  if (!videoId) throw new Error(`Could not resolve a video id for: ${url}`)

  const wav = path.join(scratchDir, 'audio.wav')
  const srcTemplate = path.join(scratchDir, 'source-audio.%(ext)s')

  log(`downloading audio-only: ${url}`)
  await run('yt-dlp', ['-f', 'ba', '-o', srcTemplate, url])

  const srcPath = await capture('yt-dlp', [
    '--print',
    'filename',
    '--no-download',
    '-f',
    'ba',
    '-o',
    srcTemplate,
    url,
  ])

  log('transcoding → 16 kHz mono wav')
  await extractAudio16kMono(srcPath, wav)
  await unlink(srcPath).catch(() => {})

  return { videoId, sourceType: 'youtube', isLocal: false, videoSource: url, audioPath: wav, scratchDir }
}

/** Uploaded file (already local on the worker): extract audio, cut from it directly. */
async function resolveUpload(params: ResolveSourceParams): Promise<Source> {
  const { localPath, scratchDir } = params
  if (!localPath) throw new Error('resolveSource: upload source requires a localPath.')

  const videoId =
    params.videoId ?? 'upload-' + createHash('sha256').update(localPath).digest('hex').slice(0, 10)
  const wav = path.join(scratchDir, 'audio.wav')

  log(`extracting audio from uploaded file: ${localPath}`)
  await extractAudio16kMono(localPath, wav)

  return { videoId, sourceType: 'upload', isLocal: true, videoSource: localPath, audioPath: wav, scratchDir }
}

/** Resolve any input into a Source. */
export async function resolveSource(params: ResolveSourceParams): Promise<Source> {
  return params.sourceType === 'youtube' ? resolveYoutube(params) : resolveUpload(params)
}
