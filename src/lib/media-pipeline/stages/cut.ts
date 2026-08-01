/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: cut, snapToWordGap, encodeClip, downloadSection
 *
 * WHAT:  STAGE 4 — turn chosen ranges into clip files with FFmpeg, plus a poster
 *        thumbnail per clip. For YouTube we fetch ONLY each padded section
 *        (yt-dlp --download-sections); uploads cut directly from the local file.
 * WHY:   Boundaries snap to word gaps (silence between words) so clips don't
 *        start/end mid-word. Clips are re-encoded (frame-accurate, caption-ready
 *        later). Output lands in `outDir` on scratch; the worker uploads to R2.
 * WHERE: Called by the clip worker processor.
 */
import path from 'node:path'
import { rm, stat } from 'node:fs/promises'
import { run } from '../lib/exec'
import { createLogger } from '../lib/log'
import { generateThumbnail } from '../lib/media'
import { mediaConfig } from '../config'
import type { Source, ClipRange, ClipResult, Transcript, Word } from '../types'

const log = createLogger('cut')

const SNAP_WINDOW_SEC = 0.7 // search this far around a boundary for a word gap

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
    if (gapEnd <= gapStart) continue
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

/** Re-encode a precise [inPoint, outPoint] slice of `input` into `output`. */
async function encodeClip(input: string, inPoint: number, outPoint: number, output: string): Promise<void> {
  await run('ffmpeg', [
    '-y',
    '-i',
    input,
    '-ss',
    inPoint.toFixed(3),
    '-to',
    outPoint.toFixed(3),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
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

/** Download only the padded [start, end] section of a YouTube video to `output`. */
async function downloadSection(url: string, start: number, end: number, output: string): Promise<void> {
  await run('yt-dlp', [
    '-f',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    '--download-sections',
    `*${start.toFixed(2)}-${end.toFixed(2)}`,
    '--force-keyframes-at-cuts',
    '--merge-output-format',
    'mp4',
    '-o',
    output,
    url,
  ])
}

/**
 * Cut all ranges into clip files (+ thumbnails) under `outDir`.
 * Returns local ClipResults; the worker uploads them to R2 and writes rows.
 */
export async function cut(
  source: Source,
  ranges: ClipRange[],
  transcript: Transcript | undefined,
  outDir: string
): Promise<ClipResult[]> {
  const duration = transcript?.duration
  const pad = mediaConfig.sectionPaddingSec
  const results: ClipResult[] = []

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    if (!range) continue
    const index = i + 1
    const { start, end } = snapRange(range, transcript)
    const clipPath = path.join(outDir, `clip_${String(index).padStart(2, '0')}.mp4`)

    if (source.isLocal) {
      log(`clip ${index}/${ranges.length} [${start.toFixed(1)}-${end.toFixed(1)}s] (local)`)
      await encodeClip(source.videoSource, start, end, clipPath)
    } else {
      const secStart = Math.max(0, start - pad)
      const secEnd = duration ? Math.min(duration, end + pad) : end + pad
      const sectionPath = path.join(outDir, `.section_${String(index).padStart(2, '0')}.mp4`)
      log(`clip ${index}/${ranges.length} [${start.toFixed(1)}-${end.toFixed(1)}s] — fetching section`)
      await downloadSection(source.videoSource, secStart, secEnd, sectionPath)
      await encodeClip(sectionPath, start - secStart, end - secStart, clipPath)
      await rm(sectionPath, { force: true })
    }

    // Poster thumbnail — best-effort; a failure here must not fail the clip.
    let thumbnailPath: string | undefined
    const thumbCandidate = path.join(outDir, `clip_${String(index).padStart(2, '0')}.jpg`)
    try {
      const clipLen = end - start
      await generateThumbnail(clipPath, thumbCandidate, Math.min(1, clipLen / 2))
      thumbnailPath = thumbCandidate
    } catch (err) {
      log(`thumbnail failed for clip ${index} (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
    }

    const { size } = await stat(clipPath)
    results.push({
      index,
      path: clipPath,
      ...(thumbnailPath ? { thumbnailPath } : {}),
      sizeBytes: size,
      range: { ...range, start, end },
    })
  }

  log(`done: ${results.length} clips in ${outDir}`)
  return results
}
