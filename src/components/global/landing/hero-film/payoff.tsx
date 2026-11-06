/**
 * SOURCE OF TRUTH KEYWORDS: FilmPayoff, hero film payoff, 9:16 preview,
 *   karaoke captions, clip ready card, Reels TikTok Shorts
 *
 * WHAT:  The film's final beat: a card with clip 1 playing as a 9:16 vertical
 *        video with karaoke captions, its score and what's baked in.
 * WHY:   Ends on the outcome the visitor came for: a post-ready short.
 * WHERE: hero-film/scene.tsx.
 */

import { CheckCircle2, Download } from 'lucide-react'

import { envelope, popIn, rect, span } from '@/components/global/product-film'
import { FilmClipArt } from './clip-art'
import { CLIPS, KARAOKE, KARAOKE_STEP, PAYOFF, T } from './script'

const PHONE = { w: 236, h: 420 } as const
const CHUNK = 3

const DETAILS = [
  '9:16 for Reels, TikTok and Shorts',
  'Captions burned in, word by word',
  'Cut on natural pauses',
  '1080×1920 MP4, ready to post',
] as const

export function FilmPayoff({ t }: { t: number }) {
  const shown = envelope(t, T.payoff[0], T.payoff[0] + 450, T.payoff[1], T.loopOut[1] - 100)
  if (shown <= 0) return null
  const clip = CLIPS[0]
  const pop = popIn(t, T.payoff[0], 520, 28)

  // Karaoke: three words on screen, the spoken one highlighted.
  const spoken = Math.max(0, Math.floor((t - T.karaoke) / KARAOKE_STEP)) % KARAOKE.length
  const first = Math.floor(spoken / CHUNK) * CHUNK
  const words = KARAOKE.slice(first, first + CHUNK)
  const playhead = span(t, T.karaoke, T.karaoke + KARAOKE.length * KARAOKE_STEP)

  return (
    <div
      className="bg-popover text-popover-foreground border-border absolute flex gap-8 rounded-3xl border p-7 shadow-2xl"
      style={{ ...rect(PAYOFF), opacity: Math.min(shown, pop.opacity), transform: pop.transform }}
    >
      <div
        className="border-foreground/15 relative shrink-0 overflow-hidden rounded-[28px] border-4"
        style={{ width: PHONE.w, height: PHONE.h + 8 }}
      >
        <FilmClipArt
          words={t >= T.karaoke ? words : []}
          active={spoken - first}
          variant={0}
          captionSize={27}
          className="size-full"
        />
        <span className="bg-background/70 absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[13px] font-medium">
          @thelonggame
        </span>
        <div className="bg-foreground/20 absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full">
          <div className="bg-foreground h-full origin-left" style={{ transform: `scaleX(${playhead})` }} />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col pt-1">
        <p className="text-muted-foreground text-[16px]">Clip 1 · {clip.clock}</p>
        <p className="mt-1 text-[27px] leading-[1.2] font-semibold tracking-tight">{clip.title}</p>
        <div className="mt-5 flex items-baseline gap-3">
          <span className="text-chart-1 text-[44px] leading-none font-semibold tabular-nums">{clip.score}</span>
          <span className="text-muted-foreground text-[17px]">score</span>
          <span className="bg-chart-1/15 text-chart-1 rounded-full px-3 py-0.5 text-[15px] font-semibold">Hook</span>
        </div>
        <ul className="mt-6 space-y-3">
          {DETAILS.map((line, i) => (
            <li key={line} className="flex items-center gap-2.5 text-[17px]" style={popIn(t, T.payoff[0] + 350 + i * 160, 380, 10)}>
              <CheckCircle2 className="text-primary size-5 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
        <div
          className="bg-primary text-primary-foreground mt-auto flex h-12 items-center justify-center gap-2 rounded-xl text-[18px] font-medium"
          style={popIn(t, T.payoff[0] + 900, 400, 10)}
        >
          <Download className="size-5" />
          3 clips downloaded
        </div>
      </div>
    </div>
  )
}
