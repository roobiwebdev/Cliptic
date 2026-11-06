/**
 * SOURCE OF TRUTH KEYWORDS: filmCaption, filmCue, word timing, caption words,
 *   sound cue, film script helpers
 *
 * WHAT:  Builders a film script uses: a caption whose words are spread across
 *        its window, and a sound cue.
 * WHY:   Keeps each film's script.ts declarative (timings and text only).
 * WHERE: src/components/global/landing/hero-film/script.ts.
 */

import type { FilmCaption, FilmCue, FilmSound } from '@/lib/types'

/** Spreads the words across [start, end], giving longer words more time. */
export function filmCaption(text: string, start: number, end: number): FilmCaption {
  const parts = text.split(' ')
  const weights = parts.map((w) => w.length + 2)
  const total = weights.reduce((a, b) => a + b, 0)
  let at = start
  const words = parts.map((w, i) => {
    const word = { text: w, at }
    at += ((end - start) * (weights[i] ?? 0)) / total
    return word
  })
  return { start, end, words }
}

/** A sound cue at `t`; `variant` nudges the pitch so repeats don't sound identical. */
export function filmCue(t: number, sound: FilmSound, variant?: number): FilmCue {
  return variant === undefined ? { t, sound } : { t, sound, variant }
}
