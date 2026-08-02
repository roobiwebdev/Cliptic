/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipEditor, reframe editor, edit spec, export render,
 *   aspect, split screen, autosave
 *
 * WHAT:  The Editor for one clip (v1: reframe). Builds the edit spec (output
 *        aspect, single/split layout, draggable crop regions), autosaves it, and
 *        exports via a server render — polling the render status, then showing the
 *        edited result with a direct download. The browser never renders video.
 * WHY:   Editing lives here (not in the create flow). Every control mutates ONE
 *        spec field; the same spec drives the server Render Engine, so new tools
 *        slot in without reworking this shell. Captions land in the next PR.
 * WHERE: /dashboard/clips/[jobId]/[clipId]/edit.
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Crop, Download, Loader2, Sparkles, XCircle } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { cn } from '@/lib/utils'
import { DEFAULT_CAPTION_STYLE } from '@/lib/types'
import type { AspectRatio, CaptionStyle, EditSpec, ReframeLayout } from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CropStage } from './crop-stage'
import { CaptionsPanel } from './captions-panel'
import { defaultRegions, regionRatio, regionSize, resizeRegion } from './reframe-geometry'

const ASPECTS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: '9:16', label: '9:16', hint: 'Reels / TikTok / Shorts' },
  { value: '1:1', label: '1:1', hint: 'Square feed' },
  { value: '16:9', label: '16:9', hint: 'Landscape' },
]
const LAYOUTS: { value: ReframeLayout; label: string; hint: string }[] = [
  { value: 'single', label: 'Single', hint: 'One crop fills the frame' },
  { value: 'split', label: 'Split', hint: 'Two stacked crops (top / bottom)' },
]

/* Statuses where an export is still working — drives polling + the busy UI. */
const RENDER_ACTIVE = new Set(['QUEUED', 'RENDERING'])

