/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getFeatureGates, checkFeatureGate,
 *   checkBooleanFeature, FeatureGateData, AUTO_DERIVED_FROM_RESOURCES
 *
 * WHAT:  Plan-tier resolution and feature-gate computation.
 * WHY:   Gate ENFORCEMENT belongs to the procedure builder — callers never
 *        invoke checkFeatureGate/checkBooleanFeature directly. They're
 *        exported only so protectedProcedure can call them from its
 *        AUTO_DERIVED_FROM_RESOURCES step (no `requireLimit` /
 *        `requireFlag` opt-in; the path + RESOURCES decides).
 *        getFeatureGates exists for the UI to render at-limit affordances.
 * WHERE: protectedProcedure (src/trpc/procedures/protected.ts) calls
 *        checkFeatureGate/checkBooleanFeature; usage router exposes
 *        getFeatureGates; FeatureGate component consumes the result.
 */

import { cache } from 'react'
import { prisma } from '@/lib/config/prisma'
import { PLANS, type PlanKey } from '@/lib/config/plans'
import {
  RESOURCES,
  getResourceLimitForPlan,
  getResourceFlagForPlan,
  LIMIT_RESOURCE_KEYS,
  FLAG_RESOURCE_KEYS,
  PLAN_KEYS,
  type LimitResourceKey,
  type FlagResourceKey,
  type ResourceKey,
} from '@/lib/resources'
import { getUsageMetrics } from '@/services/usage.service'

type FeatureGateCheckResult = {
  allowed: boolean
  reason?: string
  currentUsage?: number
  limit?: number
}

type UsageMetricsData = {
  resourceKey: LimitResourceKey
  currentUsage: number
  limit: number | null
  available: number | null
  percentage: number | null
}

export type FeatureGateData = {
  usage: number
  limit: number | null
  atLimit: boolean
  isUnlimited: boolean
  featureName: string
}

export type OrganizationTier =
  | {
      /* `free` (no/lapsed subscription) and `portal` (platform-admin org) both
       * have no billing subscription attached. */
      tier: 'free' | 'portal'
      planName: string
      isOnTrial: boolean
      subscription: null
    }
  | {
      tier: Exclude<PlanKey, 'free' | 'portal'>
      planName: string
      isOnTrial: boolean
      subscription: {
        id: string
        status: string
        periodEnd: Date | null
        cancelAtPeriodEnd: boolean | null
        stripeSubscriptionId: string | null
      }
    }

const isPlanKey = (value: string): value is PlanKey =>
  (PLAN_KEYS as readonly string[]).includes(value)

/**
 * SOURCE OF TRUTH KEYWORDS: getOrganizationTier, OrganizationTier
 *
 * WHAT:  Resolves an org's effective plan tier + active subscription summary
 *        from the newest Subscription row (with expiry/trial guards).
 * WHY:   The single read-point for "what plan is this org on right now",
 *        exported so the billing router/UI can display the current plan and
 *        period without re-deriving the lapse rules.
 * WHERE: Used internally by the gate computations and by the billing router
 *        (src/trpc/routers/billing.ts).
 */
export const getOrganizationTier = cache(
  async (organizationId: string): Promise<OrganizationTier> => {
    const freeTier: OrganizationTier = {
      tier: 'free',
      planName: PLANS.free.name,
      isOnTrial: false,
      subscription: null,
    }

    /* Platform-admin bypass FIRST: a portal org gets the hidden unlimited
     * `portal` tier regardless of any subscription row. */
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { isPortalOrganization: true },
    })
    if (organization?.isPortalOrganization) {
      return {
        tier: 'portal',
        planName: PLANS.portal.name,
        isOnTrial: false,
        subscription: null,
      }
    }

    const subscription = await prisma.subscription.findFirst({
      where: { referenceId: organizationId },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) return freeTier

    const rawPlan = subscription.plan.toLowerCase()
    if (!isPlanKey(rawPlan)) {
      console.warn(
        `[feature-gate] subscription ${subscription.id} references unknown plan "${subscription.plan}" — defaulting to 'free'`
      )
      return freeTier
    }

    if (rawPlan === 'free') return freeTier
    /* `portal` is granted via the isPortalOrganization bypass above, never via a
     * subscription row — a subscription claiming it is treated as free. */
    if (rawPlan === 'portal') return freeTier

    const now = new Date()
    if (subscription.periodEnd && subscription.periodEnd < now) return freeTier

    const isOnTrial: boolean =
      subscription.status === 'trialing' &&
      subscription.trialEnd !== null &&
      subscription.trialEnd > now

    if (subscription.status === 'trialing' && !isOnTrial) return freeTier

    return {
      tier: rawPlan,
      planName: PLANS[rawPlan].name,
      isOnTrial,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        periodEnd: subscription.periodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      },
    }
  }
)

