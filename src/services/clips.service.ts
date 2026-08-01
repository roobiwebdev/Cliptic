/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: listClipJobs, getClipJobWithClips,
 *   countActiveClipJobs, ACTIVE_CLIP_JOB_STATUSES
 *
 * WHAT:  Pure Prisma reads for Cliptic — paginated job list, a single job with
 *        its clips, and the active-job count used for the concurrency cap.
 * WHY:   Reused from the clips router (list/get) and the create concurrency
 *        check. No auth/business logic here — that's the router's job.
 * WHERE: Consumed by src/trpc/routers/clips.ts.
 */

import 'server-only'
import { ClipJobStatus } from '@/generated/prisma'
import type { DbClient } from '@/lib/config/prisma'

/** Non-terminal statuses — a job in any of these counts against concurrency. */
export const ACTIVE_CLIP_JOB_STATUSES: ClipJobStatus[] = [
  ClipJobStatus.QUEUED,
  ClipJobStatus.DOWNLOADING,
  ClipJobStatus.TRANSCRIBING,
  ClipJobStatus.ANALYZING,
  ClipJobStatus.CUTTING,
]

export async function listClipJobs(
  db: DbClient,
  organizationId: string,
  pagination: { skip: number; take: number }
) {
  const [items, total] = await Promise.all([
    db.clipJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    db.clipJob.count({ where: { organizationId } }),
  ])
  return { items, total }
}

export async function getClipJobWithClips(db: DbClient, organizationId: string, id: string) {
  return db.clipJob.findFirst({
    where: { id, organizationId },
    include: { clips: { orderBy: { index: 'asc' } } },
  })
}

export async function countActiveClipJobs(db: DbClient, organizationId: string): Promise<number> {
  return db.clipJob.count({
    where: { organizationId, status: { in: ACTIVE_CLIP_JOB_STATUSES } },
  })
}
