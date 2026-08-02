/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: clipProcessor, registerProcessor, ClipJob pipeline,
 *   runAutoPipeline, runManualPrepare, runManualCut, acquireSource, persistSource,
 *   getOrMakeTranscript, makeOnClip
 *
 * WHAT:  The BullMQ processor for clip jobs. Dispatches to one of three paths:
 *        AUTO (source → transcribe → analyze → cut), MANUAL-PREPARE (ingest a
 *        manual-mode source and stop, ready for the studio), and MANUAL-CUT (cut
 *        the user's pending ranges and append them). Persists status/progress to
 *        Postgres, uploads artifacts to R2, and writes Clip rows. Trusted backend:
 *        the job was already authorized at enqueue time.
 * WHY:   Long-running video work can't live in a request. Job state lives in the
 *        DB (the UI polls it); the transcript AND the 720p source are checkpointed
 *        to R2 so retries resume and MANUAL re-cuts reuse the source (near-instant,
 *        never re-hitting YouTube). Scratch is always cleaned up.
 * WHERE: Registered into the Job Engine; run by src/worker/index.ts.
 */

import os from 'node:os'
import path from 'node:path'
import { mkdir, rm, readFile } from 'node:fs/promises'
import type { Job } from 'bullmq'
import { prisma } from '@/lib/config/prisma'
import { Prisma, type ClipJob } from '@/generated/prisma'
import { registerProcessor, QUEUE_NAMES } from '@/lib/queue'
import {
  CLIP_STAGE_PROGRESS,
  parseManualRanges,
  type ClipJobPayload,
  type ClipJobTimings,
  type ManualRange,
} from '@/lib/types'
import {
  resolveSource,
  resolveYoutubeSection,
  transcribe,
  analyze,
  cut,
  probeDuration,
  mediaConfig,
  generateTitleForRange,
  sliceTranscriptWindow,
  type Transcript,
  type ClipResult,
  type Source,
} from '@/lib/media-pipeline'
import { getOrganizationTier } from '@/lib/feature-gate'
import { getClipPlanLimits } from '@/lib/config/clip-limits'
import { formatClock } from '@/lib/utils'
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

/** Content-type from a source extension so the studio's <video> preview plays
 *  non-mp4 uploads (mov/webm) correctly. YouTube sources are always mp4. */
function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'mkv':
      return 'video/x-matroska'
    case 'avi':
      return 'video/x-msvideo'
    default:
      return 'video/mp4'
  }
}

/* Throttled download-progress writer so real download % reaches the UI (5–15%). */
function makeDownloadReporter(clipJobId: string): (pct: number) => void {
  let lastAt = 0
  return (pct: number): void => {
    const now = Date.now()
    if (now - lastAt < 1000) return
    lastAt = now
    const mapped = 5 + Math.round((Math.min(100, Math.max(0, pct)) / 100) * 10)
    void prisma.clipJob
      .update({
        where: { id: clipJobId },
        data: { progress: mapped, currentStage: `Downloading source — ${Math.round(pct)}%` },
      })
      .catch(() => {})
  }
}

/* ── Shared stages (reused across AUTO / MANUAL-PREPARE / MANUAL-CUT) ────────── */

/** STAGE 1 — download/upload → Source, enforce the per-plan length cap, record ids. */
async function acquireSource(
  jobRow: ClipJob,
  scratchDir: string
): Promise<{ source: Source; durationSec: number }> {
  let source: Source
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
      onProgress: makeDownloadReporter(jobRow.id),
      ...(jobRow.externalVideoId ? { videoId: jobRow.externalVideoId } : {}),
    })
  }

  const durationSec = await probeDuration(source.audioPath)
  const caps = getClipPlanLimits((await getOrganizationTier(jobRow.organizationId)).tier)
  if (Number.isFinite(caps.maxVideoMinutes) && durationSec / 60 > caps.maxVideoMinutes) {
    throw new Error(
      `This video is ${Math.round(durationSec / 60)} minutes long, which exceeds your plan limit of ${caps.maxVideoMinutes} minutes. Upgrade your plan for longer videos.`
    )
  }
  await prisma.clipJob.update({
    where: { id: jobRow.id },
    data: { externalVideoId: source.videoId, durationSec },
  })
  return { source, durationSec }
}

