/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: billingRouter
 *
 * WHAT:  Stripe billing — read current plan + payment methods, create a
 *        subscription (custom Elements flow), manage payment methods, and
 *        cancel / reactivate / upgrade.
 * WHY:   Built on protectedProcedure so auth + billing:* permission gates +
 *        audit are automatic. The DB Subscription row is written by the webhook
 *        (the single writer), not these handlers — mutations here only talk to
 *        Stripe. txTimeout is raised on createSubscription because the handler
 *        makes several sequential Stripe calls inside the factory's tx.
 * WHERE: Mounted as `billing` in src/trpc/routers/_app. Services:
 *        payment.service (customer/cards), config/stripe (client), plans
 *        (price ids), feature-gate (current tier).
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import {
  createSubscriptionSchema,
  upgradeSubscriptionSchema,
  paymentMethodIdSchema,
} from '@/lib/types'
import {
  getStripeClient,
  isStripeConfigured,
  getPlanPriceId,
  PLANS,
} from '@/lib/config'
import { getOrganizationTier } from '@/lib/feature-gate'
import {
  ensureStripeCustomer,
  resolveExistingStripeCustomerId,
  listPaymentMethods,
  attachPaymentMethod,
  setDefaultPaymentMethod,
  detachPaymentMethod,
  getOrganizationSubscription,
} from '@/services/payment.service'
import {
  hasUserAnyTrialUsedFingerprint,
  hasUserUsedFreeTrial,
  storeCardFingerprint,
} from '@/services/card-fingerprint.service'

const orgInput = z.object({ organizationId: z.string().min(1) })

function ensureConfigured(): void {
  if (!isStripeConfigured()) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Billing is not configured. Set STRIPE_SECRET_KEY to enable it.',
    })
  }
}

async function requireCustomerId(organizationId: string): Promise<string> {
  const customerId = await resolveExistingStripeCustomerId(organizationId)
  if (!customerId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'No billing customer for this organization' })
  }
  return customerId
}

