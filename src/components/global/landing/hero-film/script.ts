/**
 * SOURCE OF TRUTH KEYWORDS: HERO_FILM, heroFilmScript, T, CHAPTERS, CAPTIONS,
 *   CUES, cursorAt, jobProgress, jobStatus, film timing, storyboard
 *
 * WHAT:  The Cliptic hero film's timing and layout: every beat (ms), every
 *        cursor target (stage px), chapters, captions, sound cues and the
 *        derived job state (status, %, elapsed).
 * WHY:   One source of truth for the storyboard in docs/10-hero-product-film.md.
 *        Layout constants come first and cursor targets derive from them, so
 *        moving a panel moves every click with it.
 * WHERE: hero-film/scene.tsx draws from it; hero-film/index.tsx feeds it to Showcase.
 */

import { along, easeInOut, filmCaption, filmCue, lerp, span } from '@/components/global/product-film'
import type { ClipJobStatus } from '@/generated/prisma'
import type { FilmCaption, FilmChapter, FilmCue, FilmKeyframe, FilmPoint } from '@/lib/types'

export const STAGE = { w: 1200, h: 760 } as const

/* The browser window on the stage; everything inside is placed from it. */
export const WINDOW = { x: 60, y: 20, w: 1080, h: 648 } as const
export const CHROME_H = 44
export const SIDEBAR_W = 210
export const CONTENT = {
  x: WINDOW.x + SIDEBAR_W + 36,
  y: WINDOW.y + CHROME_H + 28,
  r: WINDOW.x + WINDOW.w - 36,
} as const
export const CONTENT_W = CONTENT.r - CONTENT.x

/* Clips page: the "New clip" button sits top-right of the page header. */
export const NEW_CLIP_BTN = { x: CONTENT.r - 156, y: CONTENT.y - 2, w: 156, h: 46 } as const

/* The "New clip job" dialog, centred in the window. */
export const DIALOG = { x: WINDOW.x + (WINDOW.w - 560) / 2, y: WINDOW.y + 76, w: 560, h: 486 } as const
export const URL_INPUT = { x: DIALOG.x + 32, y: DIALOG.y + 330, w: DIALOG.w - 64, h: 50 } as const
export const GENERATE_BTN = { x: DIALOG.x + DIALOG.w - 32 - 190, y: DIALOG.y + 408, w: 190, h: 46 } as const

/* Job page: progress card, then the transcript panel, swapped for the clip grid. */
export const PROGRESS_CARD = { x: CONTENT.x, y: CONTENT.y + 84, w: CONTENT_W, h: 164 } as const
export const LOWER_Y = PROGRESS_CARD.y + PROGRESS_CARD.h + 20
export const DOWNLOAD_ALL_BTN = { x: CONTENT.r - 176, y: LOWER_Y - 4, w: 176, h: 42 } as const
export const CLIP_CARD_Y = LOWER_Y + 50
export const CLIP_CARD_GAP = 20
export const CLIP_CARD_W = (CONTENT_W - CLIP_CARD_GAP * 2) / 3

export const PAYOFF = { x: CONTENT.x + (CONTENT_W - 660) / 2, y: WINDOW.y + 70, w: 660, h: 508 } as const

const center = (r: { x: number; y: number; w: number; h: number }): FilmPoint => ({
  x: r.x + r.w / 2,
  y: r.y + r.h / 2,
})

export const DURATION = 30_000
/** Reduced-motion still: clip grid plus the 9:16 preview card. */
export const SETTLED = 25_200

/** Every beat, named by meaning. Tuples are [start, end]. */
export const T = {
  newClip: 1000,
  dialog: [1050, 1350],
  focusUrl: 1800,
  typing: [2050, 3500],
  generate: 4000,
  toJob: [4250, 4650],
  toast: [4600, 6900],
  download: [4650, 7600],
  transcribe: [7600, 12_600],
  transcriptLines: [7800, 12_300],
  analyze: [12_600, 17_200],
  scan: [12_800, 13_700],
  moments: [13_700, 14_500, 15_300],
  cut: [17_200, 20_800],
  toClips: [17_200, 17_600],
  cards: [18_100, 19_000, 19_900],
  ready: 20_800,
  downloadAll: 22_400,
  saved: [22_750, 23_050, 23_350],
  payoff: [23_700, 29_100],
  karaoke: 24_000,
  loopOut: [29_100, 29_900],
} as const

