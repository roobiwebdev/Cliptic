/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipsClient
 *
 * WHAT:  The clips grid — lists the org's jobs and live-polls while any job is
 *        still processing. Renders loading skeletons and an empty state.
 * WHERE: Rendered by the clips page.
 */

'use client'

import { Scissors } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { ClipJobCard } from './clip-job-card'
import { NewClipDialog } from './new-clip-dialog'
import { isActiveStatus } from './clip-status'

export function ClipsClient() {
  const organizationId = useActiveOrganizationId()

  const { data, isLoading } = trpc.clips.list.useQuery(
    { organizationId: organizationId ?? '' },
    {
      enabled: organizationId !== undefined,
      /* Poll while any job is still processing, then stop. */
      refetchInterval: (query) =>
        query.state.data?.items.some((job) => isActiveStatus(job.status)) ? 3000 : false,
    }
  )

  if (organizationId === undefined || isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <Scissors className="text-muted-foreground size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No clips yet</p>
            <p className="text-muted-foreground text-sm">
              Paste a video link or upload a file to generate your first clips.
            </p>
          </div>
          <NewClipDialog />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((job) => (
        <ClipJobCard key={job.id} job={job} />
      ))}
    </div>
  )
}
