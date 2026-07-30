/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: resolveExistingStripeCustomerId, ensureStripeCustomer,
 *   listPaymentMethods, getOrganizationSubscription, PaymentMethodSummary,
 *   attachPaymentMethod, detachPaymentMethod, setDefaultPaymentMethod
 *
 * WHAT:  Stripe customer + payment-method helpers and the org's local
 *        subscription read.
 * WHY:   A tenant has at most one Stripe customer; resolving/creating it once
 *        (stored on Organization.stripeCustomerId, falling back to the newest
 *        Subscription) prevents duplicate customers across checkout/upgrade.
 *        Payment-method shaping happens here so the router/UI never touch raw
 *        Stripe objects.
 * WHERE: Used by src/trpc/routers/billing.ts. Talks to Stripe via
 *        getStripeClient and to Prisma for the customer handle + subscription.
 */

import { getStripeClient } from '@/lib/config/stripe'
import { prisma } from '@/lib/config/prisma'

export interface PaymentMethodSummary {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  isDefault: boolean
}

/**
 * SOURCE OF TRUTH KEYWORDS: resolveExistingStripeCustomerId
 *
 * WHAT:  Returns the org's Stripe customer id from Organization, else the
 *        newest Subscription row, else null.
 * WHERE: Used by ensureStripeCustomer and payment-method reads.
 */
export async function resolveExistingStripeCustomerId(
  organizationId: string
): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeCustomerId: true },
  })
  if (org?.stripeCustomerId) return org.stripeCustomerId

  const subscription = await prisma.subscription.findFirst({
    where: { referenceId: organizationId, stripeCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true },
  })
  return subscription?.stripeCustomerId ?? null
}

/**
 * SOURCE OF TRUTH KEYWORDS: ensureStripeCustomer
 *
 * WHAT:  Returns the org's Stripe customer id, creating the customer (and
 *        persisting it on Organization) when none exists yet.
 * WHERE: Called before creating a subscription or attaching a card.
 */
export async function ensureStripeCustomer(
  organizationId: string,
  params: { email: string; name: string }
): Promise<string> {
  const stripe = getStripeClient()
  const existing = await resolveExistingStripeCustomerId(organizationId)
  if (existing) {
    /* Verify the customer still exists in Stripe — it may have been deleted in
     * the dashboard, leaving a stale id on the org/subscription. If so, fall
     * through and create a fresh one. */
    try {
      const customer = await stripe.customers.retrieve(existing)
      const isDeleted = 'deleted' in customer && customer.deleted === true
      if (!isDeleted) return existing
    } catch {
      /* Not found / retrieval failed — create a fresh customer below. */
    }
  }

  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: { organizationId },
  })

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

/**
 * SOURCE OF TRUTH KEYWORDS: listPaymentMethods
 *
 * WHAT:  Lists the customer's card payment methods, flagging the default.
 * WHERE: billing.getPaymentMethods.
 */
export async function listPaymentMethods(
  organizationId: string
): Promise<PaymentMethodSummary[]> {
  const customerId = await resolveExistingStripeCustomerId(organizationId)
  if (!customerId) return []

  const stripe = getStripeClient()
  const [customer, methods] = await Promise.all([
    stripe.customers.retrieve(customerId),
    stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
  ])

  const defaultId =
    !('deleted' in customer) && typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : null

  return methods.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? null,
    last4: pm.card?.last4 ?? null,
    expMonth: pm.card?.exp_month ?? null,
    expYear: pm.card?.exp_year ?? null,
    isDefault: pm.id === defaultId,
  }))
}

/**
 * SOURCE OF TRUTH KEYWORDS: attachPaymentMethod
 *
 * WHAT:  Attaches a payment method to the org's customer and optionally makes
 *        it the default.
 * WHERE: billing.addPaymentMethod.
 */
export async function attachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  makeDefault: boolean
): Promise<void> {
  const stripe = getStripeClient()
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
  if (makeDefault) {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: setDefaultPaymentMethod
 *
 * WHERE: billing.setDefaultPaymentMethod.
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  const stripe = getStripeClient()
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: detachPaymentMethod, MultiTenant, IDOR
 *
 * WHAT:  Detaches a card ONLY if it belongs to `customerId`; returns false
 *        (no-op) when the card is owned by a different customer or none.
 * WHY:   MULTI-TENANT guard. `customerId` is a REQUIRED parameter so a caller
 *        can never detach a bare `pm_…` id without proving which customer (org)
 *        it must belong to — the type signature is the forcing function that
 *        prevents cross-tenant card removal (IDOR). Mirrors funnelmods'
 *        org-scoped service signatures (e.g. getLocalComponentById).
 * WHERE: billing.deletePaymentMethod (customerId resolved from the org).
 */
export async function detachPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<boolean> {
  const stripe = getStripeClient()
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
  const ownerCustomerId =
    typeof paymentMethod.customer === 'string'
      ? paymentMethod.customer
      : paymentMethod.customer?.id ?? null
  if (ownerCustomerId !== customerId) return false
  await stripe.paymentMethods.detach(paymentMethodId)
  return true
}

/**
 * SOURCE OF TRUTH KEYWORDS: getOrganizationSubscription
 *
 * WHAT:  Newest local Subscription row for the org (or null).
 * WHERE: billing.getSubscription.
 */
export async function getOrganizationSubscription(organizationId: string) {
  return prisma.subscription.findFirst({
    where: { referenceId: organizationId },
    orderBy: { createdAt: 'desc' },
  })
}
