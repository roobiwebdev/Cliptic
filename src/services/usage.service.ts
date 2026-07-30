/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: incrementUsage, decrementUsage, getUsageMetrics
 *
 * WHAT:  Pure Prisma wrappers on the UsageMetrics table.
 * WHY:   Services contain only DB access. Business logic that uses these
 *        primitives lives in routers (application layer) or
 *        src/lib/feature-gate.ts (infrastructure).
 * WHERE: Called by src/trpc/procedures/protected.ts on conventional
 *        <resource>.create / <resource>.delete paths, and by routers that
 *        explicitly want to bump a counter.
 */

import { cache } from 'react'
import { prisma, type DbClient } from '@/lib/config/prisma'
import type { LimitResourceKey } from '@/lib/resources'

/**
 * SOURCE OF TRUTH KEYWORDS: getUsageMetrics
 *
 * WHAT:  Reads the UsageMetrics row for one (organization, resource) pair.
 * WHY:   Single-row DB accessor; cached per-request so repeated reads within
 *        the same request collapse to one query.
 * WHERE: Consumed by checkFeatureGate in src/lib/feature-gate.ts and any
 *        caller that wants the raw row.
 */
export const getUsageMetrics = cache(
  async (organizationId: string, resourceKey: LimitResourceKey) => {
    return prisma.usageMetrics.findUnique({
      where: {
        organizationId_featureKey: { organizationId, featureKey: resourceKey },
      },
    })
  }
)

/**
 * SOURCE OF TRUTH KEYWORDS: incrementUsage
 *
 * WHAT:  Upserts a usage row, bumping currentUsage by `incrementBy`.
 * WHY:   Accepts a tx client so the counter commits atomically with the
 *        underlying `<resource>.create` write.
 * WHERE: Called by the protected procedure auto-bump on `<resource>.create`;
 *        pair with decrementUsage on `<resource>.delete`.
 */
export async function incrementUsage(
  organizationId: string,
  resourceKey: LimitResourceKey,
  incrementBy: number = 1,
  db: DbClient = prisma
): Promise<void> {
  await db.usageMetrics.upsert({
    where: {
      organizationId_featureKey: { organizationId, featureKey: resourceKey },
    },
    update: { currentUsage: { increment: incrementBy }, updatedAt: new Date() },
    create: { organizationId, featureKey: resourceKey, currentUsage: incrementBy },
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: decrementUsage
 *
 * WHAT:  Decrements an existing usage row, clamped at zero.
 * WHY:   Reads through the same `db` client it writes to so the read sees the
 *        in-flight tx and the decrement stays atomic with the delete.
 * WHERE: Called by the protected procedure auto-bump on `<resource>.delete`.
 */
export async function decrementUsage(
  organizationId: string,
  resourceKey: LimitResourceKey,
  decrementBy: number = 1,
  db: DbClient = prisma
): Promise<void> {
  // Read via the same client we'll write to — cached getUsageMetrics would
  // bypass the active tx and break atomicity.
  const metrics = await db.usageMetrics.findUnique({
    where: {
      organizationId_featureKey: { organizationId, featureKey: resourceKey },
    },
  })
  if (!metrics) return

  await db.usageMetrics.update({
    where: {
      organizationId_featureKey: { organizationId, featureKey: resourceKey },
    },
    data: {
      // Write-safety floor — keeps the counter column non-negative regardless
      // of caller bugs. Not business logic; it's a guard at the DB boundary.
      currentUsage: Math.max(0, metrics.currentUsage - decrementBy),
      updatedAt: new Date(),
    },
  })
}
