/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: clipRenderProcessor, handleClipRender, editor export,
 *   renderEditSpec, ClipEdit render, clip-render worker
 *
 * WHAT:  The BullMQ processor for editor exports. Loads a ClipEdit + its Clip,
 *        downloads the clip mp4, applies the validated EditSpec via the Render
 *        Engine (reframe + burned captions), uploads the edited mp4 + poster to
 *        R2, and writes status/progress/output back onto the ClipEdit row.
 * WHY:   Same Job Engine as the clip pipeline, isolated on its own queue with its
 *        own payload/status so the two never entangle. Non-destructive: the source
 *        Clip is never touched — the edit output is a separate object.
 * WHERE: Registered into the Job Engine; run by src/worker/index.ts. Enqueued by
 *        clips.render.
 */

import os from 'node:os'
import path from 'node:path'
import { mkdir, rm, readFile } from 'node:fs/promises'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/config/prisma'
import { registerProcessor, QUEUE_NAMES } from '@/lib/queue'
import { parseEditSpec, type ClipEditRenderPayload } from '@/lib/types'
import { renderEditSpec, sliceTranscriptWords, type Word, type Transcript } from '@/lib/media-pipeline'
import { putObject, downloadToFile, downloadBuffer, storageKeys } from '@/services/storage.service'
import { userSafeError } from '../lib/worker-error'

/** Has this edit been cancelled since it was enqueued? (reload to see live status) */
async function isEditCanceled(clipEditId: string): Promise<boolean> {
  const row = await prisma.clipEdit.findUnique({ where: { id: clipEditId }, select: { status: true } })
  return !row || row.status === 'CANCELED'
}

async function handleClipRender(job: Job): Promise<void> {
  const { clipEditId } = job.data as ClipEditRenderPayload

  const safeJobId = String(job.id ?? clipEditId).replace(/[^\w-]/g, '_')
  const scratchDir = path.join(os.tmpdir(), 'cliptic-render', clipEditId, safeJobId)
  await mkdir(scratchDir, { recursive: true })

  try {
    const clipEdit = await prisma.clipEdit.findUnique({
      where: { id: clipEditId },
      include: { clip: { include: { clipJob: { select: { transcriptKey: true } } } } },
    })
    if (!clipEdit) return
    /* Idempotent: a duplicate/stale delivery for an edit that's already done or
     * cancelled must not re-render. A fresh export re-queues via QUEUED. */
    if (clipEdit.status === 'COMPLETED' || clipEdit.status === 'CANCELED') return

    const spec = parseEditSpec(clipEdit.spec)
    if (!spec) throw new Error('This edit has an invalid spec — re-open it in the Editor and save again.')

    const { clip } = clipEdit
    const organizationId = clipEdit.organizationId

    await prisma.clipEdit.update({
      where: { id: clipEditId },
      data: { status: 'RENDERING', progress: 10, currentStage: 'Preparing', error: null },
    })

    // ── Fetch the source clip mp4 ──
    const localInput = path.join(scratchDir, 'input.mp4')
    await downloadToFile(clip.r2Key, localInput)
    if (await isEditCanceled(clipEditId)) return
    await prisma.clipEdit.update({
      where: { id: clipEditId },
      data: { progress: 35, currentStage: 'Rendering' },
    })

    // ── Caption words (only when captions are on and the user hasn't edited the
    //    text): the clip's transcript window, shifted to clip-relative time. ──
    let captionWords: Word[] | undefined
    if (spec.captions?.enabled && !spec.captions.segments && clip.clipJob.transcriptKey) {
      try {
        const transcript = JSON.parse(
          (await downloadBuffer(clip.clipJob.transcriptKey)).toString('utf8')
        ) as Transcript
        captionWords = sliceTranscriptWords(transcript, clip.startSec, clip.endSec)
      } catch {
        /* captions are best-effort — a missing/broken transcript just skips them */
      }
    }

    // ── Render (reframe + optional caption burn) ──
    const result = await renderEditSpec({
      inputPath: localInput,
      spec,
      outDir: scratchDir,
      ...(captionWords ? { captionWords } : {}),
    })
    if (await isEditCanceled(clipEditId)) return
    await prisma.clipEdit.update({
      where: { id: clipEditId },
      data: { progress: 85, currentStage: 'Uploading' },
    })

    // ── Upload the edited output + poster ──
    const outputKey = storageKeys.clipEditOutputKey(organizationId, clipEditId)
    await putObject(outputKey, await readFile(result.outputPath), 'video/mp4')

    let thumbnailKey: string | undefined
    if (result.thumbnailPath) {
      thumbnailKey = storageKeys.clipEditThumbnailKey(organizationId, clipEditId)
      await putObject(thumbnailKey, await readFile(result.thumbnailPath), 'image/jpeg')
    }

    await prisma.clipEdit.update({
      where: { id: clipEditId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        currentStage: 'Done',
        error: null,
        outputR2Key: outputKey,
        outputThumbnailKey: thumbnailKey ?? null,
        outputSizeBytes: result.sizeBytes,
        outputDurationSec: result.durationSec,
        aspect: result.aspect,
        completedAt: new Date(),
      },
    })
  } catch (err) {
    await prisma.clipEdit
      .update({
        where: { id: clipEditId },
        data: { status: 'FAILED', currentStage: 'Failed', error: userSafeError(err) },
      })
      .catch(() => {})
    throw err // let BullMQ record the failure (and retry per queue policy)
  } finally {
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {})
  }
}

registerProcessor(QUEUE_NAMES.clipRender, handleClipRender)
