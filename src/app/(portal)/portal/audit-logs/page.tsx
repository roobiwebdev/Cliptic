/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PortalAuditLogsPage
 *
 * WHAT:  /portal/audit-logs — platform-wide activity timeline.
 * WHERE: Gated by the (portal) layout.
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { PortalActivity } from './_components/portal-activity'

export const metadata: Metadata = {
  title: 'Platform audit logs',
}

export default function PortalAuditLogsPage() {
  return (
    <ContentLayout title="Platform audit logs">
      <PortalActivity />
    </ContentLayout>
  )
}