export const VIDEO_URL = 'https://youtu.be/Qx7rT2mLp4E'

export const CLICKS: readonly number[] = [T.newClip, T.focusUrl, T.generate, T.downloadAll]

const START = { x: 700, y: 430 }
const NEW_CLIP = center(NEW_CLIP_BTN)
const URL_AT = { x: URL_INPUT.x + 120, y: URL_INPUT.y + URL_INPUT.h / 2 }
const GENERATE = center(GENERATE_BTN)
const DOWNLOAD_ALL = center(DOWNLOAD_ALL_BTN)

/* Pairs at the same point make a dwell: arrive ~120 ms before each click. */
const CURSOR: FilmKeyframe[] = [
  { t: 0, ...START },
  { t: 250, ...START },
  { t: T.newClip - 120, ...NEW_CLIP },
  { t: T.newClip + 260, ...NEW_CLIP },
  { t: T.focusUrl - 120, ...URL_AT },
  { t: T.focusUrl + 300, ...URL_AT },
  { t: T.typing[1], x: URL_AT.x + 40, y: URL_AT.y + 46 },
  { t: T.generate - 120, ...GENERATE },
  { t: T.generate + 260, ...GENERATE },
  { t: 5600, x: 980, y: 300 },
  { t: 9800, x: 1000, y: 330 },
  { t: 13_400, x: 820, y: 470 },
  { t: 16_600, x: 860, y: 520 },
  { t: 19_400, x: 900, y: 300 },
  { t: T.downloadAll - 120, ...DOWNLOAD_ALL },
  { t: T.downloadAll + 280, ...DOWNLOAD_ALL },
  { t: T.payoff[0] + 300, x: 1080, y: 630 },
  { t: T.loopOut[0], x: 1080, y: 630 },
  { t: DURATION, ...START },
]

export const cursorAt = (t: number): FilmPoint => along(CURSOR, t)

export const CHAPTERS: readonly FilmChapter[] = [
  { label: 'Paste a link', t: 0 },
  { label: 'Generate', t: 4250 },
  { label: 'Transcribe', t: T.transcribe[0] },
  { label: 'Find moments', t: T.analyze[0] },
  { label: 'Cut clips', t: T.cut[0] },
  { label: 'Download', t: 21_600 },
]

export const CAPTIONS: readonly FilmCaption[] = [
  filmCaption('Paste a YouTube link, or upload a long video.', 300, 3500),
  filmCaption('One click starts the whole pipeline.', 4500, 7000),
  filmCaption('Every word is transcribed with a timestamp.', 7900, 12_000),
  filmCaption('AI reads the transcript and scores the best moments.', 12_900, 16_700),
  filmCaption('Clips are cut on natural pauses, never mid-sentence.', 17_500, 21_000),
  filmCaption('Download them, ready for Reels, TikTok and Shorts.', 22_000, 28_400),
]

/** Earlier jobs on the Clips page. */
export const PAST_JOBS = [
  { title: 'Founders Unfiltered · Ep. 41', clips: 6 },
  { title: 'Design Systems Live: Q&A', clips: 4 },
  { title: 'How we price a SaaS product', clips: 5 },
  { title: 'Morning Run Podcast · Ep. 9', clips: 3 },
] as const

export const JOB_TITLE = 'The Long Game · Ep. 112: Building in public'

/** The transcript excerpt that streams in; `moment` marks the lines the AI picks. */
export const TRANSCRIPT = [
  { at: '12:04', text: "Most startups don't die from competition. They die from boredom.", moment: { score: 94, tag: 'Hook' } },
  { at: '12:11', text: 'You stop shipping, and the founders quietly lose interest.', moment: null },
  { at: '31:47', text: 'We hit ten thousand users without spending a dollar on ads.', moment: { score: 91, tag: 'Payoff' } },
  { at: '31:55', text: 'Every launch was just us writing in public, every week.', moment: null },
  { at: '58:20', text: 'I almost shut it down the night before our first real customer.', moment: { score: 87, tag: 'Emotion' } },
  { at: '58:29', text: 'That one email changed how I think about the whole company.', moment: null },
] as const

