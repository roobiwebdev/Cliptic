/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: OrganizationSettingsPage
 *
 * WHAT:  /dashboard/settings/organization — rename + logo.
 * WHERE: RESOURCES.organizationSettings.nav.href.
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { OrganizationTab } from './_components/organization-tab'

export const metadata: Metadata = {
  title: 'Organization',
}

export default function OrganizationSettingsPage() {
  return (
    <ContentLayout title="Organization">
      <OrganizationTab />
    </ContentLayout>
  )
}
