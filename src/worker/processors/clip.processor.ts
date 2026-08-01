/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: clipProcessor, registerProcessor, ClipJob pipeline
 *
 * WHAT:  The BullMQ processor for clip jobs — drives the media pipeline
 *        (source → transcribe → analyze → cut), persists status/progress to
 *        Postgres after each stage, uploads artifacts to R2, and writes Clip
 *        rows. Trusted backend: the job was already authorized at enqueue time.
 * WHY:   Long-running video work can't live in a request. Job state lives in the
 *        DB (the UI polls it) and the transcript is checkpointed to R2 so a
 *        retry resumes instead of re-transcribing. Scratch is always cleaned up.
 * WHERE: Registered into the Job Engine; run by src/worker/index.ts.
 */

import os from 'node:os'
import path from 'node:path'
import { mkdir, rm, readFile } from 'node:fs/promises'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/config/prisma'
import type { Prisma } from '@/generated/prisma'
import { registerProcessor, QUEUE_NAMES } from '@/lib/queue'
import { CLIP_STAGE_PROGRESS, type ClipJobPayload, type ClipJobTimings } from '@/lib/types'
import {
  resolveSource,
  transcribe,
  analyze,
  cut,
  probeDuration,
  mediaConfig,
  type Transcript,
  type ClipResult,
} from '@/lib/media-pipeline'
import { getOrganizationTier } from '@/lib/feature-gate'
import { getClipPlanLimits } from '@/lib/config/clip-limits'
import {
  putObject,
  downloadToFile,
  downloadBuffer,
  deleteObject,
  storageKeys,
} from '@/services/storage.service'

/** Is this job flagged cancelled? Reloads the row so cancel takes effect between stages. */
async function isCanceled(clipJobId: string): Promise<boolean> {
  const row = await prisma.clipJob.findUnique({ where: { id: clipJobId }, select: { status: true } })
  return !row || row.status === 'CANCELED'
}

/** User-safe failure message — never leak raw internals to the dashboard. */
function userSafeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.length > 300 ? `${msg.slice(0, 297)}…` : msg
}

