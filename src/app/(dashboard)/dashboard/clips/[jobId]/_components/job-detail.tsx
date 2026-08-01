/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: JobDetail, ClipCard
 *
 * WHAT:  A clip job's detail view — a live stage stepper while processing, then
 *        the clip grid with inline video preview + download, plus cancel/delete.
 * WHY:   Polls clips.get every 1.5s while active and stops on a terminal status.
 *        Video/thumbnail URLs are short-lived signed URLs minted by the router.
 * WHERE: Rendered by the /dashboard/clips/[jobId] page.
 */

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Trash2, XCircle } from 'lucide-react'

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

  const active = isActiveStatus(job.status)
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
            <Progress value={job.progress} />
            <div className="flex items-center justify-between">
              {STAGE_STEPS.map((step, i) => {
                const done = currentStageIndex > i
                const isCurrent = currentStageIndex === i
                return (
                  <div key={step.key} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border text-xs',
                        done
                          ? 'bg-primary text-primary-foreground border-primary'
                          : isCurrent
                            ? 'border-primary text-primary'
                            : 'text-muted-foreground'
                      )}
                    >
                      {done ? <CheckCircle2 className="size-4" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        'text-xs',
                        isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-muted-foreground text-center text-sm">
              {job.currentStage ?? 'Queued…'}
            </p>
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
