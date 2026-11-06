/**
 * SOURCE OF TRUTH KEYWORDS: FilmJobView, hero film job page, progress card,
 *   transcript panel, moment scores, clip grid, download all
 *
 * WHAT:  Chapters 2 to 6 of the hero film: the clip job page. A live progress
 *        card (real stage labels and hints), a transcript that streams in and
 *        gets its best moments scored, then the clip grid with Download all.
 * WHY:   Shows the real pipeline (download, transcribe, analyze, cut) as one
 *        continuous session, ending on ready-to-post clips.
 * WHERE: hero-film/scene.tsx.
 */

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Crop,
  Download,
  FileText,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react'

import {
  STAGE_HINTS,
  STAGE_STEPS,
  statusLabel,
} from '@/app/(dashboard)/dashboard/clips/_components/clip-status'
import {
  easeOut,
  envelope,
  fadeRise,
  isPressed,
  popIn,
  rect,
  span,
  spinStyle,
} from '@/components/global/product-film'
import { cn } from '@/lib/utils'
import { FilmClipArt } from './clip-art'
import {
  CLIP_CARD_GAP,
  CLIP_CARD_W,
  CLIP_CARD_Y,
  CLIPS,
  CONTENT,
  CONTENT_W,
  DOWNLOAD_ALL_BTN,
  elapsedLabel,
  JOB_TITLE,
  jobProgress,
  jobStatus,
  lineStart,
  LOWER_Y,
  PROGRESS_CARD,
  STAGE,
  STAGE_SECONDS,
  T,
  TRANSCRIPT,
  WINDOW,
} from './script'

const LOWER_H = WINDOW.y + WINDOW.h - 24 - LOWER_Y
const LINE_Y = 60
const LINE_H = 35

/* The stage hint rotates every 1.6 s, like the real progress panel. */
function hintAt(t: number, status: string, since: number): string {
  const list = STAGE_HINTS[status] ?? []
  return list[Math.floor(Math.max(0, t - since) / 1600) % Math.max(1, list.length)] ?? ''
}

function stageStart(status: string): number {
  if (status === 'DOWNLOADING') return T.download[0]
  if (status === 'TRANSCRIBING') return T.transcribe[0]
  if (status === 'ANALYZING') return T.analyze[0]
  return T.cut[0]
}

