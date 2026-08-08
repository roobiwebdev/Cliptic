/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: referralRouter, getMyReferral, affiliate
 *
 * WHAT:  Referral endpoints — mint-on-read of the caller's code + stats.
 * WHY:   authProcedure (not protectedProcedure): a referral code belongs to
 *        the USER, not an organization, so there's no org membership or
 *        billing permission to check — same pattern as
 *        organization.createOrganization.
 * WHERE: Mounted as `referral` in src/trpc/routers/_app. Service:
 *        referral.service. Consumed by settings/referrals page.
 */

import { createTRPCRouter } from '../init'
import { authProcedure } from '../procedures'
import { APP_URL } from '@/lib/config'
import { AUTH_ROUTES } from '@/lib/config/auth-routes'
import { REFERRAL_QUERY_PARAM } from '@/lib/config/referral'
import type { ReferralStats } from '@/lib/types'
import {
  ensureReferralCode,
  getReferralStats,
} from '@/services/referral.service'

export const referralRouter = createTRPCRouter({
  getMyReferral: authProcedure.query(async ({ ctx }): Promise<ReferralStats> => {
    const code = await ensureReferralCode(ctx.user.id)
    const stats = await getReferralStats(ctx.user.id)
    return {
      code,
      referralLink: `${APP_URL}${AUTH_ROUTES.signUp}?${REFERRAL_QUERY_PARAM}=${code}`,
      signups: stats.signups,
      organizations: stats.organizations,
    }
  }),
})
