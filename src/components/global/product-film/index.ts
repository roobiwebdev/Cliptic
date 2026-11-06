/**
 * SOURCE OF TRUTH KEYWORDS: product-film barrel, FilmShowcase, FilmCursor,
 *   FilmPlayer, ease helpers, filmCaption, filmCue
 *
 * WHAT:  Public surface of the product-film engine.
 * WHY:   Films import the engine from one place.
 * WHERE: src/components/global/landing/hero-film/*.
 */

export { FilmShowcase } from './film-showcase'
export type { FilmShowcaseProps } from './film-showcase'
export { FilmCursor, isPressed } from './film-cursor'
export type { FilmCursorProps } from './film-cursor'
export { FilmPlayer } from './player'
export { clamp, lerp, span, easeOut, easeInOut, easeOutBack, envelope, along, random } from './ease'
export { filmCaption, filmCue } from './script-helpers'
export { rect, popIn, fadeRise, spinStyle } from './film-style'