export function ClipEditor({ jobId, clipId }: { jobId: string; clipId: string }) {
  const organizationId = useActiveOrganizationId()
  const utils = trpc.useUtils()

  const { data, isLoading, error } = trpc.clips.getEditor.useQuery(
    { organizationId: organizationId ?? '', clipId },
    {
      enabled: organizationId !== undefined,
      refetchInterval: (query) =>
        RENDER_ACTIVE.has(query.state.data?.edit?.status ?? '') ? 1500 : false,
    }
  )

  const [localSpec, setLocalSpec] = React.useState<EditSpec | null>(null)
  const [activeRegion, setActiveRegion] = React.useState(0)
  const [videoAspect, setVideoAspect] = React.useState(16 / 9)
  const [seedingCaptions, setSeedingCaptions] = React.useState(false)
  const initializedRegions = React.useRef(false)

  /* The editable spec is the server's until the user touches it — then the local
   * copy wins, so later poll refetches refresh render status without clobbering
   * in-progress edits. Deriving it (vs a seeding effect) avoids set-state-in-effect. */
  const spec = localSpec ?? data?.spec ?? null

  const saveEdit = trpc.clips.saveEdit.useMutation()
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const applySpec = React.useCallback(
    (next: EditSpec, save = true): void => {
      setLocalSpec(next)
      if (!save || organizationId === undefined) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveEdit.mutate({ organizationId, clipId, spec: next })
      }, 700)
    },
    [organizationId, clipId, saveEdit]
  )

  /* When the true video aspect arrives, snap a FRESH (unsaved) clip's crop to it.
   * Done in the video's event callback — NOT an effect — so we never set state
   * synchronously inside an effect body. */
  const handleVideoAspect = React.useCallback(
    (aspect: number): void => {
      setVideoAspect(aspect)
      if (initializedRegions.current) return
      initializedRegions.current = true
      const current = localSpec ?? data?.spec
      if (data?.edit || !current) return
      applySpec(
        {
          ...current,
          reframe: {
            ...current.reframe,
            regions: defaultRegions(current.reframe.aspect, current.reframe.layout, aspect),
          },
        },
        false
      )
    },
    [localSpec, data, applySpec]
  )

  const render = trpc.clips.render.useMutation({
    onSuccess: () => {
      toast.success('Exporting your clip…')
      if (organizationId !== undefined) void utils.clips.getEditor.invalidate({ organizationId, clipId })
    },
    onError: (err) => toast.error(err.message),
  })
  const cancelRender = trpc.clips.cancelRender.useMutation({
    onSuccess: () => {
      if (organizationId !== undefined) void utils.clips.getEditor.invalidate({ organizationId, clipId })
    },
    onError: (err) => toast.error(err.message),
  })

  if (organizationId === undefined || isLoading || !spec) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Skeleton className="aspect-video w-full max-w-xl rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t open the editor</AlertTitle>
        <AlertDescription>This clip could not be loaded.</AlertDescription>
      </Alert>
    )
  }

  const { reframe } = spec
  const ratio = regionRatio(reframe.aspect, reframe.layout, videoAspect)
  const activeRegionObj = reframe.regions[activeRegion]
  const activeSize = activeRegionObj ? regionSize(activeRegionObj, ratio) : 1
  const editStatus = data.edit?.status ?? null
  const rendering = editStatus !== null && RENDER_ACTIVE.has(editStatus)

  const setAspect = (aspect: AspectRatio): void => {
    applySpec({
      ...spec,
      reframe: { ...reframe, aspect, regions: defaultRegions(aspect, reframe.layout, videoAspect) },
    })
  }
  const setLayout = (layout: ReframeLayout): void => {
    setActiveRegion(0)
    applySpec({
      ...spec,
      reframe: { ...reframe, layout, regions: defaultRegions(reframe.aspect, layout, videoAspect) },
    })
  }
  const setRegions = (regions: EditSpec['reframe']['regions']): void => {
    applySpec({ ...spec, reframe: { ...reframe, regions } })
  }
  const setActiveSize = (size: number): void => {
    const region = reframe.regions[activeRegion]
    if (!region) return
    const next = reframe.regions.slice()
    next[activeRegion] = resizeRegion(region, ratio, size)
    setRegions(next)
  }

  // ── Captions ──
  const seedSegments = async (): Promise<{ startSec: number; endSec: number; text: string }[]> => {
    const res = await utils.clips.getEditorCaptions.fetch({ organizationId, clipId })
    return res.segments
  }
  const toggleCaptions = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      applySpec({
        ...spec,
        captions: spec.captions ? { ...spec.captions, enabled: false } : undefined,
      })
      return
    }
    setSeedingCaptions(true)
    try {
      const segments = spec.captions?.segments ?? (await seedSegments())
      const style: CaptionStyle = spec.captions?.style ?? DEFAULT_CAPTION_STYLE
      applySpec({ ...spec, captions: { enabled: true, style, segments } })
    } catch {
      toast.error('Could not load captions for this clip.')
    } finally {
      setSeedingCaptions(false)
    }
  }
  const updateCaptionStyle = (patch: Partial<CaptionStyle>): void => {
    if (!spec.captions) return
    applySpec({
      ...spec,
      captions: { ...spec.captions, style: { ...spec.captions.style, ...patch } },
    })
  }
  const updateSegmentText = (index: number, text: string): void => {
    const caps = spec.captions
    if (!caps?.segments) return
    const segments = caps.segments.slice()
    const seg = segments[index]
    if (!seg) return
    segments[index] = { ...seg, text }
    applySpec({ ...spec, captions: { ...caps, segments } })
  }
  const resetCaptions = async (): Promise<void> => {
    if (!spec.captions) return
    setSeedingCaptions(true)
    try {
      const segments = await seedSegments()
      applySpec({ ...spec, captions: { ...spec.captions, segments } })
    } catch {
      toast.error('Could not reload captions.')
    } finally {
      setSeedingCaptions(false)
    }
  }
  const captionPreview =
    spec.captions?.enabled && spec.captions.segments
      ? { segments: spec.captions.segments, style: spec.captions.style }
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/clips/${jobId}`}
            aria-label="Back to clip job"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeft />
          </Link>
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Crop className="size-4" />
              {data.clip.title ?? `Clip ${data.clip.index}`}
            </h2>
            <p className="text-muted-foreground text-xs">Reframe &amp; export — captions coming soon.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Preview + crop */}
        <div>
          <CropStage
            videoUrl={data.clipPreviewUrl}
            layout={reframe.layout}
            regions={reframe.regions}
            activeRegion={activeRegion}
            onActiveRegion={setActiveRegion}
            onRegionsChange={setRegions}
            onVideoAspect={handleVideoAspect}
            captionPreview={captionPreview}
          />
          <p className="text-muted-foreground mt-2 max-w-xl text-xs">
            Drag the highlighted box to position the subject. Everything outside it is cropped away.
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">Aspect ratio</p>
                <div className="grid grid-cols-3 gap-2">
                  {ASPECTS.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setAspect(a.value)}
                      title={a.hint}
                      className={cn(
                        'rounded-lg border py-2 text-xs font-medium transition-colors',
                        reframe.aspect === a.value
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">Layout</p>
                <div className="grid grid-cols-2 gap-2">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setLayout(l.value)}
                      title={l.hint}
                      className={cn(
                        'rounded-lg border py-2 text-xs font-medium transition-colors',
                        reframe.layout === l.value
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Position</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reframe.layout === 'split' ? (
                <div className="grid grid-cols-2 gap-2">
                  {['Top', 'Bottom'].map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setActiveRegion(i)}
                      className={cn(
                        'rounded-lg border py-2 text-xs font-medium transition-colors',
                        activeRegion === i
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs">Zoom</p>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(activeSize * 100)}
                  onChange={(e) => setActiveSize(Number(e.target.value) / 100)}
                  className="accent-primary w-full"
                  aria-label="Crop zoom"
                />
              </div>
            </CardContent>
          </Card>

          <CaptionsPanel
            captions={spec.captions}
            hasTranscript={data.clip.hasTranscript}
            seeding={seedingCaptions}
            onToggle={(v) => void toggleCaptions(v)}
            onStyleChange={updateCaptionStyle}
            onSegmentText={updateSegmentText}
            onReset={() => void resetCaptions()}
          />

          <Card className="glass">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rendering ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="text-primary size-4 animate-spin" />
                    {data.edit?.currentStage ?? 'Rendering…'}
                  </div>
                  <Progress value={data.edit?.progress ?? 5} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={cancelRender.isPending}
                    onClick={() => cancelRender.mutate({ organizationId, clipId })}
                  >
                    <XCircle />
                    Cancel export
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    className="w-full"
                    disabled={render.isPending}
                    onClick={() => render.mutate({ organizationId, clipId, spec })}
                  >
                    {render.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Export {reframe.aspect}
                  </Button>

                  {editStatus === 'FAILED' ? (
                    <Alert variant="destructive">
                      <AlertTitle>Export failed</AlertTitle>
                      <AlertDescription>
                        {data.edit?.error ?? 'Something went wrong while rendering.'}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {editStatus === 'COMPLETED' && data.editedPreviewUrl ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Ready</Badge>
                        {data.edit?.aspect ? (
                          <span className="text-muted-foreground text-xs">{data.edit.aspect}</span>
                        ) : null}
                      </div>
                      <video
                        className="w-full rounded-lg bg-black"
                        controls
                        preload="metadata"
                        src={data.editedPreviewUrl}
                      />
                      {data.editedDownloadUrl ? (
                        <a
                          href={data.editedDownloadUrl}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full')}
                        >
                          <Download />
                          Download
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
