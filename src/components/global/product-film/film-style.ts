/**
 * SOURCE OF TRUTH KEYWORDS: popIn, fadeRise, rect, spinStyle, film styles,
 *   stage box, transform opacity
 *
 * WHAT:  Inline-style builders for film elements: place a box on the stage,
 *        pop it in with an overshoot, fade and rise it, spin an icon.
 * WHY:   Film motion uses only transform + opacity, computed from `t`; these
 *        keep every scene consistent and short.
 * WHERE: Film scenes (landing/hero-film/*).
 */

import type { CSSProperties } from 'react'

import type { FilmRect } from '@/lib/types'
import { easeOut, easeOutBack, span } from './ease'

/** Absolute placement of a stage rectangle. */
export function rect(r: FilmRect): CSSProperties {
  return { position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h }
}

/** Pops in from `rise` px below with a slight overshoot, starting at `at`. */
export function popIn(t: number, at: number, duration = 420, rise = 24) {
  const p = span(t, at, at + duration)
  const back = easeOutBack(p)
  return {
    opacity: easeOut(p),
    transform: `translateY(${(1 - back) * rise}px) scale(${0.96 + 0.04 * back})`,
  }
}

/** Opacity `o` with a small rise while it fades in. */
export function fadeRise(o: number, rise = 8): CSSProperties {
  return { opacity: o, transform: `translateY(${(1 - o) * rise}px)` }
}

/** A loader icon spinning on the film clock (one turn per 900 ms). */
export function spinStyle(t: number): CSSProperties {
  return { transform: `rotate(${((t % 900) / 900) * 360}deg)` }
}
