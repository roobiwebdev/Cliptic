/**
 * SOURCE OF TRUTH KEYWORDS: HeroFilm, Cliptic hero film, landing product film,
 *   hero demo, product demo animation
 *
 * WHAT:  The landing hero's 30 s product film: a link goes in, Cliptic
 *        transcribes it, scores the best moments and hands back captioned
 *        clips, drawn in code (no video file).
 * WHY:   Shows the real flow in the hero instead of a static preview card.
 *        Storyboard and feature ranking: docs/10-hero-product-film.md.
 * WHERE: src/components/global/landing/landing-hero.tsx.
 */

'use client'

import { FilmShowcase } from '@/components/global/product-film'
import { ClipticFilmScene } from './scene'
import { CHAPTERS, CUES, DURATION, SETTLED, STAGE } from './script'

const NARRATION =
  'Cliptic product demo: a YouTube link is pasted into a new clip job, the video is downloaded and transcribed word by word, AI scores the best moments, three captioned clips are cut and scored, and they are downloaded ready for Reels, TikTok and Shorts.'

export function HeroFilm({ className }: { className?: string }) {
  return (
    <FilmShowcase
      stage={STAGE}
      duration={DURATION}
      settled={SETTLED}
      cues={CUES}
      chapters={CHAPTERS}
      label={NARRATION}
      {...(className ? { className } : {})}
    >
      {(t) => <ClipticFilmScene t={t} />}
    </FilmShowcase>
  )
}
