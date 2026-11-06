/**
 * SOURCE OF TRUTH KEYWORDS: FilmClipArt, clip thumbnail, burned captions,
 *   karaoke caption, speaker frame, hero film video frame
 *
 * WHAT:  A drawn video frame for a clip: a speaker against a soft studio
 *        backdrop, with burned-in captions where one word is highlighted.
 * WHY:   The film never ships video; this stands in for clip thumbnails and the
 *        9:16 preview, coloured only from theme tokens.
 * WHERE: hero-film/job-view.tsx (clip cards) and hero-film/payoff.tsx (9:16 preview).
 */

import { cn } from '@/lib/utils'

export interface FilmClipArtProps {
  /** Caption words currently on screen. */
  words: readonly string[]
  /** Index of the highlighted (spoken) word, or -1. */
  active: number
  /** Shifts the speaker and backdrop so each clip looks different. */
  variant: number
  /** Caption font size in px. */
  captionSize: number
  className?: string
}

const BACKDROPS = [
  'radial-gradient(90% 80% at 25% 15%, color-mix(in oklch, var(--chart-2) 45%, transparent), transparent 65%)',
  'radial-gradient(90% 80% at 80% 20%, color-mix(in oklch, var(--chart-1) 40%, transparent), transparent 65%)',
  'radial-gradient(90% 80% at 50% 0%, color-mix(in oklch, var(--chart-2) 30%, var(--chart-1) 20%), transparent 70%)',
] as const

export function FilmClipArt({ words, active, variant, captionSize, className }: FilmClipArtProps) {
  const shift = [0, 18, -14][variant % 3] ?? 0
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{
        backgroundImage: `${BACKDROPS[variant % 3] ?? BACKDROPS[0]}, linear-gradient(180deg, color-mix(in oklch, var(--foreground) 10%, var(--background)), color-mix(in oklch, var(--foreground) 4%, var(--background)))`,
      }}
    >
      {/* Speaker silhouette: head + shoulders, scaled to the frame. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMax meet"
        className="absolute inset-x-0 bottom-0 h-[86%] w-full"
        aria-hidden="true"
      >
        <g transform={`translate(${shift} 0)`}>
          <circle cx="50" cy="38" r="15" className="fill-foreground/25" />
          <path d="M18 100 C20 72 34 60 50 60 C66 60 80 72 82 100 Z" className="fill-foreground/20" />
        </g>
      </svg>
      <p
        className="absolute inset-x-0 bottom-[16%] px-2 text-center leading-tight font-black tracking-tight uppercase"
        style={{ fontSize: captionSize }}
      >
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className={cn(
              'mx-[0.12em] inline-block drop-shadow-md',
              i === active ? 'text-chart-1' : 'text-foreground'
            )}
          >
            {word}
          </span>
        ))}
      </p>
    </div>
  )
}