async function handleClipJob(job: Job): Promise<void> {
  const { clipJobId } = job.data as ClipJobPayload

  const jobRow = await prisma.clipJob.findUnique({ where: { id: clipJobId } })
  if (!jobRow) return
  if (jobRow.status === 'COMPLETED' || jobRow.status === 'CANCELED') return

  const organizationId = jobRow.organizationId
  const scratchDir = path.join(os.tmpdir(), 'cliptic', clipJobId)
  const clipsDir = path.join(scratchDir, 'clips')
  await mkdir(clipsDir, { recursive: true })

  /* Throttled, fire-and-forget progress writers so real sub-progress (download
   * %, clip N of M) reaches the UI without blocking the pipeline. */
  let lastProgressAt = 0
  const reportDownload = (pct: number): void => {
    const now = Date.now()
    if (now - lastProgressAt < 1000) return
    lastProgressAt = now
    const mapped = 5 + Math.round((Math.min(100, Math.max(0, pct)) / 100) * 10) // 5–15
    void prisma.clipJob
      .update({
        where: { id: clipJobId },
        data: { progress: mapped, currentStage: `Downloading source — ${Math.round(pct)}%` },
      })
      .catch(() => {})
  }
  try {
    const startedAt = Date.now()
    let mark = startedAt
    const timings: ClipJobTimings = {}

    // ── STAGE 1: source (download audio-only / fetch upload) ──────────────
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: {
        status: 'DOWNLOADING',
        currentStage: 'Downloading source',
        progress: 5,
        llmProvider: mediaConfig.llmProvider,
        transcriber: mediaConfig.transcriber,
        error: null,
      },
    })

    let source
    if (jobRow.sourceType === 'UPLOAD') {
      if (!jobRow.uploadKey) throw new Error('Upload job is missing its uploaded file.')
      const localSrc = path.join(scratchDir, `source${path.extname(jobRow.uploadKey) || '.mp4'}`)
      await downloadToFile(jobRow.uploadKey, localSrc)
      source = await resolveSource({
        sourceType: 'upload',
        scratchDir,
        localPath: localSrc,
        ...(jobRow.externalVideoId ? { videoId: jobRow.externalVideoId } : {}),
      })
    } else {
      if (!jobRow.sourceUrl) throw new Error('YouTube job is missing its source URL.')
      source = await resolveSource({
        sourceType: 'youtube',
        scratchDir,
        url: jobRow.sourceUrl,
        onProgress: reportDownload,
        ...(jobRow.externalVideoId ? { videoId: jobRow.externalVideoId } : {}),
      })
    }

    // Enforce the per-plan max video length BEFORE the expensive AI stages.
    const durationSec = await probeDuration(source.audioPath)
    const caps = getClipPlanLimits((await getOrganizationTier(organizationId)).tier)
    if (Number.isFinite(caps.maxVideoMinutes) && durationSec / 60 > caps.maxVideoMinutes) {
      throw new Error(
        `This video is ${Math.round(durationSec / 60)} minutes long, which exceeds your plan limit of ${caps.maxVideoMinutes} minutes. Upgrade your plan for longer videos.`
      )
    }

    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: {
        externalVideoId: source.videoId,
        durationSec,
        progress: CLIP_STAGE_PROGRESS.DOWNLOADING,
      },
    })
    timings.downloadMs = Date.now() - mark
    timings.durationSec = Math.round(durationSec)
    mark = Date.now()
    console.log(`[timing] download+transcode ${(timings.downloadMs / 1000).toFixed(1)}s`)
    if (await isCanceled(clipJobId)) return

    // ── STAGE 2: transcribe (checkpointed to R2) ──────────────────────────
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: { status: 'TRANSCRIBING', currentStage: 'Transcribing audio' },
    })

    let transcript: Transcript
    if (jobRow.transcriptKey) {
      // Resume: reuse the cached transcript from a previous attempt.
      transcript = JSON.parse((await downloadBuffer(jobRow.transcriptKey)).toString('utf8')) as Transcript
    } else {
      transcript = await transcribe(source)
      const transcriptKey = storageKeys.transcriptKey(organizationId, clipJobId)
      await putObject(transcriptKey, JSON.stringify(transcript), 'application/json')
      await prisma.clipJob.update({
        where: { id: clipJobId },
        data: { transcriptKey, durationSec: transcript.duration },
      })
    }
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: { progress: CLIP_STAGE_PROGRESS.TRANSCRIBING },
    })
    timings.transcribeMs = Date.now() - mark
    mark = Date.now()
    console.log(`[timing] transcribe ${(timings.transcribeMs / 1000).toFixed(1)}s`)
    if (await isCanceled(clipJobId)) return

    // ── STAGE 3: analyze (LLM picks ranges) ───────────────────────────────
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: { status: 'ANALYZING', currentStage: 'Selecting the best moments' },
    })
    const ranges = await analyze(transcript)
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: { progress: CLIP_STAGE_PROGRESS.ANALYZING },
    })
    timings.analyzeMs = Date.now() - mark
    mark = Date.now()
    console.log(`[timing] analyze ${(timings.analyzeMs / 1000).toFixed(1)}s`)
    if (await isCanceled(clipJobId)) return

    // ── STAGE 4: cut (+ thumbnails) → upload to R2 → write Clip rows ───────
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: { status: 'CUTTING', currentStage: 'Cutting clips' },
    })
    /* Stream each clip the moment it's cut: upload → persist the row → bump
     * progress, so the UI shows clips as they land (time-to-first-clip). */
    const onClip = async (result: ClipResult, done: number, total: number): Promise<void> => {
      const r2Key = storageKeys.clipKey(organizationId, clipJobId, result.index)
      await putObject(r2Key, await readFile(result.path), 'video/mp4')

      let thumbnailKey: string | undefined
      if (result.thumbnailPath) {
        thumbnailKey = storageKeys.thumbnailKey(organizationId, clipJobId, result.index)
        await putObject(thumbnailKey, await readFile(result.thumbnailPath), 'image/jpeg')
      }

      await prisma.clip.create({
        data: {
          clipJobId,
          organizationId,
          index: result.index,
          title: result.range.title ?? null,
          reason: result.range.reason,
          score: result.range.score ?? null,
          startSec: result.range.start,
          endSec: result.range.end,
          r2Key,
          thumbnailKey: thumbnailKey ?? null,
          sizeBytes: result.sizeBytes ?? null,
          durationSec: result.range.end - result.range.start,
        },
      })

      await prisma.clipJob.update({
        where: { id: clipJobId },
        data: {
          progress: 70 + Math.round((done / Math.max(1, total)) * 30),
          currentStage: `Cutting clip ${done} of ${total}`,
          clipCount: done,
        },
      })
    }

    const results = await cut(source, ranges, transcript, clipsDir, onClip)

    // Retention: drop the uploaded source now that clips exist (keep clips only).
    if (jobRow.sourceType === 'UPLOAD' && jobRow.uploadKey) {
      await deleteObject(jobRow.uploadKey).catch(() => {})
    }

    timings.cutMs = Date.now() - mark
    timings.clips = results.length
    timings.totalMs = Date.now() - startedAt
    console.log(JSON.stringify({ logger: 'clip-timing', clipJobId, ...timings }))

    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: {
        status: 'COMPLETED',
        currentStage: 'Done',
        progress: 100,
        clipCount: results.length,
        completedAt: new Date(),
        error: null,
        /* Documented Prisma Json boundary cast (same pattern as audit metadata
         * in protected.ts) — ClipJobTimings is JSON-safe by construction. */
        timings: timings as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: { status: 'FAILED', currentStage: 'Failed', error: userSafeError(err) },
    })
    throw err // let BullMQ record the failure (and retry per queue policy)
  } finally {
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {})
  }
}

registerProcessor(QUEUE_NAMES.clipProcessing, handleClipJob)
