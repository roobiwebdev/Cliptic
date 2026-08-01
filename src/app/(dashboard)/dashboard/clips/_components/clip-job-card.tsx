/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipJobCard
 *
 * WHAT:  A single clip-job card for the grid — title, status badge, and either
 *        a live progress bar (active), a clip count (done), or an error line.
 * WHERE: Rendered by clips-client.tsx.
 */

'use client'

import Link from 'next/link'
import { Scissors } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  isActiveStatus,
  statusBadgeVariant,
  statusLabel,
  type ClipJobListItem,
} from './clip-status'

function jobTitle(job: ClipJobListItem): string {
  if (job.title) return job.title
  if (job.sourceType === 'YOUTUBE') return job.sourceUrl ?? 'Video link'
  return 'Uploaded video'
}

export function ClipJobCard({ job }: { job: ClipJobListItem }) {
  const active = isActiveStatus(job.status)

  return (
    <Link href={`/dashboard/clips/${job.id}`} className="block">
      <Card className="hover:border-primary/50 h-full transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-base break-all">{jobTitle(job)}</CardTitle>
            <Badge variant={statusBadgeVariant(job.status)}>{statusLabel(job.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {active ? (
            <>
              <Progress value={job.progress} />
              <p className="text-muted-foreground text-sm">{job.currentStage ?? 'Working…'}</p>
            </>
          ) : job.status === 'COMPLETED' ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Scissors className="size-4" />
              {job.clipCount} clip{job.clipCount === 1 ? '' : 's'}
            </p>
          ) : job.status === 'FAILED' ? (
            <p className="text-destructive line-clamp-2 text-sm">{job.error ?? 'Processing failed'}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Canceled</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
