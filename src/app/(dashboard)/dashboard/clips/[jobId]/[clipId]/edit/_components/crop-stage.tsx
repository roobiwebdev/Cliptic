/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: CropStage, draggable crop, reframe preview, split
 *   screen, video transport
 *
 * WHAT:  The Editor's preview stage — the clip <video> at its true aspect with
 *        one (single) or two (split top/bottom) draggable crop rectangles over
 *        it, plus a play/pause + seek transport. The active region dims the rest
 *        of the frame so the user sees exactly what the render keeps.
 * WHY:   The browser NEVER renders the final video — this only builds the crop
 *        geometry (normalized regions) the server render applies. Aspect-locking
 *        lives in the parent (geometry helpers); this component just moves boxes.
 * WHERE: Rendered by clip-editor.tsx.
 */

'use client'

import * as React from 'react'
import { Pause, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CaptionStyle, CropRegion, ReframeLayout } from '@/lib/types'
import { moveRegion } from './reframe-geometry'

interface CaptionPreview {
  segments: { startSec: number; endSec: number; text: string }[]
  style: CaptionStyle
}

interface CropStageProps {
  videoUrl: string
  layout: ReframeLayout
  regions: CropRegion[]
  activeRegion: number
  onActiveRegion: (index: number) => void
  onRegionsChange: (regions: CropRegion[]) => void
  onVideoAspect: (aspect: number) => void
  /** Approximate live caption preview (real karaoke/burn happens server-side). */
  captionPreview?: CaptionPreview | null
}

export function CropStage({
  videoUrl,
  layout,
  regions,
  activeRegion,
  onActiveRegion,
  onRegionsChange,
  onVideoAspect,
  captionPreview,
}: CropStageProps) {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const seekRef = React.useRef<HTMLDivElement>(null)
  const [videoAspect, setVideoAspect] = React.useState(16 / 9)
  const [playing, setPlaying] = React.useState(false)
  const [duration, setDuration] = React.useState(0)
  const [playhead, setPlayhead] = React.useState(0)
  const [drag, setDrag] = React.useState<{ index: number; dx: number; dy: number } | null>(null)
  const [seeking, setSeeking] = React.useState(false)

  /* Latest regions for the drag listener without re-subscribing each move. */
  const regionsRef = React.useRef(regions)
  React.useEffect(() => {
    regionsRef.current = regions
  }, [regions])

  // Drag a crop rectangle (global listeners so it survives leaving the box).
  React.useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent): void => {
      const el = stageRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const nx = (e.clientX - rect.left) / rect.width - drag.dx
      const ny = (e.clientY - rect.top) / rect.height - drag.dy
      const cur = regionsRef.current
      const region = cur[drag.index]
      if (!region) return
      const next = cur.slice()
      next[drag.index] = moveRegion(region, nx, ny)
      onRegionsChange(next)
    }
    const onUp = (): void => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, onRegionsChange])

  // Scrub the preview.
  React.useEffect(() => {
    if (!seeking) return
    const onMove = (e: PointerEvent): void => {
      const el = seekRef.current
      const v = videoRef.current
      if (!el || !v || !duration) return
      const rect = el.getBoundingClientRect()
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      v.currentTime = frac * duration
    }
    const onUp = (): void => setSeeking(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [seeking, duration])

  const togglePlay = (): void => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const pct = (sec: number): number =>
    duration > 0 ? Math.min(100, Math.max(0, (sec / duration) * 100)) : 0

  const capStyle = captionPreview?.style
  const currentCaption = captionPreview?.segments.find(
    (s) => playhead >= s.startSec && playhead < s.endSec
  )

  return (
    <div className="space-y-3">
      <div
        ref={stageRef}
        className="bg-background relative w-full max-w-xl select-none overflow-hidden rounded-xl border"
        style={{ aspectRatio: String(videoAspect), containerType: 'size' }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            setDuration(v.duration || 0)
            if (v.videoWidth && v.videoHeight) {
              const a = v.videoWidth / v.videoHeight
              setVideoAspect(a)
              onVideoAspect(a)
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
        />

        {regions.map((r, i) => {
          const isActive = i === activeRegion
          return (
            <div
              key={i}
              onPointerDown={(e) => {
                e.preventDefault()
                onActiveRegion(i)
                const el = stageRef.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                const px = (e.clientX - rect.left) / rect.width
                const py = (e.clientY - rect.top) / rect.height
                setDrag({ index: i, dx: px - r.x, dy: py - r.y })
              }}
              className={cn(
                'absolute cursor-move rounded-md ring-2 transition-colors',
                isActive ? 'ring-primary' : 'ring-foreground/50 hover:ring-foreground/80'
              )}
              style={{
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                ...(isActive
                  ? { boxShadow: '0 0 0 9999px color-mix(in srgb, var(--background) 55%, transparent)' }
                  : {}),
              }}
            >
              <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                {layout === 'split' ? (i === 0 ? 'Top' : 'Bottom') : 'Keep'}
              </span>
            </div>
          )
        })}

        {/* Approximate caption preview at the playhead (real burn is server-side). */}
        {currentCaption && capStyle ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 flex justify-center px-[6%] text-center leading-tight',
              capStyle.position === 'top'
                ? 'top-[6%]'
                : capStyle.position === 'center'
                  ? 'top-1/2 -translate-y-1/2'
                  : 'bottom-[6%]'
            )}
          >
            <span
              style={{
                color: capStyle.color,
                fontSize: `${capStyle.fontSizePct}cqh`,
                fontFamily: capStyle.fontFamily,
                fontWeight: 800,
                WebkitTextStroke: '0.04em var(--background)',
              }}
            >
              {capStyle.uppercase ? currentCaption.text.toUpperCase() : currentCaption.text}
            </span>
          </div>
        ) : null}
      </div>

      {/* Transport — the crop overlay covers the frame, so playback lives here. */}
      <div className="flex max-w-xl items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
          className="bg-foreground/10 hover:bg-foreground/20 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <div
          ref={seekRef}
          className="bg-foreground/10 relative h-2 flex-1 cursor-pointer rounded-full"
          onPointerDown={(e) => {
            setSeeking(true)
            const rect = e.currentTarget.getBoundingClientRect()
            const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
            const v = videoRef.current
            if (v && duration) v.currentTime = frac * duration
          }}
        >
          <div
            className="bg-primary absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${pct(playhead)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
