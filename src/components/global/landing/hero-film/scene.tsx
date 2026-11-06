/**
 * SOURCE OF TRUTH KEYWORDS: ClipticFilmScene, hero film scene, film captions,
 *   clips list to job crossfade, loop seam, Scene(t)
 *
 * WHAT:  The whole hero film as a pure function of `t`: the dashboard window,
 *        the Clips page and dialog, the job page, the payoff card, captions
 *        and the cursor.
 * WHY:   Same `t`, same pixels: seeking, looping, reduced motion and
 *        screenshots are exact. The job page crossfades back to the Clips
 *        page at the end so the loop has no seam.
 * WHERE: hero-film/index.tsx renders it inside FilmShowcase.
 */

import { envelope, FilmCursor, isPressed, span } from '@/components/global/product-film'
import { FilmAppFrame } from './app-frame'
import { FilmClipsList, FilmNewClipDialog } from './clips-list'
import { FilmJobView } from './job-view'
import { FilmPayoff } from './payoff'
import { CAPTIONS, CLICKS, cursorAt, STAGE, T, WINDOW } from './script'

export function ClipticFilmScene({ t }: { t: number }) {
  // Clips page → job page at Generate; job page → Clips page for the loop.
  const listOn = t < T.toJob[1] ? 1 - span(t, T.toJob[0], T.toJob[1]) : span(t, T.loopOut[0], T.loopOut[1])
  const jobOn = span(t, T.toJob[0] + 120, T.toJob[1]) * (1 - span(t, T.loopOut[0], T.loopOut[1] - 200))
  const focus = 1 - 0.6 * envelope(t, T.payoff[0], T.payoff[0] + 450, T.payoff[1], T.loopOut[1] - 100)
  const textCursor = t >= T.focusUrl - 150 && t <= T.typing[1] + 200

  return (
    <div className="bg-background text-foreground relative size-full overflow-hidden font-sans">
      <div className="bg-spotlight absolute inset-0" />
      <FilmAppFrame t={t} />

      {/* Page content, clipped to the window's content area. */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${WINDOW.y}px ${STAGE.w - WINDOW.x - WINDOW.w}px ${STAGE.h - WINDOW.y - WINDOW.h}px ${WINDOW.x}px round 16px)` }}>
        {listOn > 0 ? (
          <div className="absolute inset-0" style={{ opacity: listOn }}>
            <FilmClipsList t={t} />
          </div>
        ) : null}
        {jobOn > 0 ? (
          <div className="absolute inset-0" style={{ opacity: jobOn * focus }}>
            <FilmJobView t={t} />
          </div>
        ) : null}
        <FilmNewClipDialog t={t} />
        <FilmPayoff t={t} />
      </div>

      <FilmCaptions t={t} />
      <FilmCursor at={cursorAt(t)} pressed={isPressed(t, CLICKS)} kind={textCursor ? 'text' : 'arrow'} />
    </div>
  )
}

function FilmCaptions({ t }: { t: number }) {
  return (
    <>
      {CAPTIONS.map((caption) => {
        const shown = envelope(t, caption.start - 200, caption.start, caption.end + 600, caption.end + 900)
        if (shown <= 0) return null
        return (
          <p
            key={caption.start}
            className="absolute inset-x-[140px] text-center text-[28px] font-semibold tracking-tight"
            style={{ top: WINDOW.y + WINDOW.h + 26, opacity: shown, transform: `translateY(${(1 - shown) * 6}px)` }}
          >
            {caption.words.map((word) => (
              <span key={`${word.text}-${word.at}`} style={{ opacity: 0.32 + 0.68 * span(t, word.at - 60, word.at + 140) }}>
                {word.text}{' '}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}
