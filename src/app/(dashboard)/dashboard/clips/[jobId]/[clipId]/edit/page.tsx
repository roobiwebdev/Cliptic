/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ClipEditPage
 *
 * WHAT:  The /dashboard/clips/[jobId]/[clipId]/edit page — the clip Editor
 *        (reframe now; captions next). Opened from a clip's "Edit" button.
 */

import { ContentLayout } from '@/components/global/page-header'
import { ClipEditor } from './_components/clip-editor'

export default async function ClipEditPage({
  params,
}: {
  params: Promise<{ jobId: string; clipId: string }>
}) {
  const { jobId, clipId } = await params
  return (
    <ContentLayout title="Editor">
      <ClipEditor jobId={jobId} clipId={clipId} />
    </ContentLayout>
  )
}
