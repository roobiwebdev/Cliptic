/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: probeDuration, extractAudio16kMono, generateThumbnail
 *
 * WHAT:  Small ffprobe/ffmpeg helpers shared across stages, plus poster-frame
 *        thumbnail generation for each rendered clip.
 * WHY:   16 kHz mono WAV is exactly what Whisper expects; thumbnails give the
 *        dashboard grid a poster image per clip (Cliptic v1 requirement).
 * WHERE: source/cut stages + the worker.
 */

import { run, capture } from './exec'

/** Duration of a media file in seconds (via ffprobe). */
export async function probeDuration(mediaPath: string): Promise<number> {
  const out = await capture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    mediaPath,
  ])
  const seconds = Number(out)
  if (!Number.isFinite(seconds)) {
    throw new Error(`ffprobe returned a non-numeric duration for ${mediaPath}: "${out}"`)
  }
  return seconds
}

/** Extract/transcode any media into 16 kHz mono PCM WAV — what Whisper expects. */
export async function extractAudio16kMono(inputPath: string, outPath: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn', // drop any video stream
    '-ar',
    '16000', // 16 kHz
    '-ac',
    '1', // mono
    '-c:a',
    'pcm_s16le',
    outPath,
  ])
}

/**
 * Extract a COMPACT mono audio file (16 kHz mp3, low bitrate) for transcription.
 * Far smaller than PCM WAV — usually under Whisper's 25 MB cap so no chunking is
 * needed — while keeping the speech fidelity Whisper actually uses (it downsamples
 * to 16 kHz internally anyway). Word timestamps are unaffected by the codec.
 */
export async function extractAudioForTranscription(inputPath: string, outPath: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '32k',
    outPath,
  ])
}

/**
 * Grab a single poster frame from a clip (a moment in, so it isn't a black
 * intro frame), scaled to a reasonable thumbnail width. Best-effort: never
 * throws in a way that should fail the whole job (the caller decides).
 */
export async function generateThumbnail(
  clipPath: string,
  outPath: string,
  atSeconds = 1
): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-ss',
    atSeconds.toFixed(2),
    '-i',
    clipPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=640:-2',
    '-q:v',
    '4',
    outPath,
  ])
}
