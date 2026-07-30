/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PortalHomePage
 *
 * WHAT:  /portal home — platform overview stats.
 * WHERE: Gated by the (portal) layout.
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { PortalOverview } from './_components/portal-overview'

export const metadata: Metadata = {
  title: 'Platform',
}

export default function PortalHomePage() {
  return (
    <ContentLayout title="Platform overview">
      <PortalOverview />
    </ContentLayout>
  )
}
