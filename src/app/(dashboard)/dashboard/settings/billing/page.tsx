/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: BillingSettingsPage
 *
 * WHAT:  /dashboard/settings/billing — plan, payment methods, cancel/upgrade.
 * WHERE: RESOURCES.billing.nav.href. Server shell + client BillingTab.
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { BillingTab } from './_components/billing-tab'

export const metadata: Metadata = {
  title: 'Billing',
}

export default function BillingSettingsPage() {
  return (
    <ContentLayout title="Billing">
      <BillingTab />
    </ContentLayout>
  )
}
