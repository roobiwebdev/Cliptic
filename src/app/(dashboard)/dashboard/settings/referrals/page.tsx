/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ReferralsSettingsPage, affiliate
 *
 * WHAT:  /dashboard/settings/referrals — your referral link + signup stats.
 *        Hidden behind NEXT_PUBLIC_REFERRALS_ENABLED (404 when off) until the
 *        referral program launches; tracking runs regardless, so history is
 *        complete on launch day.
 * WHERE: Server shell + client ReferralsSection. No sidebar nav entry yet —
 *        add one to RESOURCES when the flag flips on permanently.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { REFERRALS_PAGE_ENABLED } from '@/lib/config'
import { ContentLayout } from '@/components/global/page-header'
import { ReferralsSection } from './_components/referrals-section'

export const metadata: Metadata = {
  title: 'Referrals',
}

export default function ReferralsSettingsPage() {
  if (!REFERRALS_PAGE_ENABLED) notFound()

  return (
    <ContentLayout title="Referrals">
      <ReferralsSection />
    </ContentLayout>
  )
}