export const billingRouter = createTRPCRouter({
  getSubscription: protectedProcedure({ requirePermission: permissions.BILLING_READ })
    .input(orgInput)
    .query(async ({ input }) => {
      const [tier, subscription] = await Promise.all([
        getOrganizationTier(input.organizationId),
        getOrganizationSubscription(input.organizationId),
      ])
      /* Interval is inferred from the period length (a yearly period spans
       * well over 60 days), matching how the tier resolver reasons about it. */
      let billingInterval: 'monthly' | 'yearly' | null = null
      if (subscription?.periodStart && subscription.periodEnd) {
        const days =
          (subscription.periodEnd.getTime() - subscription.periodStart.getTime()) /
          (1000 * 60 * 60 * 24)
        billingInterval = days > 60 ? 'yearly' : 'monthly'
      }

      return {
        tier: tier.tier,
        planName: tier.planName,
        isOnTrial: tier.isOnTrial,
        billingInterval,
        subscription: subscription
          ? {
              plan: subscription.plan,
              status: subscription.status,
              periodEnd: subscription.periodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              trialEnd: subscription.trialEnd,
            }
          : null,
      }
    }),

  getPaymentMethods: protectedProcedure({ requirePermission: permissions.BILLING_READ })
    .input(orgInput)
    .query(async ({ input }) => listPaymentMethods(input.organizationId)),

  /* Custom Elements flow: client collects the card → paymentMethodId → here we
   * create the customer, attach the card as default, and create the
   * subscription. The webhook writes the DB Subscription row. */
  createSubscription: protectedProcedure({
    requirePermission: permissions.BILLING_CREATE,
    txTimeout: 20_000,
    audit: { entity: 'subscription', action: 'create' },
  })
    .input(createSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      ensureConfigured()
      const priceId = getPlanPriceId(input.planKey, input.billingInterval)
      if (!priceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No Stripe price configured for ${input.planKey} (${input.billingInterval})`,
        })
      }

      const stripe = getStripeClient()
      const userId = ctx.user.id
      const customerId = await ensureStripeCustomer(input.organizationId, {
        email: ctx.user.email,
        name: ctx.user.name,
      })

      await attachPaymentMethod(customerId, input.paymentMethodId, true)

      const trialDays = PLANS[input.planKey].trialDays

      /* Trial-abuse prevention: a trial is granted only if the plan offers one
       * AND neither this user nor this physical card (Stripe fingerprint) has
       * used a trial before. */
      const [userHasUsedTrial, cardHasUsedTrial] = await Promise.all([
        hasUserAnyTrialUsedFingerprint(userId),
        hasUserUsedFreeTrial(userId, input.paymentMethodId),
      ])
      const shouldApplyTrial = trialDays > 0 && !userHasUsedTrial && !cardHasUsedTrial

      /* The UI promised a trial but the card/user already used one — record the
       * card as used and refuse, so we never silently charge instead. */
      if (input.expectTrial && (userHasUsedTrial || cardHasUsedTrial)) {
        await storeCardFingerprint(userId, input.paymentMethodId, true)
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'A free trial has already been used with this card.',
        })
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: input.paymentMethodId,
        /* Persist the card as the customer default so renewals charge it. */
        payment_settings: { save_default_payment_method: 'on_subscription' },
        /* userId is read by the webhook to mark the trial consumed once Stripe
         * confirms the subscription is trialing. */
        metadata: { organizationId: input.organizationId, planKey: input.planKey, userId },
        ...(shouldApplyTrial
          ? { trial_period_days: trialDays, payment_behavior: 'default_incomplete' }
          : { payment_behavior: 'error_if_incomplete' }),
        expand: ['latest_invoice.payment_intent'],
      })

      /* Record the fingerprint. If we granted a trial, store it as NOT-yet-used
       * (the webhook flips it to used once Stripe confirms trialing). If a trial
       * was available but blocked, mark used now so it can't be reclaimed. For
       * no-trial plans, don't burn trial eligibility. Mirrors funnelmods. */
      const fingerprintUsed = shouldApplyTrial ? false : trialDays > 0
      await storeCardFingerprint(userId, input.paymentMethodId, fingerprintUsed)

      return { subscriptionId: subscription.id, status: subscription.status }
    }),

  addPaymentMethod: protectedProcedure({
    requirePermission: permissions.BILLING_UPDATE,
    audit: { entity: 'subscription', action: 'addPaymentMethod' },
  })
    .input(orgInput.extend({ paymentMethodId: paymentMethodIdSchema, makeDefault: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      ensureConfigured()
      const customerId = await ensureStripeCustomer(input.organizationId, {
        email: ctx.user.email,
        name: ctx.user.name,
      })
      await attachPaymentMethod(customerId, input.paymentMethodId, input.makeDefault ?? false)
      return { success: true }
    }),

  setDefaultPaymentMethod: protectedProcedure({
    requirePermission: permissions.BILLING_UPDATE,
    audit: { entity: 'subscription', action: 'setDefaultPaymentMethod' },
  })
    .input(orgInput.extend({ paymentMethodId: paymentMethodIdSchema }))
    .mutation(async ({ input }) => {
      ensureConfigured()
      const customerId = await requireCustomerId(input.organizationId)
      await setDefaultPaymentMethod(customerId, input.paymentMethodId)
      return { success: true }
    }),

  deletePaymentMethod: protectedProcedure({
    requirePermission: permissions.BILLING_DELETE,
    audit: { entity: 'subscription', action: 'deletePaymentMethod' },
  })
    .input(orgInput.extend({ paymentMethodId: paymentMethodIdSchema }))
    .mutation(async ({ input }) => {
      ensureConfigured()
      /* Tenant guard lives in the service signature: detachPaymentMethod REQUIRES
       * the org's customerId and no-ops (returns false) for a card it doesn't own,
       * so a billing-admin can't detach another tenant's card by passing its id. */
      const customerId = await requireCustomerId(input.organizationId)
      const detached = await detachPaymentMethod(customerId, input.paymentMethodId)
      if (!detached) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'That payment method does not belong to this organization',
        })
      }
      return { success: true }
    }),

  cancelSubscription: protectedProcedure({
    requirePermission: permissions.BILLING_UPDATE,
    audit: { entity: 'subscription', action: 'cancel' },
  })
    .input(orgInput)
    .mutation(async ({ ctx, input }) => {
      ensureConfigured()
      const subscription = await getOrganizationSubscription(input.organizationId)
      if (!subscription?.stripeSubscriptionId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription to cancel' })
      }
      const stripe = getStripeClient()
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      })
      /* Optimistic local reflection; the webhook will reconcile authoritatively. */
      await ctx.db.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      })
      return { success: true }
    }),

  reactivateSubscription: protectedProcedure({
    requirePermission: permissions.BILLING_UPDATE,
    audit: { entity: 'subscription', action: 'reactivate' },
  })
    .input(orgInput)
    .mutation(async ({ ctx, input }) => {
      ensureConfigured()
      const subscription = await getOrganizationSubscription(input.organizationId)
      if (!subscription?.stripeSubscriptionId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No subscription to reactivate' })
      }
      const stripe = getStripeClient()
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      })
      await ctx.db.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false },
      })
      return { success: true }
    }),

  /* Change plan/interval on an existing subscription with proration, or create
   * a fresh one if none is active. The webhook syncs the resulting row. */
  upgradeOrganization: protectedProcedure({
    requirePermission: permissions.BILLING_UPDATE,
    txTimeout: 20_000,
    audit: { entity: 'subscription', action: 'upgrade' },
  })
    .input(upgradeSubscriptionSchema)
    .mutation(async ({ input }) => {
      ensureConfigured()
      const priceId = getPlanPriceId(input.planKey, input.billingInterval)
      if (!priceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No Stripe price configured for ${input.planKey} (${input.billingInterval})`,
        })
      }

      const stripe = getStripeClient()
      const subscription = await getOrganizationSubscription(input.organizationId)

      if (subscription?.stripeSubscriptionId) {
        const current = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId)
        const itemId = current.items.data[0]?.id
        if (!itemId) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Subscription item missing' })
        }
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: itemId, price: priceId }],
          proration_behavior: 'always_invoice',
          metadata: { organizationId: input.organizationId, planKey: input.planKey },
          ...(current.status === 'trialing' ? { trial_end: 'now' as const } : {}),
        })
        return { subscriptionId: subscription.stripeSubscriptionId, status: 'updated' }
      }

      const customerId = await requireCustomerId(input.organizationId)
      const created = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'error_if_incomplete',
        /* Charges the customer's existing default payment method and keeps it
         * as default for renewals. */
        payment_settings: { save_default_payment_method: 'on_subscription' },
        metadata: { organizationId: input.organizationId, planKey: input.planKey },
        expand: ['latest_invoice.payment_intent'],
      })
      return { subscriptionId: created.id, status: created.status }
    }),
})
