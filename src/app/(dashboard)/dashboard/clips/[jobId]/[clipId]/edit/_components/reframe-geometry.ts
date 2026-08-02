/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: aspectValue, regionRatio, maxFitRect, makeRegion,
 *   moveRegion, resizeRegion, defaultRegions, reframe crop geometry
 *
 * WHAT:  PURE geometry mapping between the output aspect/layout, the source video
 *        aspect, and the normalized crop rectangles (0..1) stored on the spec.
 * WHY:   The Editor's crop box must match the OUTPUT region's pixel aspect so the
 *        user sees exactly what the render keeps. Keeping this math pure lets the
 *        CropStage stay dumb and lets us unit-test the tricky ratio/clamp cases.
 * WHERE: Consumed by crop-stage.tsx and clip-editor.tsx.
 */

import type { AspectRatio, CropRegion, ReframeLayout } from '@/lib/types'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Output width/height for an aspect (e.g. 9:16 → 0.5625). */
export function aspectValue(aspect: AspectRatio): number {
  return aspect === '9:16' ? 9 / 16 : aspect === '1:1' ? 1 : 16 / 9
}

/**
 * The normalized crop w/h ratio so the box's on-screen shape equals the output
 * region's pixel aspect. Split stacks two regions, so each half is twice as wide
 * relative to its height (outW / (outH/2) = 2·aspect).
 */
export function regionRatio(
  aspect: AspectRatio,
  layout: ReframeLayout,
  videoAspect: number
): number {
  const outRegionAspect = layout === 'split' ? aspectValue(aspect) * 2 : aspectValue(aspect)
  return outRegionAspect / (videoAspect > 0 ? videoAspect : 1)
}

/** The largest normalized rect (each side ≤ 1) with w/h = ratio. */
export function maxFitRect(ratio: number): { w: number; h: number } {
  if (!Number.isFinite(ratio) || ratio <= 0) return { w: 1, h: 1 }
  return ratio >= 1 ? { w: 1, h: 1 / ratio } : { w: ratio, h: 1 }
}

/** A clamped region of the given ratio, centered at (cx,cy) and scaled by size (0..1]. */
export function makeRegion(ratio: number, cx = 0.5, cy = 0.5, size = 1): CropRegion {
  const base = maxFitRect(ratio)
  const w = clamp(base.w * size, 0.05, 1)
  const h = clamp(base.h * size, 0.05, 1)
  const x = clamp(cx - w / 2, 0, 1 - w)
  const y = clamp(cy - h / 2, 0, 1 - h)
  return { x, y, w, h }
}

/** Move a region to a new top-left, kept fully inside the frame. */
export function moveRegion(r: CropRegion, x: number, y: number): CropRegion {
  return { ...r, x: clamp(x, 0, 1 - r.w), y: clamp(y, 0, 1 - r.h) }
}

/** Re-size a region (keeping its center + ratio) to a new scale (0..1]. */
export function resizeRegion(r: CropRegion, ratio: number, size: number): CropRegion {
  return makeRegion(ratio, r.x + r.w / 2, r.y + r.h / 2, size)
}

/** The current scale of a region relative to its max-fit rect for the ratio (0..1]. */
export function regionSize(r: CropRegion, ratio: number): number {
  const base = maxFitRect(ratio)
  return base.w > 0 ? clamp(r.w / base.w, 0.05, 1) : 1
}

/** Default centered region(s) for a layout: one for single, two for split. */
export function defaultRegions(
  aspect: AspectRatio,
  layout: ReframeLayout,
  videoAspect: number
): CropRegion[] {
  const ratio = regionRatio(aspect, layout, videoAspect)
  if (layout === 'split') return [makeRegion(ratio, 0.5, 0.35), makeRegion(ratio, 0.5, 0.65)]
  return [makeRegion(ratio, 0.5, 0.5)]
}
