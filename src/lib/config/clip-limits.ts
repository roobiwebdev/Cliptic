/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: CLIP_PLAN_LIMITS, ClipPlanLimits, getClipPlanLimits,
 *   maxVideoMinutes, maxConcurrentJobs
 *
 * WHAT:  Per-plan Cliptic caps that AREN'T monthly counters — max source-video
 *        length and max concurrent jobs. Keyed by PlanKey.
 * WHY:   The registry (src/lib/resources.ts `clips.limit`) already owns the
 *        MONTHLY quota (videos processed per month) because that's a cumulative
 *        counter the protected procedure auto-gates on `clips.create`. These two
 *        caps are per-request/point-in-time, not cumulative, so they live here —
 *        the same split plans.ts uses for non-registry per-plan values. Keeping
 *        BOTH numbers editable in ONE obvious, commented place means quotas and
 *        limits can be retuned without hunting through routers.
 * WHERE: Read by the clips router (src/trpc/routers/clips.ts) via the org's
 *        resolved plan tier (getOrganizationTier); the monthly quota is enforced
 *        automatically by protectedProcedure off the registry.
 *
 * ⭐ EDIT HERE to change length / concurrency caps per plan. Monthly video quota
 *    lives in RESOURCES.clips.limit.perPlan (src/lib/resources.ts).
 */

import type { PlanKey } from './plans'

export interface ClipPlanLimits {
  /** Longest source video (minutes) this plan may process. Infinity = no cap. */
  maxVideoMinutes: number
  /** How many clip jobs this plan may run at once (queued + processing). */
  maxConcurrentJobs: number
}

/* Starter defaults — tune freely. `enterprise`/`portal` are effectively
 * uncapped on length. Monthly video quota (not here): free 3 / starter 30 /
 * pro 150 / enterprise ∞ — see RESOURCES.clips in src/lib/resources.ts. */
export const CLIP_PLAN_LIMITS: Record<PlanKey, ClipPlanLimits> = {
  free: { maxVideoMinutes: 30, maxConcurrentJobs: 1 },
  starter: { maxVideoMinutes: 90, maxConcurrentJobs: 2 },
  pro: { maxVideoMinutes: 180, maxConcurrentJobs: 3 },
  enterprise: { maxVideoMinutes: Number.POSITIVE_INFINITY, maxConcurrentJobs: 5 },
  portal: { maxVideoMinutes: Number.POSITIVE_INFINITY, maxConcurrentJobs: 10 },
}

/**
 * SOURCE OF TRUTH KEYWORDS: getClipPlanLimits
 *
 * WHAT:  Resolves the length/concurrency caps for a plan.
 * WHERE: Called by the clips router before enqueuing a job.
 */
export function getClipPlanLimits(plan: PlanKey): ClipPlanLimits {
  return CLIP_PLAN_LIMITS[plan]
}
