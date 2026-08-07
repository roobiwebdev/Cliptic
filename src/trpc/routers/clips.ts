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
  addManualClipSchema,
  suggestManualTitleSchema,
  editorClipRefSchema,
  saveEditSchema,
  parseManualRanges,
  createDefaultEditSpec,
  parseEditSpec,
  type ClipJobPayload,
  type ClipEditRenderPayload,
  type ManualRange,
} from '@/lib/types'
import type { Prisma } from '@/generated/prisma'
import { getClipPlanLimits } from '@/lib/config/clip-limits'
import { getOrganizationTier } from '@/lib/feature-gate'
import { enqueue, getQueue, QUEUE_NAMES } from '@/lib/queue'
import { slugify } from '@/lib/utils'
/* Import the title unit DIRECTLY from the analyze stage (not the media-pipeline
 * barrel) so the router graph never pulls in the ffmpeg/yt-dlp stages. */
import {
  generateTitleForRange,
  sliceTranscriptWindow,
  sliceTranscriptWords,
} from '@/lib/media-pipeline/stages/analyze'
/* Pure caption compiler (no ffmpeg) — safe in the web graph; seeds the editor's
 * default caption lines so they match exactly what the render burns. */
import { buildCaptionEvents } from '@/lib/media-pipeline/captions/ass'
import type { Transcript } from '@/lib/media-pipeline/types'
import * as clipsService from '@/services/clips.service'
import * as clipEditService from '@/services/clip-edit.service'
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

      /* MANUAL: the worker downloads ONLY this slice and cuts it. Bound the length
       * by the plan's per-video minutes so a "clip" can't be a whole long video. */
      if (input.mode === 'MANUAL' && input.manualRange) {
        const lengthSec = input.manualRange.endSec - input.manualRange.startSec
        const maxSec = Number.isFinite(caps.maxVideoMinutes) ? caps.maxVideoMinutes * 60 : Infinity
        if (lengthSec > maxSec) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `A single clip can be at most ${caps.maxVideoMinutes} minutes on your plan.`,
          })
        }
      }

      const job = await ctx.db.clipJob.create({
        data: {
          organizationId: input.organizationId,
          userId: ctx.user.id,
          sourceType: input.sourceType,
          /* MANUAL cuts only the user's exact range (stored below); the worker
           * skips download-whole/transcribe/analyze. */
          mode: input.mode,
          ...(input.mode === 'MANUAL' && input.manualRange
            ? { manualRanges: [input.manualRange] }
            : {}),
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
      /* Inline preview of the persisted 720p source — powers the manual-clip
       * studio's scrubber (frame-accurate to what the worker cuts). */
      const sourcePreviewUrl = job.sourceKey
        ? await storage.getSignedDownloadUrl(job.sourceKey, SIGNED_URL_TTL_SEC)
        : null
      return { ...job, clips, sourcePreviewUrl }
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

      /* Editor outputs live under their OWN `clip-edits/` prefix, so the FK
       * cascade removes the ClipEdit rows but NOT the R2 objects — wipe them. */
      const edits = await ctx.db.clipEdit.findMany({
        where: { organizationId: input.organizationId, clip: { clipJobId: job.id } },
        select: { id: true },
      })
      for (const edit of edits) {
        await storage
          .deletePrefix(storage.storageKeys.clipEditPrefix(input.organizationId, edit.id))
          .catch(() => {})
      }

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

  /* Suggest an AI title for a user-picked window. Reuses the job's CACHED
   * transcript (instant, no re-processing); empty when not yet transcribed. */
  suggestManualTitle: protectedProcedure({ requirePermission: permissions.CLIPS_READ })
    .input(suggestManualTitleSchema)
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.clipJob.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
        select: { transcriptKey: true },
      })
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip job not found.' })
      if (!job.transcriptKey) return { title: '' }

      const transcript = JSON.parse(
        (await storage.downloadBuffer(job.transcriptKey)).toString('utf8')
      ) as Transcript
      const title = await generateTitleForRange(
        sliceTranscriptWindow(transcript, input.startSec, input.endSec),
        transcript.language
      )
      return { title }
    }),

  /* Add ONE manual clip to an existing job. Named `addManualClip` (not `create`)
   * so it's gated by clips:create + rate limit but does NOT consume a monthly
   * video — the video was already paid for. The worker reuses the persisted
   * source (near-instant) and appends a MANUAL clip. */
  addManualClip: protectedProcedure({ requirePermission: permissions.CLIPS_CREATE })
    .input(addManualClipSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.clipJob.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      })
      if (!job) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip job not found.' })
      if (!job.sourceKey) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "This video's source has expired. Reprocess it to add more clips.",
        })
      }
      if (job.durationSec && input.endSec > job.durationSec + 0.5) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That range is past the end of the video.' })
      }

      /* Queue the pending range on the job (append to any already waiting) and
       * enqueue a manual cut with a UNIQUE jobId so it isn't deduped against the
       * original job. delay:1000 lets this tx commit before the worker reads. */
      const range: ManualRange = {
        startSec: input.startSec,
        endSec: input.endSec,
        ...(input.title ? { title: input.title } : {}),
      }
      const nextRanges = [...parseManualRanges(job.manualRanges), range]
      await ctx.db.clipJob.update({
        where: { id: job.id },
        data: { manualRanges: nextRanges },
      })
      await enqueue(
        QUEUE_NAMES.clipProcessing,
        'manual',
        { clipJobId: job.id, organizationId: input.organizationId } satisfies ClipJobPayload,
        { jobId: `${job.id}:manual:${nanoid()}`, delay: 1000 }
      )

      return { ok: true }
    }),

  /* ── Editor: reframe + burned captions. A ClipEdit holds the spec + render; the
   *    original Clip is never mutated. See src/lib/types/edit-spec.ts. ────────── */

  /* Load a clip for the Editor — its saved edit (or a default draft spec) + signed
   * preview/download URLs. Light enough to poll while an export renders. */
  getEditor: protectedProcedure({ requirePermission: permissions.CLIPS_READ })
    .input(editorClipRefSchema)
    .query(async ({ ctx, input }) => {
      const clip = await clipEditService.getEditorClip(ctx.db, input.organizationId, input.clipId)
      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip not found.' })

      const spec = (clip.edit && parseEditSpec(clip.edit.spec)) || createDefaultEditSpec()

      const clipPreviewUrl = await storage.getSignedDownloadUrl(clip.r2Key, SIGNED_URL_TTL_SEC)
      let editedPreviewUrl: string | null = null
      let editedDownloadUrl: string | null = null
      if (clip.edit?.outputR2Key) {
        const filename = `${slugify(clip.title ?? '', `clip-${clip.index}`)}-edited.mp4`
        editedPreviewUrl = await storage.getSignedDownloadUrl(clip.edit.outputR2Key, SIGNED_URL_TTL_SEC)
        editedDownloadUrl = await storage.getSignedDownloadUrl(
          clip.edit.outputR2Key,
          SIGNED_URL_TTL_SEC,
          filename
        )
      }

      return {
        clip: {
          id: clip.id,
          index: clip.index,
          title: clip.title,
          source: clip.source,
          startSec: clip.startSec,
          endSec: clip.endSec,
          durationSec: clip.durationSec,
          hasTranscript: Boolean(clip.clipJob.transcriptKey),
        },
        edit: clip.edit
          ? {
              id: clip.edit.id,
              status: clip.edit.status,
              progress: clip.edit.progress,
              currentStage: clip.edit.currentStage,
              error: clip.edit.error,
              aspect: clip.edit.aspect,
              outputDurationSec: clip.edit.outputDurationSec,
              outputSizeBytes: clip.edit.outputSizeBytes,
              updatedAt: clip.edit.updatedAt,
              completedAt: clip.edit.completedAt,
            }
          : null,
        spec,
        clipPreviewUrl,
        editedPreviewUrl,
        editedDownloadUrl,
      }
    }),

  /* Default caption lines for the Editor — the clip's transcript window grouped
   * into timed lines (the SAME grouping the render burns). Empty when the clip's
   * job has no transcript. Fetched once when the user turns captions on. */
  getEditorCaptions: protectedProcedure({ requirePermission: permissions.CLIPS_READ })
    .input(editorClipRefSchema)
    .query(async ({ ctx, input }) => {
      const clip = await ctx.db.clip.findFirst({
        where: { id: input.clipId, organizationId: input.organizationId },
        include: { clipJob: { select: { transcriptKey: true } } },
      })
      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip not found.' })

      const emptySegments: { startSec: number; endSec: number; text: string }[] = []
      if (!clip.clipJob.transcriptKey) return { segments: emptySegments }

      const transcript = JSON.parse(
        (await storage.downloadBuffer(clip.clipJob.transcriptKey)).toString('utf8')
      ) as Transcript
      const words = sliceTranscriptWords(transcript, clip.startSec, clip.endSec)
      const events = buildCaptionEvents({ words, uppercase: false, emoji: true })
      const segments = events.map((e) => ({
        startSec: Number(e.start.toFixed(2)),
        endSec: Number(e.end.toFixed(2)),
        text: e.words.map((w) => w.text).join(' '),
      }))
      return { segments }
    }),

  /* Save the draft edit spec (debounced autosave). Gated by clips:update; not
   * audited (draft writes are frequent) and consumes no quota. */
  saveEdit: protectedProcedure({ requirePermission: permissions.CLIPS_UPDATE, audit: false })
    .input(saveEditSchema)
    .mutation(async ({ ctx, input }) => {
      const clip = await ctx.db.clip.findFirst({
        where: { id: input.clipId, organizationId: input.organizationId },
        select: { id: true },
      })
      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip not found.' })

      /* Prisma Json boundary — the spec is Zod-validated by saveEditSchema above
       * (the same documented cast the worker uses for ClipJob.timings). */
      const spec = input.spec as Prisma.InputJsonValue
      await ctx.db.clipEdit.upsert({
        where: { clipId: input.clipId },
        create: {
          clipId: input.clipId,
          organizationId: input.organizationId,
          spec,
          status: 'DRAFT',
          aspect: input.spec.reframe.aspect,
        },
        update: { spec, status: 'DRAFT', aspect: input.spec.reframe.aspect, error: null },
      })
      return { ok: true }
    }),

  /* Export: persist the spec and enqueue a server render. Gated by clips:update +
   * the per-plan concurrent-render cap + the registry `render` rate-limit; audited
   * as `render`. Re-rendering an existing clip does NOT consume a monthly video. */
  render: protectedProcedure({ requirePermission: permissions.CLIPS_UPDATE })
    .input(saveEditSchema)
    .mutation(async ({ ctx, input }) => {
      const clip = await ctx.db.clip.findFirst({
        where: { id: input.clipId, organizationId: input.organizationId },
        select: { id: true },
      })
      if (!clip) throw new TRPCError({ code: 'NOT_FOUND', message: 'Clip not found.' })

      const existing = await ctx.db.clipEdit.findUnique({
        where: { clipId: input.clipId },
        select: { status: true },
      })
      if (existing && (existing.status === 'QUEUED' || existing.status === 'RENDERING')) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An export is already in progress for this clip.',
        })
      }

      const caps = getClipPlanLimits((await getOrganizationTier(input.organizationId)).tier)
      const active = await clipEditService.countActiveRenders(ctx.db, input.organizationId)
      if (active >= caps.maxConcurrentRenders) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Your plan allows ${caps.maxConcurrentRenders} export(s) at once. Let one finish, or upgrade for more.`,
        })
      }

      const spec = input.spec as Prisma.InputJsonValue
      const edit = await ctx.db.clipEdit.upsert({
        where: { clipId: input.clipId },
        create: {
          clipId: input.clipId,
          organizationId: input.organizationId,
          spec,
          status: 'QUEUED',
          currentStage: 'Queued',
          aspect: input.spec.reframe.aspect,
        },
        update: {
          spec,
          status: 'QUEUED',
          progress: 0,
          currentStage: 'Queued',
          error: null,
          aspect: input.spec.reframe.aspect,
          outputR2Key: null,
          outputThumbnailKey: null,
          outputSizeBytes: null,
          outputDurationSec: null,
          completedAt: null,
        },
      })

      /* Unique jobId (not deduped) so a re-export always runs; delay lets this tx
       * commit before the worker reads the row. */
      await enqueue(
        QUEUE_NAMES.clipRender,
        'render',
        { clipEditId: edit.id, organizationId: input.organizationId } satisfies ClipEditRenderPayload,
        { jobId: `render:${edit.id}:${nanoid()}`, delay: 500 }
      )

      return { id: edit.id, status: edit.status }
    }),

  /* Cancel an in-flight export. The render worker checks this CANCELED status
   * between steps (and no-ops if it hasn't started), so no queue removal needed. */
  cancelRender: protectedProcedure({ requirePermission: permissions.CLIPS_UPDATE, audit: false })
    .input(editorClipRefSchema)
    .mutation(async ({ ctx, input }) => {
      const edit = await ctx.db.clipEdit.findFirst({
        where: { clipId: input.clipId, organizationId: input.organizationId },
      })
      if (!edit) throw new TRPCError({ code: 'NOT_FOUND', message: 'No export to cancel.' })
      if (edit.status !== 'QUEUED' && edit.status !== 'RENDERING') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This export has already finished.' })
      }
      return ctx.db.clipEdit.update({
        where: { id: edit.id },
        data: { status: 'CANCELED', currentStage: 'Canceled' },
      })
    }),
})
