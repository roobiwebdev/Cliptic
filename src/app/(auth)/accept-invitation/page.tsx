/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: AcceptInvitationPage
 *
 * WHAT:  /accept-invitation route — renders the invitation accept surface
 *        inside the shared AuthShell. Reads the `id` query param.
 * WHERE: Linked from the invitation email; the client component
 *        (AcceptInvitation) drives the accept flow.
 */

import type { Metadata } from 'next'

import { AuthShell } from '@/components/global/auth'
import { AcceptInvitation } from './_components/accept-invitation'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Accept invitation',
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  return (
    <AuthShell>
      {id ? (
        <AcceptInvitation invitationId={id} />
      ) : (
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Invitation unavailable</CardTitle>
            <CardDescription>This link is missing its invitation reference.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </AuthShell>
  )
}
