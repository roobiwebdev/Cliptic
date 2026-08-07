/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: POST, stripeWebhook, ClipticIsolation, dunning
 *
 * WHAT:  Stripe webhook endpoint — verifies the signature, FILTERS to
 *        Cliptic-owned events (the Stripe account is SHARED across platforms),
 *        then syncs the local Subscription row for subscription
 *        created/updated/deleted and sends dunning / trial-ending emails.
 * WHY:   The webhook is the SINGLE writer of Subscription rows: the billing
 *        router only talks to Stripe, so the org's tier only changes once
 *        Stripe confirms via webhook. The plan key is resolved from the price
 *        id (authoritative), falling back to subscription metadata.
 *        ISOLATION IS A HARD REQUIREMENT: events for other platforms in the
 *        shared account must be acknowledged and IGNORED — never read or
 *        write another platform's payment data. An event is Cliptic's iff its
 *        subscription carries metadata.platform === STRIPE_PLATFORM, or its
 *        price id maps to a Cliptic plan, or a local Subscription row already
 *        binds its subscription id.
 *        FUTURE SEAM: invoice.payment_succeeded is intentionally unhandled —
 *        it is the designated hook for crediting referral earnings
 *        (ReferralEarning, see referral.service.ts payout seam) once affiliate
 *        payouts are built.
 * WHERE: Configure in the Stripe dashboard / `stripe listen --forward-to
 *        localhost:3000/api/stripe/webhook`. Uses config/stripe +
 *        stripe.service + payment.service (recipient) + email.service.
 */

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import {
  getStripeClient,
  getStripeWebhookSecret,
  isStripeConfigured,
  getPlanByPriceId,
  PLAN_ORDER,
  STRIPE_PLATFORM,
  APP_URL,
} from '@/lib/config'
import type { PlanKey } from '@/lib/config/plans'
import {
  upsertSubscription,
  deleteSubscriptionByStripeId,
  subscriptionPriceId,
} from '@/services/stripe.service'
import { markUserFingerprintsAsTrialUsed } from '@/services/card-fingerprint.service'
import { resolveBillingRecipient } from '@/services/payment.service'
import { sendPaymentFailedEmail, sendTrialEndingEmail } from '@/services/email.service'

/* Stripe signature verification needs the Node crypto runtime + raw body. */
export const runtime = 'nodejs'

const BILLING_LINK = `${APP_URL}/dashboard/settings/billing`

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

