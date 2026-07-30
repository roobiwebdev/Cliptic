/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: AuditLogsSettingsPage
 *
 * WHAT:  /dashboard/settings/audit-logs — forensic activity timeline.
 * WHERE: RESOURCES.auditLogs.nav.href (flag-gated, hidden below pro plans).
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { AuditLogsTable } from './_components/audit-logs-table'

export const metadata: Metadata = {
  title: 'Audit Logs',
}

export default function AuditLogsSettingsPage() {
  return (
    <ContentLayout title="Audit Logs">
      <AuditLogsTable />
    </ContentLayout>
  )
}
