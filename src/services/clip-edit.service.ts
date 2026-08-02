/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getEditorClip, countActiveRenders,
 *   ACTIVE_CLIP_EDIT_STATUSES, clip edit service
 *
 * WHAT:  Pure Prisma reads for the Editor — the clip being edited (scoped to the
 *        org, with its current edit + parent job's transcript key) and the count
 *        of in-flight renders used for the per-plan concurrency cap.
 * WHY:   Reused by clips.getEditor / saveEdit / render / cancelRender. Tenancy is
 *        enforced by the `organizationId` filter here; no business logic (that's
 *        the router's job).
 * WHERE: Consumed by src/trpc/routers/clips.ts.
 */

import 'server-only'
import { ClipEditStatus } from '@/generated/prisma'
import type { DbClient } from '@/lib/config/prisma'

/** An edit in any of these counts against the per-plan concurrent-render cap. */
export const ACTIVE_CLIP_EDIT_STATUSES: ClipEditStatus[] = [
  ClipEditStatus.QUEUED,
  ClipEditStatus.RENDERING,
]

/**
 * The clip being edited, scoped to the org, with the fields the Editor needs:
 * its current `edit` (if any) and the parent job's transcript key (drives whether
 * captions are available). Returns null when the clip isn't in this org.
 */
export async function getEditorClip(db: DbClient, organizationId: string, clipId: string) {
  return db.clip.findFirst({
    where: { id: clipId, organizationId },
    include: {
      edit: true,
      clipJob: { select: { transcriptKey: true, durationSec: true } },
    },
  })
}

/** How many editor renders this org has queued or rendering right now. */
export async function countActiveRenders(db: DbClient, organizationId: string): Promise<number> {
  return db.clipEdit.count({
    where: { organizationId, status: { in: ACTIVE_CLIP_EDIT_STATUSES } },
  })
}
