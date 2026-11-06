/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipJobListItem, ClipJobDetail, ClipItem,
 *   STAGE_STEPS, STAGE_HINTS, isActiveStatus, statusLabel, statusBadgeVariant
 *
 * WHAT:  Shared client-side types + presentation helpers for the clips UI.
 * WHY:   Types derive from the router output (no hand-rolled DTOs); the label /
 *        badge / stepper helpers live in one place so cards and the detail view
 *        render statuses identically.
 * WHERE: Consumed by the clips dashboard components.
 */

import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/trpc/routers/_app'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type ClipJobListItem = RouterOutputs['clips']['list']['items'][number]
export type ClipJobDetail = RouterOutputs['clips']['get']
export type ClipItem = ClipJobDetail['clips'][number]

/* The ordered pipeline stages shown in the detail stepper. */
export const STAGE_STEPS = [
  { key: 'DOWNLOADING', label: 'Download' },
  { key: 'TRANSCRIBING', label: 'Transcribe' },
  { key: 'ANALYZING', label: 'Analyze' },
  { key: 'CUTTING', label: 'Cut' },
] as const

/* Rotating flavour lines per stage — keeps the panel feeling alive during the
 * stages that don't emit granular server progress. Also voiced by the
 * landing hero film so its progress panel reads like the real one. */
export const STAGE_HINTS: Record<string, readonly string[]> = {
  QUEUED: ['Waiting for a free worker…'],
  DOWNLOADING: ['Fetching just the audio (fast & light)…', 'No full video download needed…'],
  TRANSCRIBING: [
    'Transcribing speech to text…',
    'Aligning every word to a timestamp…',
    'Longer videos take a little longer…',
  ],
  ANALYZING: [
    'Reading the full transcript…',
    'Finding the most viral moments…',
    'Scoring hooks, payoffs & emotion…',
  ],
  CUTTING: ['Rendering clips…', 'Snapping edits to natural pauses…', 'Almost there…'],
}

/* Manual jobs never run the LLM analyze stage: ingest (download + transcribe),
 * then cut the user's exact range. */
const MANUAL_STAGE_STEPS = [
  { key: 'DOWNLOADING', label: 'Download' },
  { key: 'TRANSCRIBING', label: 'Transcribe' },
  { key: 'CUTTING', label: 'Cut' },
] as const

/**
 * SOURCE OF TRUTH KEYWORDS: stepsForMode
 *
 * WHAT:  The stepper stages for a job's mode — AUTO shows Analyze, MANUAL skips it.
 * WHERE: JobDetail's progress stepper.
 */
export function stepsForMode(mode: string): ReadonlyArray<{ key: string; label: string }> {
  return mode === 'MANUAL' ? MANUAL_STAGE_STEPS : STAGE_STEPS
}

const ACTIVE_STATUSES = new Set([
  'QUEUED',
  'DOWNLOADING',
  'TRANSCRIBING',
  'ANALYZING',
  'CUTTING',
])

/** True while a job is still being worked on (drives UI polling). */
export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status)
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'QUEUED':
      return 'Queued'
    case 'DOWNLOADING':
      return 'Downloading'
    case 'TRANSCRIBING':
      return 'Transcribing'
    case 'ANALYZING':
      return 'Analyzing'
    case 'CUTTING':
      return 'Cutting'
    case 'COMPLETED':
      return 'Ready'
    case 'FAILED':
      return 'Failed'
    case 'CANCELED':
      return 'Canceled'
    default:
      return status
  }
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export function statusBadgeVariant(status: string): BadgeVariant {
  if (status === 'COMPLETED') return 'default'
  if (status === 'FAILED') return 'destructive'
  if (status === 'CANCELED') return 'outline'
  return 'secondary'
}
