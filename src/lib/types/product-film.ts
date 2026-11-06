/**
 * SOURCE OF TRUTH KEYWORDS: ProductFilm, FilmKeyframe, FilmCue, FilmSound,
 *   FilmCaption, FilmChapter, FilmPlayerSnapshot, FilmSoundPatch, FilmPoint,
 *   FilmRect, hero film types
 *
 * WHAT:  Types for the code-drawn landing "product film": the clock snapshot,
 *        cursor keyframes, chapters, captions, sound cues and synth patches.
 * WHY:   Custom types live under lib/types (CLAUDE.md). The film engine in
 *        components/global/product-film and each film's script share them.
 * WHERE: src/components/global/product-film/*, src/components/global/landing/hero-film/*.
 */

/** Every synthesized UI sound the film can play. */
export const FILM_SOUNDS = [
  'key',
  'sweep',
  'whoosh',
  'tick',
  'chime',
  'pop',
  'switch',
  'start',
  'stop',
] as const
export type FilmSound = (typeof FILM_SOUNDS)[number]

/** A point in stage pixels. */
export type FilmPoint = { x: number; y: number }

/** A rectangle in stage pixels. */
export type FilmRect = FilmPoint & { w: number; h: number }

/** A cursor position at a time (ms). */
export type FilmKeyframe = FilmPoint & { t: number }

/** A sound played when the clock passes `t`. `variant` nudges the pitch. */
export type FilmCue = { t: number; sound: FilmSound; variant?: number }

/** A chapter in the control bar; it runs until the next chapter's `t`. */
export type FilmChapter = { label: string; t: number }

/** A caption whose words light up one by one at `at`. */
export type FilmCaption = { start: number; end: number; words: { text: string; at: number }[] }

/** What the film renders right now. */
export type FilmPlayerSnapshot = {
  /** The time to render (the settled frame while reduced motion holds). */
  time: number
  paused: boolean
  sound: boolean
}

/** One layer of a synthesized sound: a tone (optionally gliding) or a filtered noise burst. */
export type FilmSoundLayer = (
  | { type: 'tone'; wave: OscillatorType; freq: number; to?: number; glide?: number }
  | { type: 'noise'; filter: BiquadFilterType; freq: number; to?: number; q?: number }
) & { at?: number; attack: number; decay: number; peak: number }

/** A synthesized sound: its layers plus how much goes to the short room delay. */
export type FilmSoundPatch = { layers: FilmSoundLayer[]; air?: number }
