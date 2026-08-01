/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: cut, OnClipReady, snapToWordGap, encodeClip
 *
 * WHAT:  STAGE 4 — turn chosen ranges into clip files (+ poster thumbnails),
 *        cutting from the already-downloaded LOCAL source, in PARALLEL, and
 *        invoking `onClip` the moment each clip is ready so the worker can
 *        upload + persist it immediately (time-to-first-clip / streaming).
 * WHY:   Boundaries snap to word gaps (silence between words) so clips don't
 *        start/end mid-word. Clips are re-encoded frame-accurately (caption-
 *        ready); speed comes from input-seek + bounded concurrency, not from
 *        stream-copy (which would misalign cuts). No per-clip network fetch.
 * WHERE: Called by the clip worker processor.
 */
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { run } from '../lib/exec'
import { createLogger } from '../lib/log'
import { generateThumbnail } from '../lib/media'
import { mediaConfig } from '../config'
import type { Source, ClipRange, ClipResult, Transcript, Word } from '../types'

const log = createLogger('cut')

const SNAP_WINDOW_SEC = 0.7 // search this far around a boundary for a word gap

/**
 * SOURCE OF TRUTH KEYWORDS: OnClipReady
 *
 * WHAT:  Called with each clip the instant it finishes cutting, plus the running
 *        done/total counts — so the worker streams clips to the UI as they land.
 */
export type OnClipReady = (result: ClipResult, done: number, total: number) => Promise<void>

/** Move `t` to the nearest mid-point of a word gap within the window, if any. */
function snapToWordGap(t: number, words: Word[]): number {
  let best = t
  let bestDist = SNAP_WINDOW_SEC + 1
  for (let i = 0; i < words.length - 1; i++) {
    const current = words[i]
    const next = words[i + 1]
    if (!current || !next) continue
    const gapStart = current.end
    const gapEnd = next.start
    if (gapEnd <= gapStart) continue // no gap (or overlapping timestamps)
    const mid = (gapStart + gapEnd) / 2
    const dist = Math.abs(mid - t)
    if (dist <= SNAP_WINDOW_SEC && dist < bestDist) {
      best = mid
      bestDist = dist
    }
  }
  return best
}

function snapRange(range: ClipRange, transcript?: Transcript): { start: number; end: number } {
  if (!transcript?.words.length) return { start: range.start, end: range.end }
  const start = snapToWordGap(range.start, transcript.words)
  const end = snapToWordGap(range.end, transcript.words)
  return end - start > 1 ? { start, end } : { start: range.start, end: range.end }
}

/**
 * Re-encode a precise [inPoint, outPoint] slice of `input` into `output`.
 * `-ss` BEFORE `-i` is an INPUT seek — fast even deep into a long local file
 * (seeks to the nearest keyframe, then re-encodes frame-accurately from there).
 * `-t duration` bounds the segment. Frame-accurate + fast; preset is tunable.
 */
async function encodeClip(input: string, inPoint: number, outPoint: number, output: string): Promise<void> {
  const duration = Math.max(0.1, outPoint - inPoint)
  await run('ffmpeg', [
    '-y',
    '-ss',
    inPoint.toFixed(3),
    '-i',
    input,
    '-t',
    duration.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    mediaConfig.encode.preset,
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    output,
  ])
}

/** Cut + thumbnail one clip from the local source. */
async function encodeOneClip(
  source: Source,
  range: ClipRange,
  index: number,
  outDir: string,
  transcript: Transcript | undefined
): Promise<ClipResult> {
  const { start, end } = snapRange(range, transcript)
  const padded = String(index).padStart(2, '0')
  const clipPath = path.join(outDir, `clip_${padded}.mp4`)

  await encodeClip(source.videoSource, start, end, clipPath)

  // Poster thumbnail — best-effort; a failure here must not fail the clip.
  let thumbnailPath: string | undefined
  const thumbCandidate = path.join(outDir, `clip_${padded}.jpg`)
  try {
    await generateThumbnail(clipPath, thumbCandidate, Math.min(1, (end - start) / 2))
    thumbnailPath = thumbCandidate
  } catch (err) {
    log(`thumbnail failed for clip ${index} (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
  }

  const { size } = await stat(clipPath)
  return {
    index,
    path: clipPath,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    sizeBytes: size,
    range: { ...range, start, end },
  }
}

/**
 * Cut all ranges into clip files under `outDir`, `concurrency` at a time.
 * `onClip` fires per finished clip (best-first order preserved) so the worker
 * uploads + persists it immediately. Returns all results.
 */
export async function cut(
  source: Source,
  ranges: ClipRange[],
  transcript: Transcript | undefined,
  outDir: string,
  onClip?: OnClipReady
): Promise<ClipResult[]> {
  const total = ranges.length
  const concurrency = Math.max(1, Math.min(mediaConfig.cut.concurrency, total))
  const results: Array<ClipResult | undefined> = new Array(total)
  let nextIndex = 0
  let completed = 0

  async function pump(): Promise<void> {
    for (;;) {
      const i = nextIndex
      nextIndex += 1
      if (i >= total) return
      const range = ranges[i]
      if (!range) continue
      const result = await encodeOneClip(source, range, i + 1, outDir, transcript)
      results[i] = result
      completed += 1
      log(`clip ${completed}/${total} ready`)
      if (onClip) await onClip(result, completed, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => pump()))

  const finished = results.filter((r): r is ClipResult => r !== undefined)
  log(`done: ${finished.length} clips in ${outDir} (concurrency ${concurrency})`)
  return finished
}
