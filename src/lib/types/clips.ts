/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipJobPayload, createClipJobSchema,
 *   CreateClipJobValues, clipSourceTypeSchema, CLIP_STAGE_PROGRESS
 *
 * WHAT:  App-layer contracts for Cliptic — the queue job payload, the
 *        create-job input schema (Zod), and the per-stage progress weights.
 * WHY:   Custom types live under lib/types (CLAUDE.md). Pipeline-internal domain
 *        types (Transcript, Word, ClipRange) instead live co-located in
 *        src/lib/media-pipeline/types.ts as that module's own source of truth.
 * WHERE: Payload → queue/worker; schema → clips router; progress → worker.
 */

import { z } from 'zod'

/**
 * SOURCE OF TRUTH KEYWORDS: ClipJobPayload
 *
 * WHAT:  What we put on the queue — just the ids. The worker loads the full
 *        ClipJob from the DB so it never acts on stale data.
 */
export interface ClipJobPayload {
  clipJobId: string
  organizationId: string
}

/**
 * SOURCE OF TRUTH KEYWORDS: clipSourceTypeSchema
 *
 * WHAT:  Zod enum mirroring the Prisma ClipSourceType.
 */
export const clipSourceTypeSchema = z.enum(['YOUTUBE', 'UPLOAD'])

/**
 * SOURCE OF TRUTH KEYWORDS: createClipJobSchema, CreateClipJobValues
 *
 * WHAT:  Input for clips.create — a YouTube URL OR an already-uploaded R2 key.
 * WHY:   `superRefine` enforces exactly one source is supplied for the chosen
 *        type. (SSRF hardening on the URL is layered in the router in Phase 6.)
 */
export const createClipJobSchema = z
  .object({
    organizationId: z.string().min(1),
    sourceType: clipSourceTypeSchema,
    url: z.string().url().optional(),
    uploadKey: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.sourceType === 'YOUTUBE' && !val.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'A video URL is required.' })
    }
    if (val.sourceType === 'UPLOAD' && !val.uploadKey) {
      ctx.addIssue({ code: 'custom', path: ['uploadKey'], message: 'An uploaded file is required.' })
    }
  })

export type CreateClipJobValues = z.infer<typeof createClipJobSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: CLIP_STAGE_PROGRESS
 *
 * WHAT:  Cumulative progress (%) reached at the END of each pipeline stage.
 * WHY:   One place defines the weighting so the UI bar advances smoothly and
 *        consistently no matter which stage the worker is in.
 */
export const CLIP_STAGE_PROGRESS = {
  QUEUED: 0,
  DOWNLOADING: 15,
  TRANSCRIBING: 60,
  ANALYZING: 70,
  CUTTING: 100,
} as const

/**
 * SOURCE OF TRUTH KEYWORDS: clipJobRefSchema, listClipJobsSchema,
 *   createUploadUrlSchema, ListClipJobsValues, CreateUploadUrlValues
 *
 * WHAT:  Input schemas for the remaining clips router procedures.
 */
export const clipJobRefSchema = z.object({
  organizationId: z.string().min(1),
  id: z.string().min(1),
})

export const listClipJobsSchema = z.object({
  organizationId: z.string().min(1),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
})

export const createUploadUrlSchema = z.object({
  organizationId: z.string().min(1),
  filename: z.string().min(1).max(300),
  /* Only video uploads are accepted. */
  contentType: z
    .string()
    .refine((v) => v.startsWith('video/'), { message: 'Only video files are supported.' }),
})

export type ListClipJobsValues = z.infer<typeof listClipJobsSchema>
export type CreateUploadUrlValues = z.infer<typeof createUploadUrlSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: ClipJobTimings, parseClipJobTimings
 *
 * WHAT:  Per-stage wall-clock (ms) persisted on ClipJob.timings (a Json column)
 *        for performance measurement + a safe parser for the untyped JSON value.
 * WHY:   Prisma types Json as `JsonValue`; this parser narrows it for the UI
 *        without an `any` cast.
 * WHERE: Written by the worker; read by the job-detail UI.
 */
export interface ClipJobTimings {
  downloadMs?: number
  transcribeMs?: number
  analyzeMs?: number
  cutMs?: number
  totalMs?: number
  clips?: number
  durationSec?: number
}

const CLIP_TIMING_KEYS = [
  'downloadMs',
  'transcribeMs',
  'analyzeMs',
  'cutMs',
  'totalMs',
  'clips',
  'durationSec',
] as const

export function parseClipJobTimings(value: unknown): ClipJobTimings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const timings: ClipJobTimings = {}
  for (const key of CLIP_TIMING_KEYS) {
    const raw = record[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) timings[key] = raw
  }
  return Object.keys(timings).length > 0 ? timings : null
}
