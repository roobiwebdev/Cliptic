/**
 * SOURCE OF TRUTH KEYWORDS: FilmCursor, FilmCursorProps, cursor arrow,
 *   I-beam, pressed cursor, film pointer, isPressed
 *
 * WHAT:  The film's drawn mouse cursor (arrow or I-beam), pressed state scaling
 *        it to 0.86, coloured with theme tokens.
 * WHY:   A pure function of position + state so it seeks and loops exactly.
 * WHERE: Film scenes (landing/hero-film/scene.tsx).
 */

import type { FilmPoint } from '@/lib/types'

export interface FilmCursorProps {
  at: FilmPoint
  pressed: boolean
  kind?: 'arrow' | 'text'
}

/** True from 60 ms before to 120 ms after any click time. */
export function isPressed(t: number, clicks: readonly number[]): boolean {
  return clicks.some((c) => t >= c - 60 && t <= c + 120)
}

export function FilmCursor({ at, pressed, kind = 'arrow' }: FilmCursorProps) {
  // The arrow's hotspot is its tip (4, 3); the I-beam is centred.
  const ox = kind === 'arrow' ? -4 : -8
  const oy = kind === 'arrow' ? -3 : -12
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 z-50 drop-shadow-md"
      style={{
        transform: `translate(${at.x + ox}px, ${at.y + oy}px) scale(${pressed ? 0.86 : 1})`,
        transformOrigin: `${-ox}px ${-oy}px`,
      }}
    >
      {kind === 'arrow' ? (
        <svg width="30" height="34" viewBox="0 0 30 34">
          <path
            d="M4 3 L4 27 L10.2 21.4 L14.4 31 L18.6 29.2 L14.5 19.8 L23 19.8 Z"
            className="fill-foreground stroke-background"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="16" height="24" viewBox="0 0 16 24">
          <path
            d="M4 2h8M8 2v20M4 22h8"
            className="stroke-foreground"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      )}
    </div>
  )
}
