/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: hasUserUsedFreeTrial, hasUserAnyTrialUsedFingerprint,
 *   storeCardFingerprint, markUserFingerprintsAsTrialUsed
 *
 * WHAT:  Free-trial abuse prevention via Stripe card fingerprints. A card's
 *        `fingerprint` is a stable hash that's identical across
 *        re-tokenizations and across Stripe customers, so it identifies "the
 *        same physical card" even when a user makes a new account or re-enters
 *        the card. These helpers record/read whether a trial was used on a card.
 * WHY:   Without this, a user could restart a free trial indefinitely with the
 *        same card. EVERY function fails OPEN (errors → allow the trial / no-op)
 *        because trial-abuse tracking must never block a legitimate signup or
 *        roll back a real subscription — it's a guardrail, not a gate.
 * WHERE: Called by billing.createSubscription (eligibility check + record) and
 *        the Stripe webhook (mark trial consumed once Stripe confirms trialing).
 *        Uses the lazy Stripe client (config/stripe) and the prisma singleton.
 */

import { prisma } from '@/lib/config/prisma'
import { getStripeClient, isStripeConfigured } from '@/lib/config/stripe'

/* Resolves the card fingerprint for a payment method, or null on any failure
 * (unconfigured Stripe, retrieval error, non-card method). */
async function getCardFingerprint(paymentMethodId: string): Promise<string | null> {
  if (!isStripeConfigured()) return null
  try {
    const paymentMethod = await getStripeClient().paymentMethods.retrieve(paymentMethodId)
    return paymentMethod.card?.fingerprint ?? null
  } catch {
    return null
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: hasUserUsedFreeTrial
 *
 * WHAT:  True if a trial has ever been used (by anyone) on the same card as the
 *        given payment method.
 * WHY:   Cross-user check on the fingerprint catches the "new account, same
 *        card" abuse pattern. Fails OPEN (returns false) so a lookup failure
 *        never wrongly denies a trial.
 * WHERE: billing.createSubscription before granting a trial.
 */
export async function hasUserUsedFreeTrial(
  _userId: string,
  paymentMethodId: string
): Promise<boolean> {
  try {
    const fingerprint = await getCardFingerprint(paymentMethodId)
    if (!fingerprint) return false
    const existing = await prisma.cardFingerprint.findFirst({
      where: { fingerprint, usedFreeTrial: true },
      select: { id: true },
    })
    return existing !== null
  } catch {
    return false
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: hasUserAnyTrialUsedFingerprint
 *
 * WHAT:  True if any card stored for this user has already consumed a trial.
 * WHY:   Fast user-scoped check that doesn't require retrieving a payment
 *        method from Stripe. Fails OPEN.
 * WHERE: billing.createSubscription before granting a trial.
 */
export async function hasUserAnyTrialUsedFingerprint(userId: string): Promise<boolean> {
  try {
    const existing = await prisma.cardFingerprint.findFirst({
      where: { userId, usedFreeTrial: true },
      select: { id: true },
    })
    return existing !== null
  } catch {
    return false
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: storeCardFingerprint
 *
 * WHAT:  Records (upserts) the card fingerprint for a user, optionally flagging
 *        the trial as used. `usedFreeTrial` only ever flips to true (never back
 *        to false) on update.
 * WHY:   Builds the history the checks above read. Non-critical: silently no-ops
 *        on any failure so it can't roll back the surrounding subscription tx.
 * WHERE: billing.createSubscription after deciding trial eligibility.
 */
export async function storeCardFingerprint(
  userId: string,
  paymentMethodId: string,
  usedFreeTrial = false
): Promise<void> {
  try {
    const fingerprint = await getCardFingerprint(paymentMethodId)
    if (!fingerprint) return
    await prisma.cardFingerprint.upsert({
      where: { userId_fingerprint: { userId, fingerprint } },
      /* Only escalate to true — never clear a previously-used flag. */
      update: { updatedAt: new Date(), ...(usedFreeTrial ? { usedFreeTrial: true } : {}) },
      create: { userId, fingerprint, usedFreeTrial },
    })
  } catch {
    /* Non-critical — swallow. */
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: markUserFingerprintsAsTrialUsed
 *
 * WHAT:  Flags all of a user's not-yet-used fingerprints as having used a trial.
 * WHY:   Called once Stripe CONFIRMS the subscription is trialing (via webhook),
 *        not at create time — so a failed/incomplete subscription doesn't burn
 *        the user's trial eligibility. Fails OPEN.
 * WHERE: Stripe webhook on customer.subscription.created/updated when trialing.
 */
export async function markUserFingerprintsAsTrialUsed(userId: string): Promise<void> {
  try {
    await prisma.cardFingerprint.updateMany({
      where: { userId, usedFreeTrial: false },
      data: { usedFreeTrial: true, updatedAt: new Date() },
    })
  } catch {
    /* Non-critical — swallow. */
  }
}
