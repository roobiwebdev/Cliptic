/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ManualClipStudio, timeline scrubber, manual clip,
 *   suggestManualTitle, addManualClip, MM:SS
 *
 * WHAT:  The manual-clip studio on a processed job — a live <video> preview, a
 *        draggable in/out timeline, MM:SS inputs kept in sync with the drag
 *        handles, an editable AI-suggested title, and an "Add clip" action that
 *        cuts the EXACT range through the same pipeline (source = MANUAL).
 * WHY:   First-class manual clipping next to AI auto-detect. Scrubs the persisted
 *        720p source (frame-accurate to what the worker cuts); titles reuse the
 *        cached transcript so they're instant; adding a clip never burns a video.
 * WHERE: Rendered by JobDetail for any COMPLETED job that has a persisted source.
 */

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Scissors, Sparkles } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** seconds → "M:SS" */
function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "M:SS" | "SS" | "MM:SS" → seconds, or null when unparseable. */
function parseClock(raw: string): number | null {
  const value = raw.trim()
  if (/^\d+$/.test(value)) return Number(value)
  const m = value.match(/^(\d+):([0-5]?\d)$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.'
}

interface ManualClipStudioProps {
  jobId: string
  organizationId: string
  sourcePreviewUrl: string
  durationSec: number
}

export function ManualClipStudio({
  jobId,
  organizationId,
  sourcePreviewUrl,
  durationSec,
}: ManualClipStudioProps) {
  const utils = trpc.useUtils()
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const trackRef = React.useRef<HTMLDivElement>(null)

  const duration = durationSec > 0 ? durationSec : 0

  const [startSec, setStartSec] = React.useState(0)
  const [endSec, setEndSec] = React.useState(() => Math.min(30, durationSec || 30))
  const [startStr, setStartStr] = React.useState('0:00')
  const [endStr, setEndStr] = React.useState(() => formatClock(Math.min(30, durationSec || 30)))
  const [title, setTitle] = React.useState('')
  const [titleDirty, setTitleDirty] = React.useState(false)
  const [playhead, setPlayhead] = React.useState(0)
  const [dragging, setDragging] = React.useState<null | 'start' | 'end'>(null)
  const [suggesting, setSuggesting] = React.useState(false)
  const [videoError, setVideoError] = React.useState(false)

  /* Latest values for the drag listeners without re-subscribing on every tick.
   * Written in an effect (react-compiler forbids ref writes during render). */
  const startRef = React.useRef(startSec)
  const endRef = React.useRef(endSec)
  React.useEffect(() => {
    startRef.current = startSec
    endRef.current = endSec
  }, [startSec, endSec])

  const addClip = trpc.clips.addManualClip.useMutation()

  const valid = duration > 0 && startSec >= 0 && endSec > startSec + 0.9 && endSec <= duration + 0.5

  /* Commit a numeric time (from a handle/button) and reflect it in the MM:SS box. */
  const commitStart = React.useCallback(
    (sec: number) => {
      const s = Math.max(0, Math.min(sec, endRef.current - 1))
      setStartSec(round1(s))
      setStartStr(formatClock(s))
    },
    []
  )
  const commitEnd = React.useCallback(
    (sec: number) => {
      const e = Math.min(duration || sec, Math.max(sec, startRef.current + 1))
      setEndSec(round1(e))
      setEndStr(formatClock(e))
    },
    [duration]
  )

  /* Drag the in/out handles. Global listeners so the drag survives leaving the bar. */
  React.useEffect(() => {
    if (!dragging) return
    const fractionAt = (clientX: number): number => {
      const el = trackRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    }
    const onMove = (e: PointerEvent) => {
      const sec = fractionAt(e.clientX) * duration
      if (dragging === 'start') commitStart(sec)
      else commitEnd(sec)
    }
    const onUp = (): void => setDragging(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragging, duration, commitStart, commitEnd])

  /* Auto-suggest a title once for a fresh window (only while the box is empty and
   * untouched), debounced so dragging doesn't spam the LLM. */
  React.useEffect(() => {
    if (titleDirty || title.trim() || !valid) return
    let cancelled = false
    const t = setTimeout(() => {
      setSuggesting(true)
      utils.clips.suggestManualTitle
        .fetch({ organizationId, id: jobId, startSec: round1(startSec), endSec: round1(endSec) })
        .then((res) => {
          if (!cancelled && res.title && !titleDirty) setTitle(res.title)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setSuggesting(false)
        })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [startSec, endSec, valid, titleDirty, title, organizationId, jobId, utils])

  function suggestNow(): void {
    if (!valid) return
    setSuggesting(true)
    utils.clips.suggestManualTitle
      .fetch({ organizationId, id: jobId, startSec: round1(startSec), endSec: round1(endSec) })
      .then((res) => {
        if (res.title) {
          setTitle(res.title)
          setTitleDirty(false)
        }
      })
      .catch(() => {})
      .finally(() => setSuggesting(false))
  }

  function seek(sec: number): void {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(sec, duration))
  }

  async function onAdd(): Promise<void> {
    if (!valid) {
      toast.error('Pick a valid range (end after start, within the video).')
      return
    }
    try {
      await addClip.mutateAsync({
        organizationId,
        id: jobId,
        startSec: round1(startSec),
        endSec: round1(endSec),
        ...(title.trim() ? { title: title.trim() } : {}),
      })
      toast.success('Cutting your clip…')
      setTitle('')
      setTitleDirty(false)
      /* Optimistically flip to an active status so the detail poller resumes and
       * shows the new clip as the worker cuts it. Invalidating instead would
       * refetch the still-COMPLETED row and stop polling before the worker runs. */
      utils.clips.get.setData({ organizationId, id: jobId }, (old) =>
        old
          ? { ...old, status: 'CUTTING', currentStage: 'Cutting your clip', progress: Math.min(old.progress ?? 100, 92) }
          : old
      )
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const pct = (sec: number): number => (duration > 0 ? Math.min(100, Math.max(0, (sec / duration) * 100)) : 0)

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Scissors className="size-4" />
          Cut a clip yourself
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live preview of the exact source the worker cuts from. */}
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-lg bg-black"
          controls
          preload="metadata"
          src={sourcePreviewUrl}
          onError={() => setVideoError(true)}
          onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
        />
        {videoError ? (
          <p className="text-muted-foreground text-xs">
            Couldn&apos;t load the preview — you can still set the times below and add the clip.
          </p>
        ) : null}

        {/* Timeline: selected range + draggable in/out handles + playhead. */}
        <div
          ref={trackRef}
          className="bg-foreground/10 relative h-10 w-full cursor-pointer rounded-md select-none"
          onPointerDown={(e) => {
            if (dragging) return
            const rect = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - rect.left) / rect.width) * duration)
          }}
        >
          <div
            className="bg-primary/25 ring-primary/40 absolute inset-y-0 rounded-md ring-1"
            style={{ left: `${pct(startSec)}%`, width: `${Math.max(0, pct(endSec) - pct(startSec))}%` }}
          />
          {/* playhead */}
          <div className="bg-foreground/70 absolute inset-y-0 w-0.5" style={{ left: `${pct(playhead)}%` }} />
          {/* handles */}
          {(['start', 'end'] as const).map((which) => (
            <div
              key={which}
              role="slider"
              aria-label={which === 'start' ? 'Clip start' : 'Clip end'}
              aria-valuenow={Math.round(which === 'start' ? startSec : endSec)}
              tabIndex={0}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setDragging(which)
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 5 : 1
                const delta = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
                if (delta === 0) return
                if (which === 'start') commitStart(startSec + delta)
                else commitEnd(endSec + delta)
              }}
              className={cn(
                'bg-primary absolute inset-y-0 w-2 -translate-x-1/2 cursor-ew-resize rounded-full',
                'ring-background hover:ring-primary/40 ring-2 focus:outline-none focus-visible:ring-4'
              )}
              style={{ left: `${pct(which === 'start' ? startSec : endSec)}%` }}
            />
          ))}
        </div>

        {/* MM:SS inputs (synced with the handles) + "set to playhead" helpers. */}
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: 'start' as const, label: 'Start', str: startStr },
              { key: 'end' as const, label: 'End', str: endStr },
            ]
          ).map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              <div className="flex gap-2">
                <Input
                  value={f.str}
                  inputMode="numeric"
                  placeholder="M:SS"
                  onChange={(e) => {
                    const raw = e.target.value
                    if (f.key === 'start') setStartStr(raw)
                    else setEndStr(raw)
                    const parsed = parseClock(raw)
                    if (parsed !== null) {
                      if (f.key === 'start') setStartSec(round1(Math.max(0, Math.min(parsed, endRef.current - 1))))
                      else setEndSec(round1(Math.min(duration || parsed, Math.max(parsed, startRef.current + 1))))
                    }
                  }}
                  onBlur={() => (f.key === 'start' ? setStartStr(formatClock(startSec)) : setEndStr(formatClock(endSec)))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => (f.key === 'start' ? commitStart(playhead) : commitEnd(playhead))}
                  title="Set to current playhead"
                >
                  Now
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground text-xs">
          Selected {formatClock(startSec)}–{formatClock(endSec)} ({Math.max(0, Math.round(endSec - startSec))}s) · video is {formatClock(duration)}
        </p>

        {/* Editable, AI-suggested title. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Clip title</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={!valid || suggesting}
              onClick={suggestNow}
            >
              {suggesting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              Suggest
            </Button>
          </div>
          <Input
            value={title}
            placeholder={suggesting ? 'Thinking of a title…' : 'A short, catchy title (optional)'}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleDirty(true)
            }}
          />
        </div>

        <Button onClick={onAdd} disabled={!valid || addClip.isPending} className="w-full">
          {addClip.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          Add clip
        </Button>
      </CardContent>
    </Card>
  )
}
