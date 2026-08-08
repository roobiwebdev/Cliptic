/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: ensureReferralCode, recordReferralAttribution,
 *   linkAttributionToOrganization, getReferralStats, affiliate, ReferralEarning
 *
 * WHAT:  Referral tracking — mint a user's shareable code, record "referred by
 *        X" at signup (first-touch cookie), link the attribution to the org
 *        created at onboarding, and read stats for the referrals page.
 * WHY:   Attribution is best-effort and NON-CRITICAL: every write here fails
 *        soft (logs + returns) so a referral hiccup can never break signup or
 *        onboarding. No money moves in this phase.
 *
 *        FUTURE PAYOUT SEAM (design only — DO NOT build yet):
 *        - New model `ReferralEarning { id, attributionId, stripeInvoiceId
 *          @unique, amountCents, currency, status pending|approved|paid,
 *          createdAt }` — `stripeInvoiceId @unique` makes webhook credits
 *          idempotent (retries can't double-credit).
 *        - Credit point: the Stripe webhook's `invoice.payment_succeeded`
 *          (intentionally unhandled today — see the webhook route header):
 *          invoice → local Subscription row → referredOrganizationId match on
 *          ReferralAttribution → insert ReferralEarning at the agreed rate.
 *        - Payout execution (Stripe Connect transfers / manual) stays a
 *          separate concern behind `status`; this service only ACCRUES.
 *        Provider-neutral: everything keys off local rows, never raw Stripe.
 * WHERE: proxy.ts sets the cookie; auth.ts user.create.after calls
 *        recordReferralAttribution; organization router calls
 *        linkAttributionToOrganization; referral router reads stats.
 */

import { nanoid } from 'nanoid'
import { prisma } from '@/lib/config/prisma'
import { referralCodeSchema } from '@/lib/types'

/**
 * SOURCE OF TRUTH KEYWORDS: ensureReferralCode
 *
 * WHAT:  Returns the user's referral code, minting one on first use
 *        (uppercase nanoid, collision-retried like ensureUniqueOrganizationSlug).
 * WHERE: referral.getMyReferral.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({
    where: { userId },
    select: { code: true },
  })
  if (existing) return existing.code

  for (let attempt = 0; attempt < 3; attempt++) {
    /* 8 chars on the first tries, longer on the last resort. */
    const code = nanoid(attempt < 2 ? 8 : 12).toUpperCase()
    const taken = await prisma.referralCode.findUnique({ where: { code }, select: { id: true } })
    if (taken) continue
    const created = await prisma.referralCode.create({
      data: { code, userId },
      select: { code: true },
    })
    return created.code
  }
  throw new Error('[referral] could not mint a unique referral code')
}

/**
 * SOURCE OF TRUTH KEYWORDS: recordReferralAttribution
 *
 * WHAT:  Writes the "referred by" row at signup from the raw cookie value.
 *        Validates the code (attacker-controlled input), ignores unknown codes
 *        and self-referrals, and never throws — signup must never break.
 * WHERE: auth.ts databaseHooks.user.create.after.
 */
export async function recordReferralAttribution(
  rawCode: string,
  referredUserId: string
): Promise<void> {
  try {
    const parsed = referralCodeSchema.safeParse(rawCode)
    if (!parsed.success) return

    const referralCode = await prisma.referralCode.findUnique({
      where: { code: parsed.data.toUpperCase() },
      select: { id: true, userId: true },
    })
    if (!referralCode) return
    /* No self-referrals. */
    if (referralCode.userId === referredUserId) return

    /* referredUserId is unique — first touch wins, replays no-op. */
    const already = await prisma.referralAttribution.findUnique({
      where: { referredUserId },
      select: { id: true },
    })
    if (already) return

    await prisma.referralAttribution.create({
      data: { referralCodeId: referralCode.id, referredUserId },
    })
  } catch (err) {
    console.warn('[referral] attribution skipped:', err)
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: linkAttributionToOrganization
 *
 * WHAT:  Stamps the org a referred user created onto their attribution row
 *        (first org only). Fail-soft — onboarding must never break.
 * WHERE: organization.createOrganization, after the creation tx commits.
 */
export async function linkAttributionToOrganization(
  userId: string,
  organizationId: string
): Promise<void> {
  try {
    await prisma.referralAttribution.updateMany({
      where: { referredUserId: userId, referredOrganizationId: null },
      data: { referredOrganizationId: organizationId },
    })
  } catch (err) {
    console.warn('[referral] org linkage skipped:', err)
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: getReferralStats
 *
 * WHAT:  Signup + organization counts for the user's code.
 * WHERE: referral.getMyReferral.
 */
export async function getReferralStats(
  userId: string
): Promise<{ signups: number; organizations: number }> {
  const code = await prisma.referralCode.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (!code) return { signups: 0, organizations: 0 }

  const [signups, organizations] = await Promise.all([
    prisma.referralAttribution.count({ where: { referralCodeId: code.id } }),
    prisma.referralAttribution.count({
      where: { referralCodeId: code.id, referredOrganizationId: { not: null } },
    }),
  ])
  return { signups, organizations }
}
