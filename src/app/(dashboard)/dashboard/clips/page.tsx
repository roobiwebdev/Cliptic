/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipsPage
 *
 * WHAT:  The /dashboard/clips page — header with the New clip action + the grid.
 * WHERE: Reachable from the registry-driven sidebar (RESOURCES.clips.nav).
 */

import { ContentLayout } from '@/components/global/page-header'
import { ClipsClient } from './_components/clips-client'
import { NewClipDialog } from './_components/new-clip-dialog'

export default function ClipsPage() {
  return (
    <ContentLayout title="Clips" actions={<NewClipDialog />}>
      <ClipsClient />
    </ContentLayout>
  )
}
