/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: renderEditSpec, buildRenderFilters, OUTPUT_DIMENSIONS,
 *   RenderResult, RenderEditSpecParams, Render Engine, reframe, burned captions,
 *   applier pipeline, edit spec render
 *
 * WHAT:  The Render Engine — applies a validated EditSpec to one already-cut clip
 *        mp4 and writes a new edited mp4 (+ poster). v1 appliers, in a FIXED order:
 *        reframe (crop → aspect, single or split top/bottom) then captions (burned
 *        via libass). Each future tool is one more applier appended here.
 * WHY:   "One render engine, many spec fields." buildRenderFilters is a PURE
 *        ffmpeg-filtergraph builder (unit-tested); renderEditSpec is the thin
 *        impure runner that shells out and makes the poster. Reuses the same
 *        encode knobs as the cut stage (libx264/crf20/preset) so edited clips
 *        match AI-clip quality. Renders from the clip mp4 (v1 decision); re-cut
 *        from the persisted source is a later spec option.
 * WHERE: Called by src/worker/processors/clip-render.processor.ts. Caption words
 *        are supplied clip-relative by the processor (from the cached transcript).
 */

import path from 'node:path'
import { writeFile, stat } from 'node:fs/promises'
import { run } from '../lib/exec'
import { createLogger } from '../lib/log'
import { generateThumbnail, probeDuration } from '../lib/media'
import { mediaConfig } from '../config'
import type { Word } from '../types'
import {
  buildCaptionEvents,
  compileAss,
  type AssStyle,
  type CaptionWord,
} from '../captions/ass'
import type {
  AspectRatio,
  CaptionStyle,
  CropRegion,
  EditSpec,
  ReframeSpec,
} from '@/lib/types'

const log = createLogger('render')

/**
 * SOURCE OF TRUTH KEYWORDS: OUTPUT_DIMENSIONS
 *
 * WHAT:  Fixed output pixel dimensions per aspect (1080 short edge). Even on both
 *        axes (and halves) so yuv420p / vstack are always valid.
 */
export const OUTPUT_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
}

/** `crop=iw*W:ih*H:iw*X:ih*Y` from a normalized (0..1) region. */
function cropExpr(r: CropRegion): string {
  const f = (n: number): string => n.toFixed(6)
  return `crop=iw*${f(r.w)}:ih*${f(r.h)}:iw*${f(r.x)}:ih*${f(r.y)}`
}

/* Scale a crop to COVER the target box then center-crop to exact even dims — no
 * distortion even if the crop's aspect is slightly off the output's. */
