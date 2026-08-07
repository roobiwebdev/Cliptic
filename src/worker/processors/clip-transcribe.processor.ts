/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: clipTranscribeProcessor, handleClipTranscribe,
 *   clip transcript, on-demand transcription, caption fallback
 *
 * WHAT:  The BullMQ processor for on-demand CLIP transcription. Downloads the
 *        clip mp4, extracts compact audio, runs the configured Whisper provider
 *        (language AUTO-DETECTED — Amharic, English, anything), and stores the
 *        clip-relative transcript JSON + status on the Clip row.
 * WHY:   Clips whose job was never transcribed (manual cuts) get the SAME
 *        caption experience as AI clips — exact spoken words with word-level
 *        timing for karaoke, in the clip's own language. The transcript is
 *        naturally clip-relative because we transcribe the clip file itself.
 * WHERE: Registered into the Job Engine; run by src/worker/index.ts. Enqueued by
 *        clips.transcribeClip.
 */

import os from 'node:os'
import path from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/config/prisma'
import { registerProcessor, QUEUE_NAMES } from '@/lib/queue'
import type { ClipTranscribePayload } from '@/lib/types'
import { transcribe, extractAudioForTranscription, type Source } from '@/lib/media-pipeline'
import { putObject, downloadToFile, storageKeys } from '@/services/storage.service'
import { userSafeError } from '../lib/worker-error'

async function handleClipTranscribe(job: Job): Promise<void> {
  const { clipId, organizationId } = job.data as ClipTranscribePayload

  const safeJobId = String(job.id ?? clipId).replace(/[^\w-]/g, '_')
  const scratchDir = path.join(os.tmpdir(), 'cliptic-transcribe', clipId, safeJobId)
  await mkdir(scratchDir, { recursive: true })

  try {
    const clip = await prisma.clip.findFirst({
      where: { id: clipId, organizationId },
      select: { id: true, r2Key: true, transcriptStatus: true },
    })
    if (!clip) return
    /* Idempotent: a duplicate/stale delivery for a finished transcript is a no-op. */
    if (clip.transcriptStatus === 'COMPLETED') return

    await prisma.clip.update({
      where: { id: clipId },
      data: { transcriptStatus: 'TRANSCRIBING' },
    })

    // ── Clip mp4 → compact mono audio → Whisper (auto language) ──
    const localClip = path.join(scratchDir, 'clip.mp4')
    await downloadToFile(clip.r2Key, localClip)
    const audioPath = path.join(scratchDir, 'audio.mp3')
    await extractAudioForTranscription(localClip, audioPath)

    const source: Source = {
      videoId: clipId,
      sourceType: 'upload',
      isLocal: true,
      videoSource: localClip,
      audioPath,
      scratchDir,
    }
    const transcript = await transcribe(source)

    // ── Persist: clip-relative words (0 = clip start) + detected language ──
    const transcriptKey = storageKeys.clipTranscriptKey(organizationId, clipId)
    await putObject(transcriptKey, JSON.stringify(transcript), 'application/json')
    await prisma.clip.update({
      where: { id: clipId },
      data: { transcriptKey, transcriptStatus: 'COMPLETED' },
    })
  } catch (err) {
    await prisma.clip
      .update({
        where: { id: clipId },
        data: { transcriptStatus: 'FAILED' },
      })
      .catch(() => {})
    throw new Error(userSafeError(err))
  } finally {
    await rm(scratchDir, { recursive: true, force: true }).catch(() => {})
  }
}

registerProcessor(QUEUE_NAMES.clipTranscribe, handleClipTranscribe)
