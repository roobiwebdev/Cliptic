/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: resolveDiscount, DiscountSeam, promoCode, coupon
 *
 * WHAT:  FUTURE SEAM (stub — the discount feature is NOT built). The single
 *        entry point for turning a user-entered code into a ResolvedDiscount.
 *        Always returns null today, so every caller behaves exactly as if no
 *        code was entered.
 * WHY:   Discounts touch three surfaces (checkout UI, subscription create /
 *        upgrade, webhook metadata). Owning resolution HERE means building the
 *        feature later is: (1) implement this function against Stripe
 *        promotion codes (stripe.promotionCodes.list({ code, active: true })),
 *        (2) un-comment the UI slot in change-plan-dialog / onboarding,
 *        (3) spread `discounts: [{ promotion_code: resolved.providerDiscountId }]`
 *        and `metadata.discountCode` at the two subscriptions.create call
 *        sites in src/trpc/routers/billing.ts. Nothing else changes.
 *        Provider-neutral by construction: callers only ever see
 *        ResolvedDiscount, never a Stripe object.
 * WHERE: To be called by billing.createSubscription / billing.upgradeOrganization
 *        when input.discountCode is present. UI slots are marked with
 *        "DISCOUNT SEAM" comments in change-plan-dialog.tsx and
 *        onboarding-flow.tsx.
 */

import type { ResolvedDiscount } from '@/lib/types'

/**
 * SOURCE OF TRUTH KEYWORDS: resolveDiscount
 *
 * WHAT:  Validates a discount code with the payment provider and returns the
 *        attachable discount, or null when the code is unknown/inactive.
 * WHERE: billing router (createSubscription / upgradeOrganization), once built.
 */
export async function resolveDiscount(code: string): Promise<ResolvedDiscount | null> {
  /* Stub: discounts are not launched. Accepting-and-ignoring keeps the
   * checkout contract stable so the UI/router don't special-case the phase. */
  void code
  return null
}
