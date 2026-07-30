/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PortalUsersPage
 *
 * WHAT:  /portal/users — every user on the platform.
 * WHERE: Gated by the (portal) layout.
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { PortalUsers } from './_components/portal-users'

export const metadata: Metadata = {
  title: 'Users',
}

export default function PortalUsersPage() {
  return (
    <ContentLayout title="Users">
      <PortalUsers />
    </ContentLayout>
  )
}
