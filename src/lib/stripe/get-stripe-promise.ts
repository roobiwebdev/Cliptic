/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: getStripePromise, STRIPE_PUBLISHABLE_KEY,
 *   isStripePublishableConfigured
 *
 * WHAT:  Client-side Stripe.js loader — a cached loadStripe() promise built
 *        from the publishable key.
 * WHY:   loadStripe must run once per page; caching the promise avoids
 *        re-injecting the Stripe script. Returns null when the publishable key
 *        is absent so the UI can render a "billing not configured" state.
 * WHERE: Consumed by the Stripe Elements provider in the billing UI.
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js'

const STRIPE_PUBLISHABLE_KEY = process.env['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY']

export function isStripePublishableConfigured(): boolean {
  return Boolean(STRIPE_PUBLISHABLE_KEY)
}

let stripePromise: Promise<Stripe | null> | null = null

export function getStripePromise(): Promise<Stripe | null> | null {
  if (!STRIPE_PUBLISHABLE_KEY) return null
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY)
  return stripePromise
}