/** Persist the 720p source under `sources/` so later MANUAL cuts reuse it. Non-fatal. */
async function persistSource(jobRow: ClipJob, source: Source): Promise<void> {
  try {
    const ext = path.extname(source.videoSource).replace('.', '') || 'mp4'
    const sourceKey = storageKeys.sourceKey(jobRow.organizationId, jobRow.id, ext)
    await putObject(sourceKey, await readFile(source.videoSource), mimeForExt(ext))
    await prisma.clipJob.update({ where: { id: jobRow.id }, data: { sourceKey } })
    /* The upload staging object is redundant once the source is persisted. */
    if (jobRow.sourceType === 'UPLOAD' && jobRow.uploadKey) {
      await deleteObject(jobRow.uploadKey).catch(() => {})
    }
  } catch (err) {
    console.warn(`[clip] source persist failed for ${jobRow.id}: ${userSafeError(err)}`)
  }
}

/** STAGE 2 — the cached transcript (retry/manual reuse) or transcribe + cache it. */
async function getOrMakeTranscript(jobRow: ClipJob, source: Source): Promise<Transcript> {
  if (jobRow.transcriptKey) {
    return JSON.parse((await downloadBuffer(jobRow.transcriptKey)).toString('utf8')) as Transcript
  }
  const transcript = await transcribe(source)
  const transcriptKey = storageKeys.transcriptKey(jobRow.organizationId, jobRow.id)
  await putObject(transcriptKey, JSON.stringify(transcript), 'application/json')
  await prisma.clipJob.update({
    where: { id: jobRow.id },
    data: { transcriptKey, durationSec: transcript.duration },
  })
  return transcript
}

/**
 * Streams one finished clip → R2 (video + thumbnail) → a Clip row. `indexOffset`
 * lets MANUAL cuts append after existing clips; `clipSource` badges AI vs MANUAL.
 */
function makeOnClip(
  clipJobId: string,
  organizationId: string,
  opts: {
    clipSource: 'AI' | 'MANUAL'
    indexOffset: number
    onProgress?: (done: number, total: number) => Prisma.ClipJobUpdateInput
  }
): (result: ClipResult, done: number, total: number) => Promise<void> {
  return async (result, done, total) => {
    const index = opts.indexOffset + result.index
    const r2Key = storageKeys.clipKey(organizationId, clipJobId, index)
    await putObject(r2Key, await readFile(result.path), 'video/mp4')

    let thumbnailKey: string | undefined
    if (result.thumbnailPath) {
      thumbnailKey = storageKeys.thumbnailKey(organizationId, clipJobId, index)
      await putObject(thumbnailKey, await readFile(result.thumbnailPath), 'image/jpeg')
    }

    await prisma.clip.create({
      data: {
        clipJobId,
        organizationId,
        index,
        source: opts.clipSource,
        title: result.range.title ?? null,
        reason: result.range.reason || null,
        score: result.range.score ?? null,
        startSec: result.range.start,
        endSec: result.range.end,
        r2Key,
        thumbnailKey: thumbnailKey ?? null,
        sizeBytes: result.sizeBytes ?? null,
        durationSec: result.range.end - result.range.start,
      },
    })

    if (opts.onProgress) {
      await prisma.clipJob.update({ where: { id: clipJobId }, data: opts.onProgress(done, total) })
    }
  }
}

/* ── Path 1: AUTO — the LLM picks clips (unchanged behavior) ─────────────────── */