function coverExpr(width: number, height: number): string {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`
}

/* Escape a filename for use inside an ffmpeg filtergraph value (the `ass=` arg). */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildRenderFilters
 *
 * WHAT:  PURE builder for the `-filter_complex` string + the final video label.
 *        single → one crop→cover; split → two crops→cover half-height→vstack;
 *        then an optional `ass` burn. This is the applier pipeline as a string.
 * WHY:   Deterministic and unit-testable without touching ffmpeg or the disk.
 */
export function buildRenderFilters(
  reframe: ReframeSpec,
  dims: { width: number; height: number },
  assPath?: string
): { filterComplex: string; videoLabel: string } {
  const { width, height } = dims
  const parts: string[] = []

  if (reframe.layout === 'split' && reframe.regions.length >= 2) {
    const top = reframe.regions[0]
    const bot = reframe.regions[1]
    /* Even half-height keeps yuv420p valid; the two halves stack to `height`. */
    const half = Math.floor(height / 2)
    const halfEven = half - (half % 2)
    if (top) parts.push(`[0:v]${cropExpr(top)},${coverExpr(width, halfEven)}[ctop]`)
    if (bot) parts.push(`[0:v]${cropExpr(bot)},${coverExpr(width, halfEven)}[cbot]`)
    parts.push(`[ctop][cbot]vstack=inputs=2[vframe]`)
  } else {
    const r = reframe.regions[0] ?? { x: 0, y: 0, w: 1, h: 1 }
    parts.push(`[0:v]${cropExpr(r)},${coverExpr(width, height)}[vframe]`)
  }

  let videoLabel = 'vframe'
  if (assPath) {
    parts.push(`[${videoLabel}]ass=${escapeFilterPath(assPath)}[vout]`)
    videoLabel = 'vout'
  }

  return { filterComplex: parts.join(';'), videoLabel }
}

/** Map the app CaptionStyle → ASS-domain style, sized to the output frame. */
function toAssStyle(style: CaptionStyle, dims: { width: number; height: number }): AssStyle {
  const alignment = style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2
  return {
    fontName: style.fontFamily,
    fontSizePx: Math.max(12, Math.round((dims.height * style.fontSizePct) / 100)),
    primaryColorHex: style.color,
    highlightColorHex: style.highlightColor,
    alignment,
    marginVPx: Math.round(dims.height * 0.06),
    karaoke: style.karaoke,
    bold: true,
  }
}

export interface RenderEditSpecParams {
  /** Local path to the source clip mp4 (already downloaded from R2). */
  inputPath: string
  spec: EditSpec
  /** Scratch dir the caller owns; the ASS file + outputs are written here. */
  outDir: string
  /** Clip-relative transcript words for captions (used when no edited segments). */
  captionWords?: Word[]
}

export interface RenderResult {
  outputPath: string
  thumbnailPath?: string
  sizeBytes: number
  durationSec: number
  width: number
  height: number
  aspect: AspectRatio
}

/**
 * SOURCE OF TRUTH KEYWORDS: renderEditSpec
 *
 * WHAT:  Apply the spec to `inputPath` and write `edited.mp4` (+ `edited.jpg`)
 *        under `outDir`. Returns the local paths + probed size/duration/dims.
 * WHY:   Single ffmpeg pass: reframe (+ optional caption burn) re-encoded with
 *        the shared encode preset; audio is stream-copied (untouched in v1).
 */
export async function renderEditSpec(params: RenderEditSpecParams): Promise<RenderResult> {
  const { inputPath, spec, outDir, captionWords } = params
  const dims = OUTPUT_DIMENSIONS[spec.reframe.aspect]

  // ── Captions applier: compile an ASS file when enabled and there's content ──
  let assPath: string | undefined
  if (spec.captions?.enabled) {
    const words: CaptionWord[] | undefined = captionWords?.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
    }))
    const events = buildCaptionEvents({
      ...(spec.captions.segments ? { segments: spec.captions.segments } : {}),
      ...(words ? { words } : {}),
      uppercase: spec.captions.style.uppercase,
      emoji: spec.captions.style.emoji,
    })
    if (events.length > 0) {
      const ass = compileAss(events, toAssStyle(spec.captions.style, dims), dims)
      assPath = path.join(outDir, 'captions.ass')
      await writeFile(assPath, ass, 'utf8')
    }
  }

  const { filterComplex, videoLabel } = buildRenderFilters(spec.reframe, dims, assPath)
  const outputPath = path.join(outDir, 'edited.mp4')

  log(`render ${spec.reframe.aspect} (${spec.reframe.layout})${assPath ? ' + captions' : ''}`)
  await run('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-filter_complex',
    filterComplex,
    '-map',
    `[${videoLabel}]`,
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    mediaConfig.encode.preset,
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ])

  // Poster — best-effort; a thumbnail failure must not fail the render.
  let thumbnailPath: string | undefined
  const thumbCandidate = path.join(outDir, 'edited.jpg')
  try {
    await generateThumbnail(outputPath, thumbCandidate, 0.5)
    thumbnailPath = thumbCandidate
  } catch (err) {
    log(`thumbnail failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`)
  }

  const { size } = await stat(outputPath)
  const durationSec = await probeDuration(outputPath).catch(() => 0)

  return {
    outputPath,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    sizeBytes: size,
    durationSec,
    width: dims.width,
    height: dims.height,
    aspect: spec.reframe.aspect,
  }
}
