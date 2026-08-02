/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: clipsRouter, assertSafeSourceUrl, removeQueuedJob
 *
 * WHAT:  The Cliptic API — create (enqueue) a clip job, list/get jobs, cancel,
 *        delete, and mint a presigned upload URL. Built on protectedProcedure so
 *        auth, tenancy, the `clips:*` permission gate, the MONTHLY video quota
 *        (+ usage counter), rate limit, and audit are all automatic.
 * WHY:   The factory owns the monthly quota + counter on `clips.create`; the
 *        router only adds what the factory can't derive: the per-plan CONCURRENCY
 *        cap (cheap DB count), an SSRF guard on user URLs, and queue/storage
 *        orchestration. Per-video LENGTH caps are enforced in the worker (only it
 *        has ffmpeg to probe duration).
 * WHERE: Mounted as `clips` in src/trpc/routers/_app.ts.
 */

import { TRPCError } from '@trpc/server'
import { nanoid } from 'nanoid'
import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import {
  createClipJobSchema,
  clipJobRefSchema,
  listClipJobsSchema,
  createUploadUrlSchema,
  type ClipJobPayload,
} from '@/lib/types'
import { getClipPlanLimits } from '@/lib/config/clip-limits'
import { getOrganizationTier } from '@/lib/feature-gate'
import { enqueue, getQueue, QUEUE_NAMES } from '@/lib/queue'
import { slugify } from '@/lib/utils'
import * as clipsService from '@/services/clips.service'
import * as storage from '@/services/storage.service'

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELED']
const SIGNED_URL_TTL_SEC = 3600 // 1h — enough to preview + download

/* Block obvious SSRF targets. yt-dlp supports many hosts, so we only reject
 * loopback / link-local / private ranges and internal TLDs. */
function assertSafeSourceUrl(raw: string): void {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'That does not look like a valid URL.' })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only http(s) links are supported.' })
  }
  const host = parsed.hostname.toLowerCase()
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (blocked) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'That URL is not allowed.' })
  }
}

/* Best-effort removal of a not-yet-started queue job (active jobs are stopped
 * via the CANCELED status the worker checks between stages). */
async function removeQueuedJob(clipJobId: string): Promise<void> {
  /* Bounded so a slow/flaky Redis (e.g. a public proxy) can't hang the whole
   * cancel/delete mutation — the CANCELED status still stops the worker even if
   * the queue removal times out here. */
  try {
    await Promise.race([
      (async () => {
        const queue = getQueue(QUEUE_NAMES.clipProcessing)
        const job = await queue?.getJob(clipJobId)
        if (job) await job.remove()
      })(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('queue-remove-timeout')), 3000)),
    ])
  } catch {
    /* active/locked job or slow Redis — the CANCELED status handles it */
  }
}

function extFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]{2,5})$/)
  return match?.[1] ?? 'mp4'
}

