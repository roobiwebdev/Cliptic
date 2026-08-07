/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: cut, OnClipReady, settleIntoSilence, snapToWordGap,
 *   encodeClip, silence-settled boundaries
 *
 * WHAT:  STAGE 4 — turn chosen ranges into clip files (+ poster thumbnails),
 *        cutting from the already-downloaded LOCAL source, in PARALLEL, and
 *        invoking `onClip` the moment each clip is ready so the worker can
 *        upload + persist it immediately (time-to-first-clip / streaming).
 * WHY:   Boundaries settle into REAL audio silence (ffmpeg-detected — catches
 *        breaths/laughs/music the transcript can't see, in any language), with
 *        transcript word gaps as the fallback, so clips never start/end mid-word.
 *        Clips are re-encoded frame-accurately (caption-ready); speed comes from
 *        input-seek + bounded concurrency, not from stream-copy (which would
 *        misalign cuts). No per-clip network fetch.
 * WHERE: Called by the clip worker processor.
 */
import path from 'node:path'
import { stat } from 'node:fs/promises'
import { run } from '../lib/exec'
import { createLogger } from '../lib/log'
import { generateThumbnail } from '../lib/media'
import { detectSilences, type Silence } from '../lib/silence'
import { mediaConfig } from '../config'
import type { Source, ClipRange, ClipResult, Transcript, Word } from '../types'

const log = createLogger('cut')

const SNAP_WINDOW_SEC = 0.7 // search this far around a boundary for a word gap
const SETTLE_WINDOW_SEC = 0.6 // search this far around a boundary for real silence
const SILENCE_MIN_SEC = 0.25 // shortest audio silence worth settling into
const SILENCE_INSET_SEC = 0.05 // keep the cut slightly inside the silence edge

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

/**
 * SOURCE OF TRUTH KEYWORDS: settleIntoSilence, silence-settled boundary
 *
 * WHAT:  Move a boundary into REAL detected silence near `t` (or keep it if it
 *        already sits in silence). Word-guarded: a start never moves past the
 *        first word it must keep; an end never moves before the last word.
 * WHY:   Audio truth beats transcript timing — Whisper word edges drift, but a
 *        cut inside actual silence always sounds clean, in any language.
 */
function settleIntoSilence(
  t: number,
  kind: 'start' | 'end',
  words: Word[],
  silences: Silence[]
): number | null {
  if (silences.some((s) => t >= s.start && t <= s.end)) return t // already clean

  const firstWordAfter = words.find((w) => w.start >= t)
  let lastWordBefore: Word | undefined
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i]
    if (w && w.end <= t) {
      lastWordBefore = w
      break
    }
  }

  let best: number | null = null
  let bestDist = Infinity
  for (const s of silences) {
    const lo = s.start + SILENCE_INSET_SEC
    const hi = s.end - SILENCE_INSET_SEC
    if (lo > hi) continue
    const point = Math.min(Math.max(t, lo), hi) // nearest in-silence point to t
    const dist = Math.abs(point - t)
    if (dist > SETTLE_WINDOW_SEC || dist >= bestDist) continue
    // Word guards: never settle a cut onto speech the clip must keep.
    if (kind === 'start' && firstWordAfter && point > firstWordAfter.start) continue
    if (kind === 'end' && lastWordBefore && point < lastWordBefore.end) continue
    best = point
    bestDist = dist
  }
  return best
}

function snapRange(
  range: ClipRange,
  transcript: Transcript | undefined,
  silences: Silence[]
): { start: number; end: number } {
  if (!transcript?.words.length) return { start: range.start, end: range.end }
  const words = transcript.words
  const start = settleIntoSilence(range.start, 'start', words, silences) ?? snapToWordGap(range.start, words)
  const end = settleIntoSilence(range.end, 'end', words, silences) ?? snapToWordGap(range.end, words)
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
  transcript: Transcript | undefined,
  silences: Silence[]
): Promise<ClipResult> {
  const { start, end } = snapRange(range, transcript, silences)
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

  /* One silence pass for ALL boundaries — best-effort; word-gap snapping
   * remains the fallback when audio is unavailable or detection fails. */
  let silences: Silence[] = []
  if (source.audioPath) {
    try {
      silences = await detectSilences(source.audioPath, -30, SILENCE_MIN_SEC)
      log(`detected ${silences.length} silences for boundary settling`)
    } catch (err) {
      log(`silence detection failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function pump(): Promise<void> {
    for (;;) {
      const i = nextIndex
      nextIndex += 1
      if (i >= total) return
      const range = ranges[i]
      if (!range) continue
      const result = await encodeOneClip(source, range, i + 1, outDir, transcript, silences)
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
