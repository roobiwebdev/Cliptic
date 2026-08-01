/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: JobDetail, ClipCard, useAnimatedProgress,
 *   useElapsed, useRotatingHint
 *
 * WHAT:  A clip job's detail view — a live, always-moving progress panel while
 *        processing (real percentage + elapsed time + a per-stage task list with
 *        rotating status hints), then the clip grid with preview + download.
 * WHY:   Long stages (download, transcription) would otherwise look frozen. The
 *        percentage eases toward the server value and gently "creeps" within the
 *        current stage so it always feels alive, while the task list makes the
 *        real work legible. Polls clips.get every 1.5s and stops when terminal.
 * WHERE: Rendered by the /dashboard/clips/[jobId] page.
 */

'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  STAGE_STEPS,
  isActiveStatus,
  statusBadgeVariant,
  statusLabel,
  type ClipItem,
} from '../../_components/clip-status'

/* Soft ceiling the animated bar may "creep" to within each stage (just short of
 * the next real milestone) so a static server value never looks stuck. */
function stageCeiling(status: string): number {
  switch (status) {
    case 'QUEUED':
      return 4
    case 'DOWNLOADING':
      return 15
    case 'TRANSCRIBING':
      return 58
    case 'ANALYZING':
      return 69
    case 'CUTTING':
      return 97
    default:
      return 100
  }
}

/* Rotating flavour lines per stage — keeps the panel feeling alive during the
 * stages that don't emit granular server progress. */
const STAGE_HINTS: Record<string, readonly string[]> = {
  QUEUED: ['Waiting for a free worker…'],
  DOWNLOADING: ['Fetching just the audio (fast & light)…', 'No full video download needed…'],
  TRANSCRIBING: [
    'Transcribing speech to text…',
    'Aligning every word to a timestamp…',
    'Longer videos take a little longer…',
  ],
  ANALYZING: [
    'Reading the full transcript…',
    'Finding the most viral moments…',
    'Scoring hooks, payoffs & emotion…',
  ],
  CUTTING: ['Rendering clips…', 'Snapping edits to natural pauses…', 'Almost there…'],
}

function useAnimatedProgress(serverProgress: number, status: string, active: boolean): number {
  const [creep, setCreep] = React.useState(serverProgress)
  const serverRef = React.useRef(serverProgress)
  const statusRef = React.useRef(status)

  // Keep the latest values in refs (updated in an effect, never during render)
  // so the interval reads them without being torn down on every poll.
  React.useEffect(() => {
    serverRef.current = serverProgress
    statusRef.current = status
  }, [serverProgress, status])

  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setCreep((current) => {
        const base = Math.max(current, serverRef.current)
        const ceil = stageCeiling(statusRef.current)
        if (base >= ceil) return base
        return Math.min(ceil, base + Math.max(0.15, (ceil - base) * 0.04))
      })
    }, 450)
    return () => clearInterval(id)
  }, [active])

  // Snap-up is a render-time max() (no setState-in-effect); the interval only
  // grows the gentle creep toward the current stage ceiling.
  if (!active) return status === 'COMPLETED' ? 100 : Math.round(serverProgress)
  return Math.round(Math.max(creep, serverProgress))
}

function useElapsed(createdAt: Date | undefined, active: boolean): string {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  if (!createdAt) return '0:00'
  const secs = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function useRotatingHint(status: string, active: boolean): string | null {
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 2800)
    return () => clearInterval(id)
  }, [active, status])
  const list = STAGE_HINTS[status]
  if (!list || list.length === 0) return null
  return list[tick % list.length] ?? null
}

