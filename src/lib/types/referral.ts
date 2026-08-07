/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: referralCodeSchema, ReferralStats, affiliate
 *
 * WHAT:  Zod schema for a referral code (validates the raw ?ref= / cookie
 *        value before it touches the database) plus the stats shape the
 *        referrals page renders.
 * WHY:   The cookie value is attacker-controlled input — it MUST pass a schema
 *        before any lookup (CLAUDE.md: Zod on every input surface).
 * WHERE: referral.service.recordReferralAttribution (sanitizing the cookie),
 *        referral router, referrals settings page.
 */

import { z } from 'zod'

/* nanoid(8)-style codes; tolerant bounds so a longer future format still passes. */
export const referralCodeSchema = z
  .string()
  .trim()
  .min(4, 'Invalid referral code.')
  .max(32, 'Invalid referral code.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid referral code.')

export type ReferralCodeValue = z.infer<typeof referralCodeSchema>

export interface ReferralStats {
  /** The caller's shareable code (uppercase). */
  code: string
  /** Full sign-up URL with ?ref= prefilled. */
  referralLink: string
  /** Users who signed up through the code. */
  signups: number
  /** Of those, how many went on to create an organization. */
  organizations: number
}