async function findLocalSubscription(
  stripeSubscriptionId: string
): Promise<{ referenceId: string } | null> {
  const { prisma } = await import('@/lib/config/prisma')
  return prisma.subscription.findFirst({
    where: { stripeSubscriptionId },
    select: { referenceId: true },
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: isClipticSubscription, ClipticIsolation
 *
 * WHAT:  Decides whether a subscription in the SHARED Stripe account belongs
 *        to Cliptic: platform metadata tag → Cliptic price id → existing local
 *        row (covers objects created before tagging shipped).
 * WHY:   Hard isolation requirement — the webhook must never touch another
 *        platform's payment data. Foreign events are acknowledged silently so
 *        Stripe stops retrying AND our logs aren't flooded by other
 *        platforms' traffic.
 * WHERE: Guard for every subscription event below; invoice events use the
 *        metadata snapshot + local-row check in resolveClipticInvoiceOrg.
 */
async function isClipticSubscription(subscription: Stripe.Subscription): Promise<boolean> {
  if (subscription.metadata['platform'] === STRIPE_PLATFORM) return true
  const priceId = subscriptionPriceId(subscription)
  if (priceId && getPlanByPriceId(priceId)) return true
  return (await findLocalSubscription(subscription.id)) !== null
}

async function resolveOrganizationId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMeta = subscription.metadata['organizationId']
  if (fromMeta) return fromMeta
  /* Fallback: an existing row already binds this subscription to an org. */
  const existing = await findLocalSubscription(subscription.id)
  return existing?.referenceId ?? null
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = await resolveOrganizationId(subscription)
  const planKey = resolvePlanKey(subscription)
  if (!organizationId || !planKey) {
    console.warn(
      `[stripe-webhook] could not resolve org/plan for Cliptic subscription ${subscription.id} ` +
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

/**
 * SOURCE OF TRUTH KEYWORDS: resolveClipticInvoiceOrg, ClipticIsolation, dunning
 *
 * WHAT:  For an invoice event in the shared account: returns the Cliptic org
 *        id the invoice belongs to, or null when the invoice is another
 *        platform's (or not subscription-backed).
 * WHY:   Invoices carry a metadata SNAPSHOT of their subscription under
 *        parent.subscription_details, so the platform tag check works without
 *        an extra Stripe call; the local-row lookup both covers pre-tag
 *        subscriptions and resolves the org in one step.
 * WHERE: invoice.payment_failed handler below.
 */
async function resolveClipticInvoiceOrg(invoice: Stripe.Invoice): Promise<string | null> {
  const details = invoice.parent?.subscription_details
  if (!details) return null

  const subscriptionId =
    typeof details.subscription === 'string' ? details.subscription : details.subscription.id

  const metadataPlatform = details.metadata?.['platform']
  if (metadataPlatform !== undefined && metadataPlatform !== STRIPE_PLATFORM) return null

  const local = await findLocalSubscription(subscriptionId)
  if (local) return local.referenceId

  /* Tagged as Cliptic but no local row yet (first webhook races the upsert):
   * fall back to the metadata snapshot's organizationId. */
  if (metadataPlatform === STRIPE_PLATFORM) {
    return details.metadata?.['organizationId'] ?? null
  }
  return null
}

/* Dunning: email the org owner on EVERY failed attempt (product decision) —
 * Stripe fires this once per Smart Retry. Fail-soft: email problems must
 * never 500 the webhook (Stripe would retry the whole event). */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const organizationId = await resolveClipticInvoiceOrg(invoice)
  if (!organizationId) return

  const recipient = await resolveBillingRecipient(organizationId)
  if (!recipient) {
    console.warn(`[stripe-webhook] no billing recipient for org ${organizationId}`)
    return
  }
  const result = await sendPaymentFailedEmail({
    to: recipient.email,
    organizationName: recipient.organizationName,
    billingLink: BILLING_LINK,
  })
  if (!result.success && !result.skipped) {
    console.error(`[stripe-webhook] payment-failed email error: ${result.error}`)
  }
}

/* Trial heads-up ~3 days before the first charge. */
async function handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
  const organizationId = await resolveOrganizationId(subscription)
  if (!organizationId) return

  const recipient = await resolveBillingRecipient(organizationId)
  if (!recipient) return

  const trialEnd = subscription.trial_end
  const trialEndDate = trialEnd
    ? new Date(trialEnd * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'soon'

  const result = await sendTrialEndingEmail({
    to: recipient.email,
    organizationName: recipient.organizationName,
    trialEndDate,
    billingLink: BILLING_LINK,
  })
  if (!result.success && !result.skipped) {
    console.error(`[stripe-webhook] trial-ending email error: ${result.error}`)
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
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object
        /* SHARED-ACCOUNT GUARD: silently acknowledge other platforms' events. */
        if (!(await isClipticSubscription(subscription))) break
        if (event.type === 'customer.subscription.trial_will_end') {
          await handleTrialWillEnd(subscription)
        } else {
          await handleSubscriptionUpsert(subscription)
        }
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        if (!(await isClipticSubscription(subscription))) break
        await deleteSubscriptionByStripeId(subscription.id)
        break
      }
      case 'invoice.payment_failed':
        /* resolveClipticInvoiceOrg IS the shared-account guard here. */
        await handleInvoicePaymentFailed(event.data.object)
        break
      default:
        /* Unhandled event types are acknowledged so Stripe stops retrying.
         * invoice.payment_succeeded lands here ON PURPOSE — reserved as the
         * referral-payout credit hook (see header). */
        break
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
