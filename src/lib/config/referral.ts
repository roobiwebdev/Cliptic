/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: REFERRAL_COOKIE_NAME, REFERRAL_COOKIE_MAX_AGE_DAYS,
 *   REFERRAL_QUERY_PARAM, REFERRALS_PAGE_ENABLED, affiliate
 *
 * WHAT:  Referral-tracking constants — the ?ref= query param, the first-touch
 *        attribution cookie (name + TTL), and the env flag hiding the
 *        referrals page until the program launches publicly.
 * WHY:   One module so proxy.ts (cookie capture), the auth signup hook
 *        (attribution write), and the referrals page (visibility) can never
 *        drift on names/TTLs. First-touch + 60 days was the product decision:
 *        the original introducer gets the credit.
 * WHERE: src/proxy.ts, src/lib/better-auth/auth.ts, referral.service.ts,
 *        settings/referrals page.
 */

export const REFERRAL_QUERY_PARAM = 'ref'

export const REFERRAL_COOKIE_NAME = 'ref_code'

/* First-touch attribution window. */
export const REFERRAL_COOKIE_MAX_AGE_DAYS = 60

/**
 * SOURCE OF TRUTH KEYWORDS: REFERRALS_PAGE_ENABLED
 *
 * WHAT:  Feature flag for the /dashboard/settings/referrals page. Tracking
 *        (cookie + attribution) always runs; only the PAGE is gated, so
 *        attribution history is complete on launch day.
 * WHERE: settings/referrals page (notFound when disabled).
 */
export const REFERRALS_PAGE_ENABLED =
  process.env['NEXT_PUBLIC_REFERRALS_ENABLED'] === 'true'
