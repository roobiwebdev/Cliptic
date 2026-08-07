/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: discountCodeSchema, ResolvedDiscount, DiscountSeam,
 *   promoCode, coupon
 *
 * WHAT:  FUTURE SEAM (contract only — the discount feature is NOT built).
 *        Zod schema for a user-entered discount/promo code and the
 *        provider-neutral shape a resolved discount must take.
 * WHY:   Reserving the contract now means checkout, the plan-change dialog,
 *        and the billing router can accept an optional `discountCode` today
 *        and light up later with zero interface rework. `ResolvedDiscount`
 *        hides the payment provider behind `providerDiscountId`, so a Stripe
 *        promotion_code or a Polar discount id plug in identically.
 * WHERE: Consumed by discount.service.resolveDiscount (stub) and the optional
 *        `discountCode` field on createSubscriptionSchema /
 *        upgradeSubscriptionSchema (src/lib/types/billing.ts).
 */

import { z } from 'zod'

export const discountCodeSchema = z
  .string()
  .trim()
  .min(1, 'Enter a discount code.')
  .max(64, 'That code looks too long.')

/**
 * SOURCE OF TRUTH KEYWORDS: ResolvedDiscount
 *
 * WHAT:  A validated discount ready to attach to a subscription.
 * WHERE: Returned by discount.service.resolveDiscount; spread into
 *        stripe.subscriptions.create({ discounts: [{ promotion_code: id }] })
 *        once the feature is built.
 */
export interface ResolvedDiscount {
  provider: 'stripe'
  /** Stripe promotion_code id (promo_...). Provider-specific but opaque to callers. */
  providerDiscountId: string
  /** Human-readable summary for UI confirmation (e.g. "20% off for 3 months"). */
  description: string
}

export type DiscountCodeValue = z.infer<typeof discountCodeSchema>
