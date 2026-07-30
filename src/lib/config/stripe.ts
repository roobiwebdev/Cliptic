/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getStripeClient, isStripeConfigured,
 *   STRIPE_API_VERSION, getStripeWebhookSecret
 *
 * WHAT:  Lazy server-side Stripe client + config guards. Constructs the SDK on
 *        first use so a missing STRIPE_SECRET_KEY doesn't crash import/build.
 * WHY:   Billing fails soft when unconfigured (callers check isStripeConfigured
 *        and surface a clean error) so the rest of the app runs locally without
 *        Stripe — mirrors the rate-limit / email fail-open posture.
 * WHERE: Consumed by src/services/stripe.service.ts,
 *        src/services/payment.service.ts, the billing router, and the webhook
 *        route. Client-side keys live in src/lib/stripe/*.
 */

import Stripe from 'stripe'

/* Pinned to the installed SDK's latest API version. In this version the
 * subscription period fields live on the subscription ITEMS
 * (items.data[0].current_period_*), not on the subscription itself. */
export const STRIPE_API_VERSION = '2026-06-24.dahlia' as const

let client: Stripe | null = null

/**
 * SOURCE OF TRUTH KEYWORDS: isStripeConfigured
 *
 * WHAT:  True when STRIPE_SECRET_KEY is set.
 * WHERE: Guard in the billing router / webhook before touching Stripe.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env['STRIPE_SECRET_KEY'])
}

/**
 * SOURCE OF TRUTH KEYWORDS: getStripeClient
 *
 * WHAT:  Returns the cached Stripe client, constructing it on first call.
 * WHY:   Throws a clear error (rather than at import) when the secret is
 *        missing, so unconfigured billing produces an actionable message at the
 *        callsite instead of a boot crash.
 * WHERE: Called by billing services / router / webhook.
 */
export function getStripeClient(): Stripe {
  const secret = process.env['STRIPE_SECRET_KEY']
  if (!secret) {
    throw new Error(
      '[stripe] STRIPE_SECRET_KEY is not set. Billing is unavailable until it is configured.'
    )
  }
  if (!client) {
    client = new Stripe(secret, { apiVersion: STRIPE_API_VERSION })
  }
  return client
}

/**
 * SOURCE OF TRUTH KEYWORDS: getStripeWebhookSecret
 *
 * WHAT:  Returns the webhook signing secret or throws if unset.
 * WHERE: Used by the /api/stripe/webhook route to verify signatures.
 */
export function getStripeWebhookSecret(): string {
  const secret = process.env['STRIPE_WEBHOOK_SECRET']
  if (!secret) {
    throw new Error('[stripe] STRIPE_WEBHOOK_SECRET is not set.')
  }
  return secret
}