export const clipsRouter = createTRPCRouter({
  /* Enqueue a clip job. Monthly quota + counter + audit are automatic; here we
   * add the concurrency cap, the URL guard, and the enqueue. */
  create: protectedProcedure({ requirePermission: permissions.CLIPS_CREATE })
    .input(createClipJobSchema)
    .mutation(async ({ ctx, input }) => {
      const tier = await getOrganizationTier(input.organizationId)
      const caps = getClipPlanLimits(tier.tier)
      const active = await clipsService.countActiveClipJobs(ctx.db, input.organizationId)
      if (active >= caps.maxConcurrentJobs) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Your plan allows ${caps.maxConcurrentJobs} clip job(s) at once. Let one finish, or upgrade for more.`,
        })
      }

      if (input.sourceType === 'YOUTUBE') {
        if (!input.url) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A video URL is required.' })
        assertSafeSourceUrl(input.url)
      }

      const job = await ctx.db.clipJob.create({
        data: {
          organizationId: input.organizationId,
          userId: ctx.user.id,
          sourceType: input.sourceType,
          sourceUrl: input.sourceType === 'YOUTUBE' ? (input.url ?? null) : null,
          uploadKey: input.sourceType === 'UPLOAD' ? (input.uploadKey ?? null) : null,
        },
      })

      /* delay:1000 gives the create transaction time to commit before the worker
       * can pick the job up (the processor also no-ops if the row isn't found). */
      await enqueue(
        QUEUE_NAMES.clipProcessing,
        'process',
        { clipJobId: job.id, organizationId: input.organizationId } satisfies ClipJobPayload,
        { jobId: job.id, delay: 1000 }
      )

      return job
    }),

  list: protectedProcedure({ requirePermission: permissions.CLIPS_READ, paginate: true })
    .input(listClipJobsSchema)
    .query(async ({ ctx, input }) => {
      return clipsService.listClipJobs(ctx.db, input.organizationId, ctx.pagination)
    }),

  /* One job + its clips, each with short-lived signed preview/download URLs. */
  get: protectedProcedure({ requirePermission: permissions.CLIPS_READ })
    .input(clipJobRefSchema)
    .query(async ({ ctx, input }) => {
      const job = await clipsService.getClipJobWithClips(ctx.db, input.organizationId, input.id)
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip job not found.' })

      const clips = await Promise.all(
        job.clips.map(async (clip) => {
          /* Two URLs from the same object: an INLINE one for the <video> preview,
           * and an ATTACHMENT one (Content-Disposition + slug filename) so the
           * Download button actually saves the file with a clean name. */
          const filename = `${slugify(clip.title ?? '', `clip-${clip.index}`)}.mp4`
          return {
            ...clip,
            videoUrl: await storage.getSignedDownloadUrl(clip.r2Key, SIGNED_URL_TTL_SEC),
            downloadUrl: await storage.getSignedDownloadUrl(clip.r2Key, SIGNED_URL_TTL_SEC, filename),
            thumbnailUrl: clip.thumbnailKey
              ? await storage.getSignedDownloadUrl(clip.thumbnailKey, SIGNED_URL_TTL_SEC)
              : null,
          }
        })
      )
      return { ...job, clips }
    }),

  /* Stop a running/queued job. Owner-authority gate reuses clips:delete. */
  cancel: protectedProcedure({ requirePermission: permissions.CLIPS_DELETE })
    .input(clipJobRefSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.clipJob.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      })
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip job not found.' })
      if (TERMINAL_STATUSES.includes(job.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This job has already finished.' })
      }
      const updated = await ctx.db.clipJob.update({
        where: { id: job.id },
        data: { status: 'CANCELED', currentStage: 'Canceled' },
      })
      await removeQueuedJob(job.id)
      return updated
    }),

  /* Delete a job, its clips (cascade), and its R2 artifacts. Factory decrements
   * the monthly counter. */
  delete: protectedProcedure({ requirePermission: permissions.CLIPS_DELETE })
    .input(clipJobRefSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.clipJob.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      })
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip job not found.' })

      await removeQueuedJob(job.id)
      await storage
        .deletePrefix(storage.storageKeys.clipJobPrefix(input.organizationId, job.id))
        .catch(() => {})
      if (job.uploadKey) await storage.deleteObject(job.uploadKey).catch(() => {})
      /* The persisted source lives under the separate `sources/` prefix. */
      if (job.sourceKey) await storage.deleteObject(job.sourceKey).catch(() => {})

      return ctx.db.clipJob.delete({ where: { id: job.id } })
    }),

  /* Presigned PUT so the browser uploads a source video straight to R2. */
  createUploadUrl: protectedProcedure({ requirePermission: permissions.CLIPS_CREATE, audit: false })
    .input(createUploadUrlSchema)
    .mutation(async ({ input }) => {
      const key = storage.storageKeys.pendingUploadKey(
        input.organizationId,
        nanoid(),
        extFromFilename(input.filename)
      )
      const uploadUrl = await storage.getSignedUploadUrl(key, input.contentType, 600)
      return { uploadUrl, uploadKey: key }
    }),
})
