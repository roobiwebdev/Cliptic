/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: POST, stripeWebhook
 *
 * WHAT:  Stripe webhook endpoint — verifies the signature, then syncs the local
 *        Subscription row for subscription created/updated/deleted events.
 * WHY:   The webhook is the SINGLE writer of Subscription rows: the billing
 *        router only talks to Stripe, so the org's tier only changes once
 *        Stripe confirms via webhook. The plan key is resolved from the price
 *        id (authoritative), falling back to subscription metadata.
 * WHERE: Configure in the Stripe dashboard / `stripe listen --forward-to
 *        localhost:3000/api/stripe/webhook`. Uses config/stripe + stripe.service.
 */

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import {
  getStripeClient,
  getStripeWebhookSecret,
  isStripeConfigured,
  getPlanByPriceId,
  PLAN_ORDER,
} from '@/lib/config'
import type { PlanKey } from '@/lib/config/plans'
import {
  upsertSubscription,
  deleteSubscriptionByStripeId,
  subscriptionPriceId,
} from '@/services/stripe.service'
import { markUserFingerprintsAsTrialUsed } from '@/services/card-fingerprint.service'

/* Stripe signature verification needs the Node crypto runtime + raw body. */
export const runtime = 'nodejs'

function isPlanKey(value: string | undefined): value is PlanKey {
  return value !== undefined && (PLAN_ORDER as readonly string[]).includes(value)
}

/* Price id is authoritative for the plan; metadata.planKey is the fallback. */
function resolvePlanKey(subscription: Stripe.Subscription): PlanKey | null {
  const priceId = subscriptionPriceId(subscription)
  const fromPrice = priceId ? getPlanByPriceId(priceId) : null
  if (fromPrice) return fromPrice
  const fromMeta = subscription.metadata['planKey']
  return isPlanKey(fromMeta) ? fromMeta : null
}

async function resolveOrganizationId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMeta = subscription.metadata['organizationId']
  if (fromMeta) return fromMeta
  /* Fallback: an existing row already binds this subscription to an org. */
  const { prisma } = await import('@/lib/config/prisma')
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { referenceId: true },
  })
  return existing?.referenceId ?? null
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = await resolveOrganizationId(subscription)
  const planKey = resolvePlanKey(subscription)
  if (!organizationId || !planKey) {
    console.warn(
      `[stripe-webhook] could not resolve org/plan for subscription ${subscription.id} ` +
        `(org=${organizationId}, plan=${planKey}) — skipping`
    )
    return
  }
  await upsertSubscription(subscription, organizationId, planKey)

  /* Trial confirmed by Stripe — burn the user's trial eligibility now (not at
   * create time, so a failed/incomplete subscription doesn't consume it). */
  if (subscription.status === 'trialing') {
    const userId = subscription.metadata['userId']
    if (userId) await markUserFingerprintsAsTrialUsed(userId)
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const body = await request.text()
  const stripe = getStripeClient()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret())
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object)
        break
      case 'customer.subscription.deleted':
        await deleteSubscriptionByStripeId(event.data.object.id)
        break
      case 'invoice.payment_failed':
        /* Stripe Smart Retries + the `past_due` status drive dunning; surface
         * it in logs. Hook a notification email here if desired. */
        console.warn(`[stripe-webhook] invoice.payment_failed: ${event.data.object.id}`)
        break
      case 'customer.subscription.trial_will_end':
        console.info(`[stripe-webhook] trial_will_end: ${event.data.object.id}`)
        break
      default:
        /* Unhandled event types are acknowledged so Stripe stops retrying. */
        break
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
