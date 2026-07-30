/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: billingIntervalSchema, planKeySchema,
 *   createSubscriptionSchema, upgradeSubscriptionSchema,
 *   paymentMethodIdSchema, CreateSubscriptionValues, UpgradeSubscriptionValues
 *
 * WHAT:  Zod schemas + inferred types for the billing inputs (create / upgrade
 *        subscription, payment-method ops).
 * WHY:   One contract per input surface (CLAUDE.md). planKey/interval validate
 *        against the literal unions from src/lib/config/plans so a bad tier or
 *        interval can't reach Stripe.
 * WHERE: Imported by src/trpc/routers/billing.ts and the billing / onboarding
 *        UI. Re-exported via src/lib/types.
 */

import { z } from 'zod'

const organizationIdSchema = z.string().min(1, 'Organization ID is required.')

export const billingIntervalSchema = z.enum(['monthly', 'yearly'])

/* `free` is excluded — you don't create a Stripe subscription for free. */
export const planKeySchema = z.enum(['starter', 'pro', 'enterprise'])

export const paymentMethodIdSchema = z.string().min(1, 'Payment method is required.')

export const createSubscriptionSchema = z.object({
  organizationId: organizationIdSchema,
  planKey: planKeySchema,
  billingInterval: billingIntervalSchema,
  paymentMethodId: paymentMethodIdSchema,
  /* What the UI promised: true when it showed a free-trial offer. The server
   * uses it to surface a clear TRIAL_ALREADY_USED error (rather than silently
   * charging) when the card/user has already consumed a trial. */
  expectTrial: z.boolean().optional(),
})

export const upgradeSubscriptionSchema = z.object({
  organizationId: organizationIdSchema,
  planKey: planKeySchema,
  billingInterval: billingIntervalSchema,
})

export type CreateSubscriptionValues = z.infer<typeof createSubscriptionSchema>
export type UpgradeSubscriptionValues = z.infer<typeof upgradeSubscriptionSchema>
