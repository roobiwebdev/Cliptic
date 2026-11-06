/**
 * SOURCE OF TRUTH KEYWORDS: clamp, lerp, span, easeOut, easeInOut, easeOutBack,
 *   envelope, along, random, film easing
 *
 * WHAT:  Pure easing and interpolation helpers for the product film.
 * WHY:   The film is a pure function of time; every tween, fade and cursor path
 *        is computed from `t` with these, so seeking and looping are exact.
 * WHERE: Film scenes (landing/hero-film) and the Showcase controls.
 */

import type { FilmKeyframe, FilmPoint } from '@/lib/types'

export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x))

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p

/** Progress of `t` through [start, end], clamped to 0..1. */
export const span = (t: number, start: number, end: number): number =>
  clamp((t - start) / (end - start))

export const easeOut = (p: number): number => 1 - (1 - p) ** 3

export const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2

/** Ease out with a slight overshoot, for things that pop into place. */
export const easeOutBack = (p: number): number => {
  const k = 1.6
  return 1 + (k + 1) * (p - 1) ** 3 + k * (p - 1) ** 2
}

/** 0 → 1 over [inStart, inEnd], then 1 → 0 over [outStart, outEnd]. */
export const envelope = (
  t: number,
  inStart: number,
  inEnd: number,
  outStart: number,
  outEnd: number
): number => Math.min(easeOut(span(t, inStart, inEnd)), 1 - easeInOut(span(t, outStart, outEnd)))

/** The point at `t` along `frames`, easing between each pair and holding the last. */
export function along(frames: readonly FilmKeyframe[], t: number): FilmPoint {
  const next = frames.findIndex((f) => f.t > t)
  const i = next === -1 ? frames.length - 1 : Math.max(0, next - 1)
  const a = frames[i]
  if (!a) return { x: 0, y: 0 }
  const b = frames[i + 1] ?? a
  const p = b === a ? 0 : easeInOut(span(t, a.t, b.t))
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) }
}

/** Deterministic pseudo-random numbers in [0, 1), so every render draws the same data. */
export function random(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let r = Math.imul(s ^ (s >>> 15), 1 | s)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
