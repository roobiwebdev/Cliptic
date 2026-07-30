/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: mapSubscriptionData, upsertSubscription,
 *   deleteSubscriptionByStripeId, subscriptionStripeCustomerId,
 *   subscriptionPriceId
 *
 * WHAT:  Maps a Stripe Subscription onto the local Subscription row and
 *        upserts / deletes it. The webhook is the only writer of these rows.
 * WHY:   getOrganizationTier reads the newest Subscription row to resolve the
 *        plan, so the webhook must keep it faithful: status, plan, period, and
 *        trial windows. In the pinned API version the period fields live on the
 *        subscription ITEM, so they're read from items.data[0].
 * WHERE: Called by /api/stripe/webhook. Pure Prisma + Stripe types; uses the
 *        prisma singleton (runs outside the request lifecycle).
 */

import type Stripe from 'stripe'
import { prisma } from '@/lib/config/prisma'
import type { PlanKey } from '@/lib/config/plans'

/* Stripe ids may arrive expanded (object) or as a bare string. */
export function subscriptionStripeCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id
}

/** The first item's price id — used to map the subscription back to a plan. */
export function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price.id ?? null
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/* Reads a unix-seconds field that may live on the subscription (older API
 * versions) OR on the first subscription item (newer ones). Webhooks arrive in
 * the ACCOUNT's API version — which can differ from the SDK's — so we must
 * check both locations rather than assuming the SDK's shape. */
function readPeriodSeconds(
  subscription: Stripe.Subscription,
  item: Stripe.SubscriptionItem | undefined,
  key: 'current_period_start' | 'current_period_end'
): number | null {
  for (const source of [subscription, item]) {
    if (isRecord(source)) {
      const value = source[key]
      if (typeof value === 'number') return value
    }
  }
  return null
}

interface MappedSubscription {
  plan: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  status: string
  periodStart: Date | null
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
  trialStart: Date | null
  trialEnd: Date | null
}

/**
 * SOURCE OF TRUTH KEYWORDS: mapSubscriptionData
 *
 * WHAT:  Projects a Stripe Subscription into the local row's writable fields.
 * WHY:   Period start/end come from items.data[0].current_period_* (the
 *        subscription-level fields were removed in the pinned API version).
 * WHERE: Used by upsertSubscription.
 */
export function mapSubscriptionData(
  subscription: Stripe.Subscription,
  planKey: PlanKey
): MappedSubscription {
  const item = subscription.items.data[0]
  return {
    plan: planKey,
    stripeCustomerId: subscriptionStripeCustomerId(subscription),
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    periodStart: toDate(readPeriodSeconds(subscription, item, 'current_period_start')),
    periodEnd: toDate(readPeriodSeconds(subscription, item, 'current_period_end')),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialStart: toDate(subscription.trial_start),
    trialEnd: toDate(subscription.trial_end),
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: upsertSubscription
 *
 * WHAT:  Updates the existing row for this Stripe subscription id, or creates
 *        one bound to the organization.
 * WHERE: Called by the customer.subscription.created/updated webhook handlers.
 */
export async function upsertSubscription(
  subscription: Stripe.Subscription,
  organizationId: string,
  planKey: PlanKey
): Promise<void> {
  const data = mapSubscriptionData(subscription, planKey)
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  })

  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data })
    return
  }

  await prisma.subscription.create({
    data: {
      id: crypto.randomUUID(),
      referenceId: organizationId,
      ...data,
    },
  })

  /* Keep the org's durable customer handle in sync for payment-method ops. */
  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: data.stripeCustomerId },
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: deleteSubscriptionByStripeId
 *
 * WHAT:  Removes the local row for a deleted Stripe subscription so the org
 *        falls back to the free tier (getOrganizationTier returns free when no
 *        row exists).
 * WHERE: Called by the customer.subscription.deleted webhook handler.
 */
export async function deleteSubscriptionByStripeId(stripeSubscriptionId: string): Promise<void> {
  await prisma.subscription.deleteMany({ where: { stripeSubscriptionId } })
}
