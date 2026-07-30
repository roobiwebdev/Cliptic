/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: InviteMemberButton
 *
 * WHAT:  Header action that opens the invite Sheet. Hidden entirely when the
 *        user lacks invitation:create; wrapped in <FeatureGate> so hitting the
 *        seat limit opens the upgrade modal instead of the sheet.
 * WHERE: Passed as ContentLayout headerActions on the team page.
 */

import * as React from 'react'
import { Plus } from 'lucide-react'

import { useActiveOrganization, useActiveOrganizationId } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { MemberSheetContent } from './member-sheet-content'

export function InviteMemberButton() {
  const [open, setOpen] = React.useState(false)
  /* Bumped only when a new invite is opened, so the sheet body remounts with a
   * fresh form each time — but the key stays STABLE while closing, letting the
   * base-ui Dialog finish its close sequence (and release the modal's pointer
   * lock) instead of being torn out mid-animation. */
  const [invocation, setInvocation] = React.useState(0)
  const { hasPermission } = useActiveOrganization()
  const organizationId = useActiveOrganizationId()

  if (!organizationId || !hasPermission(permissions.INVITATION_CREATE)) return null

  function handleOpen() {
    setInvocation((n) => n + 1)
    setOpen(true)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <FeatureGate resource="member">
        <Button className="gap-2" onClick={handleOpen}>
          <Plus className="h-4 w-4" />
          Invite Member
        </Button>
      </FeatureGate>
      <MemberSheetContent
        key={invocation}
        organizationId={organizationId}
        editingMember={null}
        onClose={() => setOpen(false)}
      />
    </Sheet>
  )
}
