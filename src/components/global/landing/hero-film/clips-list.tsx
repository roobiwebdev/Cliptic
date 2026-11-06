/**
 * SOURCE OF TRUTH KEYWORDS: FilmClipsList, FilmNewClipDialog, hero film clips
 *   page, new clip job mock, paste link, generate clips
 *
 * WHAT:  Chapter 1 of the hero film: the Clips page with earlier jobs, then the
 *        "New clip job" dialog (AI auto-detect, Paste link, the URL being typed,
 *        Generate clips).
 * WHY:   Opens on Cliptic's signature action within the first seconds, using
 *        the real dialog's labels and layout.
 * WHERE: hero-film/scene.tsx.
 */

import { Link2, Loader2, Plus, Scissors, Sparkles, Upload } from 'lucide-react'

import { envelope, isPressed, popIn, rect, span, spinStyle } from '@/components/global/product-film'
import { cn } from '@/lib/utils'
import {
  CONTENT,
  CONTENT_W,
  DIALOG,
  GENERATE_BTN,
  NEW_CLIP_BTN,
  PAST_JOBS,
  T,
  URL_INPUT,
  VIDEO_URL,
  WINDOW,
} from './script'

export function FilmClipsList({ t }: { t: number }) {
  const pressed = isPressed(t, [T.newClip])
  const cardW = (CONTENT_W - 20) / 2

  return (
    <>
      <h3 className="absolute text-[32px] font-semibold tracking-tight" style={{ left: CONTENT.x, top: CONTENT.y - 2 }}>
        Clips
      </h3>
      <div
        className="bg-primary text-primary-foreground absolute flex items-center justify-center gap-2 rounded-lg text-[18px] font-medium"
        style={{ ...rect(NEW_CLIP_BTN), transform: `scale(${pressed ? 0.96 : 1})` }}
      >
        <Plus className="size-5" />
        New clip
      </div>

      {PAST_JOBS.map((job, i) => (
        <div
          key={job.title}
          className="bg-card border-border absolute rounded-2xl border p-6"
          style={rect({
            x: CONTENT.x + (i % 2) * (cardW + 20),
            y: CONTENT.y + 84 + Math.floor(i / 2) * 150,
            w: cardW,
            h: 130,
          })}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-[19px] font-semibold">{job.title}</p>
            <span className="bg-primary text-primary-foreground shrink-0 rounded-md px-2.5 py-0.5 text-[15px] font-medium">
              Ready
            </span>
          </div>
          <p className="text-muted-foreground mt-5 flex items-center gap-2 text-[17px]">
            <Scissors className="size-[18px]" />
            {job.clips} clips
          </p>
        </div>
      ))}
    </>
  )
}

const MODES = [
  { key: 'AUTO', icon: Sparkles, label: 'AI auto-detect', hint: 'We find the viral moments' },
  { key: 'MANUAL', icon: Scissors, label: 'Manual', hint: 'Pick exact clips yourself' },
] as const

export function FilmNewClipDialog({ t }: { t: number }) {
  const shown = envelope(t, T.dialog[0], T.dialog[1], T.toJob[0], T.toJob[0] + 260)
  if (shown <= 0) return null

  const typed = VIDEO_URL.slice(0, Math.floor(span(t, T.typing[0], T.typing[1]) * VIDEO_URL.length))
  const focused = t >= T.focusUrl
  const typing = t >= T.typing[0] && t <= T.typing[1] + 300
  const caret = focused && t < T.generate && (typing || Math.floor(t / 530) % 2 === 0)
  const submitting = t >= T.generate
  const pressed = isPressed(t, [T.generate])
  const pop = popIn(t, T.dialog[0], 380, 18)

  return (
    <>
      <div
        className="bg-background/70 absolute rounded-[16px]"
        style={{ ...rect(WINDOW), opacity: shown }}
      />
      <div
        className="bg-popover text-popover-foreground border-border absolute rounded-2xl border p-8 shadow-2xl"
        style={{ ...rect(DIALOG), opacity: Math.min(shown, pop.opacity), transform: pop.transform }}
      >
        <p className="text-[26px] font-semibold tracking-tight">New clip job</p>
        <p className="text-muted-foreground mt-2 text-[18px] leading-[26px]">
          Paste a video link or upload a file. We&apos;ll find the best short clips.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {MODES.map((mode) => (
            <div
              key={mode.key}
              className={cn(
                'flex h-[86px] flex-col justify-center gap-1 rounded-xl border px-4',
                mode.key === 'AUTO'
                  ? 'border-foreground/20 bg-foreground/5 ring-foreground/15 ring-1'
                  : 'border-border'
              )}
            >
              <span className="flex items-center gap-2 text-[18px] font-medium">
                <mode.icon className="size-[18px]" />
                {mode.label}
              </span>
              <span className="text-muted-foreground text-[15px]">{mode.hint}</span>
            </div>
          ))}
        </div>

        <div className="bg-muted mt-4 grid h-[46px] grid-cols-2 rounded-lg p-1 text-[17px]">
          <span className="bg-background flex items-center justify-center gap-2 rounded-md font-medium shadow-sm">
            <Link2 className="size-[18px]" />
            Paste link
          </span>
          <span className="text-muted-foreground flex items-center justify-center gap-2">
            <Upload className="size-[18px]" />
            Upload
          </span>
        </div>
      </div>

      {/* Video URL field + submit, placed on the stage so the cursor targets match. */}
      <div style={{ opacity: shown }}>
        <p
          className="absolute text-[17px] font-medium"
          style={{ left: URL_INPUT.x, top: URL_INPUT.y - 30, transform: pop.transform }}
        >
          Video URL
        </p>
        <div
          className={cn(
            'bg-background absolute flex items-center rounded-lg border px-4 text-[18px]',
            focused ? 'border-ring ring-ring/40 ring-3' : 'border-input'
          )}
          style={{ ...rect(URL_INPUT), transform: pop.transform }}
        >
          {typed ? <span>{typed}</span> : <span className="text-muted-foreground">https://youtu.be/…</span>}
          {caret ? <span className="bg-foreground ml-px h-6 w-[2px]" /> : null}
        </div>
        <div
          className="bg-primary text-primary-foreground absolute flex items-center justify-center gap-2 rounded-lg text-[18px] font-medium"
          style={{
            ...rect(GENERATE_BTN),
            transform: `${pop.transform} scale(${pressed ? 0.96 : 1})`,
            opacity: submitting ? 0.85 : 1,
          }}
        >
          {submitting ? <Loader2 className="size-5" style={spinStyle(t)} /> : null}
          Generate clips
        </div>
      </div>
    </>
  )
}