export function JobDetail({ jobId }: { jobId: string }) {
  const organizationId = useActiveOrganizationId()
  const router = useRouter()
  const utils = trpc.useUtils()

  const {
    data: job,
    isLoading,
    error,
  } = trpc.clips.get.useQuery(
    { organizationId: organizationId ?? '', id: jobId },
    {
      enabled: organizationId !== undefined,
      refetchInterval: (query) => (isActiveStatus(query.state.data?.status ?? '') ? 1500 : false),
    }
  )

  const active = job ? isActiveStatus(job.status) : false
  const displayPct = useAnimatedProgress(job?.progress ?? 0, job?.status ?? 'QUEUED', active)
  const elapsed = useElapsed(job?.createdAt, active)
  const hint = useRotatingHint(job?.status ?? 'QUEUED', active)

  const cancel = trpc.clips.cancel.useMutation({
    onSuccess: () => {
      void utils.clips.get.invalidate()
      void utils.clips.list.invalidate()
      toast.success('Job canceled')
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = trpc.clips.delete.useMutation({
    onSuccess: () => {
      void utils.clips.list.invalidate()
      toast.success('Job deleted')
      router.push('/dashboard/clips')
    },
    onError: (err) => toast.error(err.message),
  })

  if (organizationId === undefined || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (error || !job) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Not found</AlertTitle>
        <AlertDescription>This clip job could not be loaded.</AlertDescription>
      </Alert>
    )
  }

  const currentStageIndex = STAGE_STEPS.findIndex((step) => step.key === job.status)
  const heading = job.title ?? job.sourceUrl ?? 'Uploaded video'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/clips"
            aria-label="Back to clips"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <ArrowLeft />
          </Link>
          <div>
            <h2 className="text-lg font-semibold break-all">{heading}</h2>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={statusBadgeVariant(job.status)}>{statusLabel(job.status)}</Badge>
              {job.durationSec ? (
                <span className="text-muted-foreground text-xs">
                  {Math.round(job.durationSec / 60)} min source
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <Button
              variant="outline"
              onClick={() => cancel.mutate({ organizationId, id: jobId })}
              disabled={cancel.isPending}
            >
              <XCircle />
              Cancel
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => remove.mutate({ organizationId, id: jobId })}
              disabled={remove.isPending}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      </div>

      {active ? (
        <Card>
          <CardContent className="space-y-5 py-6">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-semibold tabular-nums">{displayPct}%</div>
                <p className="text-muted-foreground mt-1 text-sm">{job.currentStage ?? 'Starting…'}</p>
              </div>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="size-3" />
                {elapsed}
              </div>
            </div>

            <Progress value={displayPct} />

            <ul className="space-y-3 pt-1">
              {STAGE_STEPS.map((step, i) => {
                const done = currentStageIndex > i
                const isCurrent = currentStageIndex === i
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0">
                      {done ? (
                        <CheckCircle2 className="text-primary size-5" />
                      ) : isCurrent ? (
                        <Loader2 className="text-primary size-5 animate-spin" />
                      ) : (
                        <Circle className="text-muted-foreground/40 size-5" />
                      )}
                    </span>
                    <div className="flex-1">
                      <p
                        className={cn(
                          'text-sm',
                          isCurrent
                            ? 'text-foreground font-medium'
                            : done
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </p>
                      {isCurrent && hint ? (
                        <p className="text-muted-foreground text-xs">{hint}</p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {job.status === 'FAILED' ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Processing failed</AlertTitle>
          <AlertDescription>
            {job.error ?? 'Something went wrong while generating clips.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {job.status === 'CANCELED' ? (
        <Alert>
          <XCircle />
          <AlertTitle>Canceled</AlertTitle>
          <AlertDescription>This job was canceled before it finished.</AlertDescription>
        </Alert>
      ) : null}

      {job.clips.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {job.clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      ) : job.status === 'COMPLETED' ? (
        <p className="text-muted-foreground text-sm">No clips were produced for this video.</p>
      ) : null}
    </div>
  )
}

function ClipCard({ clip }: { clip: ClipItem }) {
  return (
    <Card className="overflow-hidden pt-0">
      <video
        className="aspect-video w-full bg-black"
        controls
        preload="metadata"
        poster={clip.thumbnailUrl ?? undefined}
      >
        <source src={clip.videoUrl} type="video/mp4" />
      </video>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{clip.title ?? `Clip ${clip.index}`}</CardTitle>
          {typeof clip.score === 'number' ? <Badge variant="secondary">{clip.score}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {clip.reason ? (
          <p className="text-muted-foreground line-clamp-3 text-sm">{clip.reason}</p>
        ) : null}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {(clip.endSec - clip.startSec).toFixed(0)}s
          </span>
          <a
            href={clip.videoUrl}
            download={`clip_${clip.index}.mp4`}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <Download />
            Download
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
