/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipJobPage
 *
 * WHAT:  The /dashboard/clips/[jobId] page — renders the live job detail view.
 * WHERE: Linked from the clips grid cards.
 */

import { ContentLayout } from '@/components/global/page-header'
import { JobDetail } from './_components/job-detail'

export default async function ClipJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  return (
    <ContentLayout title="Clip job">
      <JobDetail jobId={jobId} />
    </ContentLayout>
  )
}
