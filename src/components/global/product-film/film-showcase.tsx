/**
 * SOURCE OF TRUTH KEYWORDS: FilmShowcase, FilmShowcaseProps, product film
 *   frame, stage scaling, chapter bar, play with sound, film controls, hero demo
 *
 * WHAT:  Hosts a product film: a fixed-size stage scaled to fit its frame, the
 *        clock (FilmPlayer), a "Play with sound" pill and the controls below
 *        (play/pause, replay, sound, a chapter bar that fills and seeks).
 * WHY:   Every film shares the same frame and controls; the film itself is a
 *        render prop `(t) => scene`, so its pixels are a pure function of time.
 * WHERE: The landing hero (landing/hero-film). Reusable for any future film.
 */

'use client'

import * as React from 'react'
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FilmChapter, FilmCue, FilmPlayerSnapshot } from '@/lib/types'
import { span } from './ease'
import { FilmPlayer } from './player'

export interface FilmShowcaseProps {
  /** Design size of the stage, in px; the film is drawn at this size and scaled. */
  stage: { w: number; h: number }
  duration: number
  /** The still shown with reduced motion until the visitor presses play. */
  settled: number
  cues: readonly FilmCue[]
  chapters: readonly FilmChapter[]
  /** One sentence narrating the whole film, for screen readers. */
  label: string
  children: (t: number) => React.ReactNode
  className?: string
}

/* Hydration renders the first frame; the client snapshot takes over after. */
const SERVER_SNAPSHOT: FilmPlayerSnapshot = { time: 0, paused: false, sound: false }

export function FilmShowcase({
  stage,
  duration,
  settled,
  cues,
  chapters,
  label,
  children,
  className,
}: FilmShowcaseProps) {
  const [player] = React.useState(() => new FilmPlayer(duration, settled, cues))
  const snap = React.useSyncExternalStore(player.subscribe, player.snapshot, () => SERVER_SNAPSHOT)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0)

  React.useEffect(() => {
    const node = frameRef.current
    if (!node) return
    const resize = new ResizeObserver((entries) => {
      const box = entries[0]
      if (box) setScale(box.contentRect.width / stage.w)
    })
    resize.observe(node)
    const stop = player.observe(node)
    return () => {
      resize.disconnect()
      stop()
    }
  }, [player, stage.w])

  const t = snap.time
  const active = chapters.findLastIndex((c) => t >= c.t)

  return (
    <div className={cn('w-full', className)}>
      <div
        ref={frameRef}
        data-film-frame=""
        className="bg-background ring-foreground/10 glow-primary relative overflow-hidden rounded-2xl shadow-2xl ring-1"
        style={{ aspectRatio: `${stage.w} / ${stage.h}` }}
      >
        <div
          role="img"
          aria-label={label}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: stage.w,
            height: stage.h,
            transform: `scale(${scale})`,
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          {children(t)}
        </div>

        {snap.sound ? null : (
          <button
            type="button"
            data-film-sound-pill=""
            onClick={player.playWithSound}
            className="glass-strong text-foreground hover:bg-foreground/10 absolute right-4 bottom-4 hidden items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors sm:inline-flex"
          >
            <Volume2 className="size-4" />
            Play with sound
          </button>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={player.toggle}
          aria-label={snap.paused ? 'Play' : 'Pause'}
        >
          {snap.paused ? <Play /> : <Pause />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={player.replay}
          aria-label="Replay from the start"
        >
          <RotateCcw />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full"
          onClick={player.toggleSound}
          aria-pressed={snap.sound}
          aria-label={snap.sound ? 'Turn sound off' : 'Turn sound on'}
        >
          {snap.sound ? <Volume2 /> : <VolumeX />}
        </Button>

        <ol className="flex min-w-0 flex-1 gap-1.5 pt-1" aria-label="Chapters">
          {chapters.map((chapter, i) => {
            const end = chapters[i + 1]?.t ?? duration
            return (
              <li key={chapter.label} className="min-w-0" style={{ flexGrow: end - chapter.t, flexBasis: 0 }}>
                <button
                  type="button"
                  onClick={() => player.seek(chapter.t)}
                  aria-label={`Chapter ${i + 1}: ${chapter.label}`}
                  aria-current={i === active ? 'step' : undefined}
                  className="group w-full text-left"
                >
                  <span className="bg-foreground/15 block h-[3px] overflow-hidden rounded-full">
                    <span
                      className="bg-foreground block h-full origin-left rounded-full"
                      style={{ transform: `scaleX(${span(t, chapter.t, end)})` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'mt-1.5 hidden truncate text-xs transition-colors sm:block',
                      i === active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    <span className="tabular-nums">{String(i + 1).padStart(2, '0')}</span> {chapter.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