async function runAutoPipeline(jobRow: ClipJob, scratchDir: string, clipsDir: string): Promise<void> {
  const clipJobId = jobRow.id
  const organizationId = jobRow.organizationId
  const startedAt = Date.now()
  let mark = startedAt
  const timings: ClipJobTimings = {}

  // ── STAGE 1: source ──
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
  const { source, durationSec } = await acquireSource(jobRow, scratchDir)
  await prisma.clipJob.update({
    where: { id: clipJobId },
    data: { progress: CLIP_STAGE_PROGRESS.DOWNLOADING },
  })
  timings.downloadMs = Date.now() - mark
  timings.durationSec = Math.round(durationSec)
  mark = Date.now()
  console.log(`[timing] download+transcode ${(timings.downloadMs / 1000).toFixed(1)}s`)
  if (await isCanceled(clipJobId)) return

  // ── STAGE 2: transcribe ──
  await prisma.clipJob.update({
    where: { id: clipJobId },
    data: { status: 'TRANSCRIBING', currentStage: 'Transcribing audio' },
  })
  const transcript = await getOrMakeTranscript(jobRow, source)
  await prisma.clipJob.update({
    where: { id: clipJobId },
    data: { progress: CLIP_STAGE_PROGRESS.TRANSCRIBING },
  })
  timings.transcribeMs = Date.now() - mark
  mark = Date.now()
  console.log(`[timing] transcribe ${(timings.transcribeMs / 1000).toFixed(1)}s`)
  if (await isCanceled(clipJobId)) return

  // ── STAGE 3: analyze ──
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

  // ── STAGE 4: cut → upload → Clip rows (streamed) ──
  await prisma.clipJob.update({
    where: { id: clipJobId },
    data: { status: 'CUTTING', currentStage: 'Cutting clips' },
  })
  const onClip = makeOnClip(clipJobId, organizationId, {
    clipSource: 'AI',
    indexOffset: 0,
    onProgress: (done, total) => ({
      progress: 70 + Math.round((done / Math.max(1, total)) * 30),
      currentStage: `Cutting clip ${done} of ${total}`,
      clipCount: done,
    }),
  })
  const results = await cut(source, ranges, transcript, clipsDir, onClip)

  // Persist the source for future MANUAL re-cuts (kept under `sources/`).
  await persistSource(jobRow, source)

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
      timings: timings as Prisma.InputJsonValue,
    },
  })
}

/* ── Path 2: MANUAL-CUT — download/reuse only what's needed and cut the user's
 *    EXACT range(s). For a fresh YouTube manual clip this fetches ONLY the
 *    section (fast); no full-video download, transcript, or analyze. ─────────── */

/** A whole-video source we can cut ANY range from — the persisted 720p source
 *  (adding a clip to a processed video) or a downloaded upload. Returns null when
 *  there's no whole source (a fresh YouTube manual clip → section-download each). */
async function sharedManualSource(
  jobRow: ClipJob,
  scratchDir: string
): Promise<{ source: Source; transcript: Transcript | undefined } | null> {
  if (jobRow.sourceKey) {
    const ext = path.extname(jobRow.sourceKey).replace('.', '') || 'mp4'
    const local = path.join(scratchDir, `source.${ext}`)
    try {
      await downloadToFile(jobRow.sourceKey, local)
      const source: Source = {
        videoId: jobRow.externalVideoId ?? jobRow.id,
        sourceType: jobRow.sourceType === 'UPLOAD' ? 'upload' : 'youtube',
        isLocal: true,
        videoSource: local,
        audioPath: '',
        scratchDir,
      }
      const transcript = jobRow.transcriptKey
        ? (JSON.parse((await downloadBuffer(jobRow.transcriptKey)).toString('utf8')) as Transcript)
        : undefined
      return { source, transcript }
    } catch {
      /* persisted source expired/missing — fall through */
    }
  }
  if (jobRow.sourceType === 'UPLOAD' && jobRow.uploadKey) {
    const localSrc = path.join(scratchDir, `source${path.extname(jobRow.uploadKey) || '.mp4'}`)
    await downloadToFile(jobRow.uploadKey, localSrc)
    const source: Source = {
      videoId: jobRow.externalVideoId ?? jobRow.id,
      sourceType: 'upload',
      isLocal: true,
      videoSource: localSrc,
      audioPath: '',
      scratchDir,
    }
    return { source, transcript: undefined }
  }
  return null
}

/** Title for a manual range — the user's own, else AI from the window's words
 *  (cached transcript, or a transcribe of the fetched section), else a timestamp. */
async function manualTitle(
  range: ManualRange,
  cutStart: number,
  cutEnd: number,
  source: Source,
  transcript: Transcript | undefined
): Promise<string> {
  if (range.title) return range.title
  let text = ''
  if (transcript) text = sliceTranscriptWindow(transcript, cutStart, cutEnd)
  else if (source.audioPath) {
    try {
      text = (await transcribe(source)).text
    } catch {
      /* transcription is best-effort for the title */
    }
  }
  return (
    (await generateTitleForRange(text)) || `Clip ${formatClock(range.startSec)}–${formatClock(range.endSec)}`
  )
}