const getAllUsageMetrics = cache(async (organizationId: string) => {
  const tier = await getOrganizationTier(organizationId)
  const metrics = await prisma.usageMetrics.findMany({
    where: { organizationId },
  })

  const entries = LIMIT_RESOURCE_KEYS.map((resourceKey): [LimitResourceKey, UsageMetricsData] => {
    const metric = metrics.find((m) => m.featureKey === resourceKey)
    const currentUsage = metric?.currentUsage ?? 0
    const limit = getResourceLimitForPlan(resourceKey, tier.tier)
    const isUnlimited = !Number.isFinite(limit)

    return [
      resourceKey,
      {
        resourceKey,
        currentUsage,
        limit: isUnlimited ? null : limit,
        available: isUnlimited ? null : Math.max(0, limit - currentUsage),
        percentage: isUnlimited || limit === 0 ? null : (currentUsage / limit) * 100,
      },
    ]
  })
  /* `Object.fromEntries` returns `Record<string, UsageMetricsData>` — TS can't
   * narrow the key union from the input tuple type. The cast forges the key
   * back to LimitResourceKey, which is sound here because `entries` is built
   * from LIMIT_RESOURCE_KEYS (every key in the union, no extras). */
  return Object.fromEntries(entries) as Record<LimitResourceKey, UsageMetricsData>
})

/**
 * SOURCE OF TRUTH KEYWORDS: getFeatureGates, FeatureGateData
 *
 * WHAT:  Per-resource gate map (atLimit / isUnlimited / usage) for the UI.
 * WHY:   The UI needs a single boolean per resource to render disabled-state
 *        affordances; the server re-checks every mutation, so this is UX only.
 * WHERE: Exposed via usage.getFeatureGates; consumed by <FeatureGate>.
 */
export const getFeatureGates = cache(async (organizationId: string) => {
  const [tierData, usageMetrics] = await Promise.all([
    getOrganizationTier(organizationId),
    getAllUsageMetrics(organizationId),
  ])

  const gates: Partial<Record<ResourceKey, FeatureGateData>> = {}

  for (const resourceKey of LIMIT_RESOURCE_KEYS) {
    const def = RESOURCES[resourceKey]
    const metrics = usageMetrics[resourceKey]
    const limit = getResourceLimitForPlan(resourceKey, tierData.tier)
    const isUnlimited = !Number.isFinite(limit)
    const usage = metrics?.currentUsage ?? 0
    const blockedByTrial = tierData.isOnTrial && !def.limit.availableOnFreeTrial
    const atLimit = blockedByTrial || (!isUnlimited && usage >= limit)

    gates[resourceKey] = {
      usage,
      limit: isUnlimited ? null : limit,
      atLimit,
      isUnlimited,
      featureName: def.name,
    }
  }

  for (const resourceKey of FLAG_RESOURCE_KEYS) {
    const def = RESOURCES[resourceKey]
    const enabled = getResourceFlagForPlan(resourceKey, tierData.tier)
    const blockedByTrial = tierData.isOnTrial && !def.flag.availableOnFreeTrial

    gates[resourceKey] = {
      usage: 0,
      limit: null,
      atLimit: blockedByTrial || !enabled,
      isUnlimited: false,
      featureName: def.name,
    }
  }

  return {
    tier: tierData.tier,
    planName: tierData.planName,
    isOnTrial: tierData.isOnTrial,
    gates,
  }
})

/**
 * SOURCE OF TRUTH KEYWORDS: checkFeatureGate
 *
 * WHAT:  Can this organization consume `incrementBy` more of a limit resource?
 * WHY:   Used ONLY by the procedure builder's AUTO_DERIVED_FROM_RESOURCES
 *        gating on `<resource>.create`. Routers never call this directly and
 *        never opt in — the registry entry's `limit` IS the contract.
 *        Returns `allowed: true` immediately for unlimited tiers, so there is
 *        no need (or option) to "skip" the check.
 * WHERE: Called from src/trpc/procedures/protected.ts during the auth →
 *        permission → limit chain.
 */
export async function checkFeatureGate(
  organizationId: string,
  resourceKey: LimitResourceKey,
  incrementBy: number = 1
): Promise<FeatureGateCheckResult> {
  const def = RESOURCES[resourceKey]
  const tier = await getOrganizationTier(organizationId)

  if (tier.isOnTrial && !def.limit.availableOnFreeTrial) {
    return {
      allowed: false,
      reason: `${def.name} is not available during your free trial. Upgrade to a paid plan to access it.`,
    }
  }

  const limit = getResourceLimitForPlan(resourceKey, tier.tier)
  if (!Number.isFinite(limit)) return { allowed: true }

  const metrics = await getUsageMetrics(organizationId, resourceKey)
  const currentUsage = metrics?.currentUsage ?? 0

  if (currentUsage + incrementBy > limit) {
    return {
      allowed: false,
      reason: `You have reached your plan limit for ${def.name}. Current usage: ${currentUsage}/${limit}. Upgrade your plan to continue.`,
      currentUsage,
      limit,
    }
  }

  return { allowed: true, currentUsage, limit }
}

/**
 * SOURCE OF TRUTH KEYWORDS: checkBooleanFeature
 *
 * WHAT:  Is this flag-resource available for this organization right now?
 * WHY:   Used ONLY by the procedure builder's AUTO_DERIVED_FROM_RESOURCES
 *        flag gating — runs automatically for every verb on a resource whose
 *        RESOURCES entry declares a `flag`. Routers never call this directly
 *        and never declare `requireFlag` — declaring the `flag` on the
 *        registry entry is the only way to wire it.
 * WHERE: Called from src/trpc/procedures/protected.ts.
 */
export async function checkBooleanFeature(
  organizationId: string,
  resourceKey: FlagResourceKey
): Promise<boolean> {
  const def = RESOURCES[resourceKey]
  const tier = await getOrganizationTier(organizationId)
  if (tier.isOnTrial && !def.flag.availableOnFreeTrial) return false
  return getResourceFlagForPlan(resourceKey, tier.tier)
}