export function FilmJobView({ t }: { t: number }) {
  const status = jobStatus(t)
  const done = status === 'COMPLETED'
  const stepIndex = STAGE_STEPS.findIndex((s) => s.key === status)
  const pct = Math.round(jobProgress(t))
  const toast = envelope(t, T.toast[0], T.toast[0] + 300, T.toast[1] - 300, T.toast[1])

  return (
    <>
      {/* Header: back, title, status badge, source length, Cancel/Delete. */}
      <div className="absolute flex items-start gap-4" style={{ left: CONTENT.x, top: CONTENT.y - 4 }}>
        <span className="text-muted-foreground flex size-10 items-center justify-center rounded-lg">
          <ArrowLeft className="size-5" />
        </span>
        <div>
          <p className="text-[24px] font-semibold tracking-tight">{JOB_TITLE}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <span
              className={cn(
                'rounded-md px-2.5 py-0.5 text-[15px] font-medium',
                done ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              )}
            >
              {statusLabel(status)}
            </span>
            <span className="text-muted-foreground text-[16px]">84 min source</span>
          </div>
        </div>
      </div>
      <div
        className="border-border absolute flex h-[42px] items-center gap-2 rounded-lg border px-4 text-[17px] font-medium"
        style={{ right: STAGE.w - CONTENT.r, top: CONTENT.y }}
      >
        {done ? <Trash2 className="size-[18px]" /> : <XCircle className="size-[18px]" />}
        {done ? 'Delete' : 'Cancel'}
      </div>

      {/* Live progress card. */}
      <div className="bg-card border-border absolute rounded-2xl border px-7 py-5" style={rect(PROGRESS_CARD)}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[36px] leading-none font-semibold tracking-tight tabular-nums">
              {done ? 'Done in 2m 14s' : `${pct}%`}
            </p>
            <p className="text-muted-foreground mt-2 text-[17px]">
              {done ? 'Clips are ready to download' : hintAt(t, status, stageStart(status))}
            </p>
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-[17px] tabular-nums">
            <Clock className="size-4" />
            {elapsedLabel(t)}
          </p>
        </div>
        <div className="bg-primary/15 mt-4 h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full origin-left rounded-full"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-4">
          {STAGE_STEPS.map((step, i) => {
            const stepDone = done || stepIndex > i
            const current = !done && stepIndex === i
            return (
              <div key={step.key} className="flex items-center gap-2 text-[17px]">
                {stepDone ? (
                  <CheckCircle2 className="text-primary size-5" />
                ) : current ? (
                  <Loader2 className="text-primary size-5" style={spinStyle(t)} />
                ) : (
                  <Circle className="text-muted-foreground/40 size-5" />
                )}
                <span className={cn(stepDone || current ? 'text-foreground' : 'text-muted-foreground', current && 'font-medium')}>
                  {step.label}
                </span>
                {done ? (
                  <span className="text-muted-foreground">{STAGE_SECONDS[i]}s</span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <FilmTranscript t={t} />
      <FilmClipGrid t={t} />

      {/* "Clip job started" toast. */}
      <div
        className="glass-strong bg-popover/80 absolute flex items-center gap-3 rounded-xl px-5 text-[17px] font-medium shadow-lg"
        style={{
          ...rect({ x: WINDOW.x + WINDOW.w - 24 - 280, y: WINDOW.y + WINDOW.h - 24 - 58, w: 280, h: 58 }),
          ...fadeRise(toast, 14),
        }}
      >
        <CheckCircle2 className="size-5" />
        Clip job started
      </div>
    </>
  )
}

function FilmTranscript({ t }: { t: number }) {
  const shown = envelope(t, T.transcribe[0] - 300, T.transcribe[0] + 100, T.toClips[0], T.toClips[1])
  if (shown <= 0) return null
  const found = T.moments.filter((m) => t >= m).length
  const analyzing = t >= T.analyze[0]
  const scan = span(t, T.scan[0], T.scan[1])
  const scanOn = envelope(t, T.scan[0], T.scan[0] + 150, T.scan[1] - 150, T.scan[1])

  return (
    <div
      className="bg-card border-border absolute overflow-hidden rounded-2xl border"
      style={{ ...rect({ x: CONTENT.x, y: LOWER_Y, w: CONTENT_W, h: LOWER_H }), ...fadeRise(shown, 10) }}
    >
      <div className="flex items-center justify-between px-6 pt-4">
        <p className="flex items-center gap-2 text-[18px] font-semibold">
          <FileText className="size-[18px]" />
          Transcript
        </p>
        <p className="text-muted-foreground text-[16px]">
          {analyzing ? `${found} moment${found === 1 ? '' : 's'} found` : 'Word-level timestamps'}
        </p>
      </div>

      {/* The AI's read-through: a soft band sweeping down the lines. */}
      <div
        className="bg-foreground/[0.05] absolute inset-x-3 rounded-lg"
        style={{
          top: LINE_Y - 4,
          height: LINE_H,
          opacity: scanOn,
          transform: `translateY(${scan * (TRANSCRIPT.length - 1) * LINE_H}px)`,
        }}
      />

      {TRANSCRIPT.map((line, i) => {
        const start = lineStart(i)
        const words = line.text.split(' ')
        const momentIndex = TRANSCRIPT.slice(0, i + 1).filter((l) => l.moment).length - 1
        const momentAt = line.moment ? (T.moments[momentIndex] ?? Infinity) : Infinity
        const mark = easeOut(span(t, momentAt, momentAt + 380))
        return (
          <div key={line.at} className="absolute inset-x-3" style={{ top: LINE_Y - 4 + i * LINE_H, height: LINE_H }}>
            {line.moment ? (
              <div
                className="bg-chart-1/12 border-chart-1 absolute inset-0 origin-left rounded-lg border-l-[3px]"
                style={{ transform: `scaleX(${mark})`, opacity: mark }}
              />
            ) : null}
            <div className="relative flex h-full items-center gap-4 px-3">
              <span
                className="text-muted-foreground w-[52px] shrink-0 font-mono text-[15px] tabular-nums"
                style={{ opacity: span(t, start - 100, start + 100) }}
              >
                {line.at}
              </span>
              <p className="min-w-0 flex-1 truncate text-[17px]">
                {words.map((word, w) => (
                  <span
                    key={`${word}-${w}`}
                    style={{ opacity: span(t, start + w * (620 / words.length), start + w * (620 / words.length) + 120) }}
                  >
                    {word}{' '}
                  </span>
                ))}
              </p>
              {line.moment ? (
                <span
                  className="bg-chart-1/15 text-chart-1 shrink-0 rounded-full px-3 py-0.5 text-[15px] font-semibold tabular-nums"
                  style={popIn(t, momentAt + 120, 380, 10)}
                >
                  {line.moment.score} · {line.moment.tag}
                </span>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FilmClipGrid({ t }: { t: number }) {
  const shown = span(t, T.toClips[0] + 150, T.toClips[1] + 150)
  if (shown <= 0) return null
  const landed = T.cards.filter((c) => t >= c).length
  const pressed = isPressed(t, [T.downloadAll])

  return (
    <div style={{ opacity: shown }}>
      <p className="absolute text-[19px] font-semibold" style={{ left: CONTENT.x, top: LOWER_Y + 4 }}>
        Clips <span className="text-muted-foreground font-normal tabular-nums">({landed})</span>
      </p>
      <div
        className="border-border bg-background absolute flex items-center justify-center gap-2 rounded-lg border text-[17px] font-medium"
        style={{
          ...rect(DOWNLOAD_ALL_BTN),
          opacity: span(t, T.cards[0], T.cards[0] + 300),
          transform: `scale(${pressed ? 0.96 : 1})`,
        }}
      >
        <Download className="size-[18px]" />
        Download all
      </div>

      {CLIPS.map((clip, i) => {
        const at = T.cards[i] ?? Infinity
        const savedAt = T.saved[i] ?? Infinity
        const saved = t >= savedAt
        const box = { x: CONTENT.x + i * (CLIP_CARD_W + CLIP_CARD_GAP), y: CLIP_CARD_Y, w: CLIP_CARD_W, h: 236 }
        return (
          <div key={clip.title} style={rect(box)}>
            {/* Skeleton while the clip renders. */}
            <div
              className="bg-foreground/[0.04] border-border absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border"
              style={{ opacity: 1 - span(t, at, at + 200) }}
            >
              <Loader2 className="text-muted-foreground size-6" style={spinStyle(t)} />
              <span className="text-muted-foreground text-[15px]">Rendering clip {i + 1}…</span>
            </div>
            <div
              className="bg-card border-border absolute inset-0 overflow-hidden rounded-2xl border"
              style={popIn(t, at, 440, 20)}
            >
              <FilmClipArt
                words={clip.caption}
                active={Math.floor(Math.max(0, t - at) / 420) % clip.caption.length}
                variant={i}
                captionSize={17}
                className="h-[140px] w-full"
              />
              <span className="bg-background/70 absolute top-2.5 right-2.5 rounded-md px-1.5 text-[13px] font-medium tabular-nums">
                {clip.clock}
              </span>
              <div className="px-4 pt-3">
                <p className="truncate text-[17px] font-semibold">{clip.title}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 text-[15px] font-semibold tabular-nums">
                    {clip.score}
                  </span>
                  <span className="text-muted-foreground text-[15px]">{clip.length}</span>
                  <span className="border-border ml-auto flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[14px]">
                    <Crop className="size-3.5" />
                    Edit
                  </span>
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md border',
                      saved ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
                    )}
                    style={{ transform: `scale(${1 + 0.12 * envelope(t, savedAt, savedAt + 120, savedAt + 120, savedAt + 320)})` }}
                  >
                    {saved ? <Check className="size-4" /> : <Download className="size-4" />}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