async function runManualCut(
  jobRow: ClipJob,
  pending: ManualRange[],
  scratchDir: string,
  clipsDir: string
): Promise<void> {
  const clipJobId = jobRow.id
  const organizationId = jobRow.organizationId
  /* Appending to a video that already has clips? On failure we must NOT destroy
   * access to them, so revert to COMPLETED instead of FAILED. */
  const wasCompleted = jobRow.status === 'COMPLETED' || jobRow.clipCount > 0

  await prisma.clipJob.update({
    where: { id: clipJobId },
    data: { status: 'CUTTING', currentStage: 'Cutting your clip', progress: 40, error: null },
  })

  try {
    // A whole source we can reuse for every range, or null ⇒ section-download each.
    const shared = await sharedManualSource(jobRow, scratchDir)

    let created = 0
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i]
      if (!r) continue

      let source: Source
      let transcript: Transcript | undefined
      let cutStart: number
      let cutEnd: number

      if (shared) {
        source = shared.source
        transcript = shared.transcript
        cutStart = Math.max(0, r.startSec)
        cutEnd = jobRow.durationSec ? Math.min(r.endSec, jobRow.durationSec) : r.endSec
      } else {
        if (!jobRow.sourceUrl) throw new Error('This clip is missing its source video.')
        // Download ONLY this slice — the whole point of manual mode.
        source = await resolveYoutubeSection({
          url: jobRow.sourceUrl,
          startSec: r.startSec,
          endSec: r.endSec,
          scratchDir: path.join(scratchDir, `sec-${i}`),
        })
        transcript = undefined
        cutStart = 0
        cutEnd = Math.max(0.5, r.endSec - r.startSec) // the section's timeline is 0..len
      }
      if (cutEnd - cutStart < 1) continue

      const title = await manualTitle(r, cutStart, cutEnd, source, transcript)
      const outDir = path.join(clipsDir, String(i))
      await mkdir(outDir, { recursive: true })
      const onClip = makeOnClip(clipJobId, organizationId, {
        clipSource: 'MANUAL',
        indexOffset: jobRow.clipCount + created,
      })
      /* undefined transcript ⇒ cut() honors the exact in/out (no silence-snap). */
      await cut(source, [{ start: cutStart, end: cutEnd, reason: '', title }], undefined, outDir, onClip)
      created += 1
    }

    if (created === 0) throw new Error('No valid range to cut for this manual clip.')

    await prisma.clipJob.update({
      where: { id: clipJobId },
      data: {
        status: 'COMPLETED',
        currentStage: 'Done',
        progress: 100,
        clipCount: jobRow.clipCount + created,
        manualRanges: Prisma.DbNull, // pending ranges consumed
        completedAt: new Date(),
        error: null,
      },
    })
  } catch (err) {
    if (wasCompleted) {
      // Preserve the existing clips; surface a soft error, don't retry-loop.
      await prisma.clipJob.update({
        where: { id: clipJobId },
        data: {
          status: 'COMPLETED',
          currentStage: 'Done',
          progress: 100,
          manualRanges: Prisma.DbNull,
          error: `Couldn't add that clip: ${userSafeError(err)}`,
        },
      })
      return
    }
    throw err // fresh manual job → surface as FAILED via the outer catch
  }
}

/* ── Dispatch ────────────────────────────────────────────────────────────────── */

async function handleClipJob(job: Job): Promise<void> {
  const { clipJobId } = job.data as ClipJobPayload

  const jobRow = await prisma.clipJob.findUnique({ where: { id: clipJobId } })
  if (!jobRow) return

  /* Scratch is keyed by the BullMQ job id (not just clipJobId) so a manual cut
   * appending to a job never shares/deletes another run's in-flight files. */
  const safeJobId = String(job.id ?? clipJobId).replace(/[^\w-]/g, '_')
  const scratchDir = path.join(os.tmpdir(), 'cliptic', clipJobId, safeJobId)
  const clipsDir = path.join(scratchDir, 'clips')
  await mkdir(clipsDir, { recursive: true })

  try {
    const pending = parseManualRanges(jobRow.manualRanges)
    if (pending.length > 0) {
      // A manual cut can target an already-COMPLETED job (appending clips).
      await runManualCut(jobRow, pending, scratchDir, clipsDir)
    } else if (jobRow.status === 'COMPLETED' || jobRow.status === 'CANCELED') {
      return
    } else if (jobRow.mode === 'MANUAL') {
      // Manual jobs carry their range at create time; none here ⇒ nothing to cut.
      await prisma.clipJob.update({
        where: { id: clipJobId },
        data: { status: 'FAILED', currentStage: 'Failed', error: 'No clip range was provided.' },
      })
    } else {
      await runAutoPipeline(jobRow, scratchDir, clipsDir)
    }
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