/** The clips the job produces, in score order. */
export const CLIPS = [
  { title: 'Startups die from boredom, not competition', score: 94, length: '41s', clock: '0:41', caption: ['They', 'die', 'from', 'boredom.'] },
  { title: '10,000 users with $0 spent on ads', score: 91, length: '38s', clock: '0:38', caption: ['Not', 'a', 'dollar', 'on', 'ads.'] },
  { title: 'The night I almost shut it down', score: 87, length: '52s', clock: '0:52', caption: ['I', 'almost', 'shut', 'it', 'down.'] },
] as const

/** Words karaoke-highlighted in the 9:16 preview, one every `KARAOKE_STEP` ms. */
export const KARAOKE = [
  'Most', 'startups', "don't", 'die', 'from', 'competition.', 'They', 'die', 'from', 'boredom.',
] as const
export const KARAOKE_STEP = 380

const keys = Array.from(VIDEO_URL, (_, i) =>
  filmCue(T.typing[0] + ((T.typing[1] - T.typing[0]) * i) / VIDEO_URL.length, 'key', i)
)

export const CUES: readonly FilmCue[] = [
  ...CLICKS.map((t) => filmCue(t, 'switch')),
  ...keys,
  filmCue(T.dialog[0], 'pop'),
  filmCue(T.toJob[0], 'sweep'),
  filmCue(T.download[0] + 50, 'start'),
  ...TRANSCRIPT.map((_, i) => filmCue(lineStart(i), 'tick', i)),
  ...T.moments.map((t, i) => filmCue(t, 'pop', i)),
  filmCue(T.toClips[0], 'whoosh'),
  ...T.cards.map((t, i) => filmCue(t, 'pop', i + 3)),
  filmCue(T.ready, 'chime'),
  ...T.saved.map((t, i) => filmCue(t, 'tick', i)),
  filmCue(T.payoff[0], 'chime'),
].toSorted((a, b) => a.t - b.t)

/** When transcript line `i` starts streaming. */
export function lineStart(i: number): number {
  const [a, b] = T.transcriptLines
  return a + ((b - a) / TRANSCRIPT.length) * i
}

/** The job's pipeline status at `t` (the same keys as the real ClipJob status). */
export function jobStatus(t: number): ClipJobStatus {
  if (t < T.download[0]) return 'QUEUED'
  if (t < T.transcribe[0]) return 'DOWNLOADING'
  if (t < T.analyze[0]) return 'TRANSCRIBING'
  if (t < T.cut[0]) return 'ANALYZING'
  if (t < T.ready) return 'CUTTING'
  return 'COMPLETED'
}

/* Stage end percentages follow the real stage ceilings (15 / 58 / 69 / 100). */
const PROGRESS_STEPS: readonly (readonly [number, number, number, number])[] = [
  [T.download[0], T.download[1], 0, 15],
  [T.transcribe[0], T.transcribe[1], 15, 58],
  [T.analyze[0], T.analyze[1], 58, 69],
  [T.cut[0], T.cut[1], 69, 100],
]

/** The job's progress (0..100) at `t`. */
export function jobProgress(t: number): number {
  for (const [a, b, from, to] of PROGRESS_STEPS) {
    if (t < b) return t < a ? from : lerp(from, to, easeInOut(span(t, a, b)))
  }
  return 100
}

/** Seconds each stage took, shown once the job is Ready (sums to JOB_SECONDS). */
export const STAGE_SECONDS = [9, 48, 21, 56] as const

/** Job time shown on the elapsed clock: the film's 16 s of work maps to 2m 14s. */
export const JOB_SECONDS = 134

export function elapsedLabel(t: number): string {
  const s = Math.round(JOB_SECONDS * span(t, T.download[0], T.ready))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
