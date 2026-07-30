/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: MemberManager
 *
 * WHAT:  Team page body — a two-column layout: left = members (search + Manage
 *        Roles + MemberList), right = the Organization Owner card. Hosts the
 *        edit-member and manage-roles Sheets.
 * WHY:   Reads the merged member+invitation list from member.list; splits owner
 *        vs regular members; removal is optimistic. Matches funnelmods.
 * WHERE: Rendered by TeamClient.
 */

import * as React from 'react'
import { SearchIcon, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { SectionHeader } from '@/components/global/section-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet } from '@/components/ui/sheet'
import { MemberList } from './member-list'
import { OwnershipCard } from './ownership-card'
import { MemberSheetContent } from './member-sheet-content'
import { ManageRoleSheetContent } from './manage-role-sheet-content'
import type { OrganizationMember } from './member-types'

export function MemberManager({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useActiveOrganization()
  const utils = trpc.useUtils()
  const canManageRoles = hasPermission(permissions.MEMBER_UPDATE)

  const [searchQuery, setSearchQuery] = React.useState('')
  const [editingMember, setEditingMember] = React.useState<OrganizationMember | null>(null)
  const [isEditOpen, setIsEditOpen] = React.useState(false)
  const [isManageRolesOpen, setIsManageRolesOpen] = React.useState(false)

  const { data: members = [], isLoading } = trpc.member.list.useQuery({ organizationId })
  const removeMember = trpc.member.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.member.list.invalidate({ organizationId }),
        utils.usage.getFeatureGates.invalidate({ organizationId }),
      ])
      toast.success('Member removed')
    },
    onError: (e) => toast.error(e.message || 'Failed to remove member'),
  })

  const owner = members.find((m) => m.roleName === 'owner')
  const regularMembers = members.filter((m) => m.roleName !== 'owner')
  const filteredMembers = regularMembers.filter((m) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q)
  })

  function handleEditMember(member: OrganizationMember) {
    setEditingMember(member)
    setIsEditOpen(true)
  }
  function handleCloseEdit() {
    setIsEditOpen(false)
    setTimeout(() => setEditingMember(null), 300)
  }

  if (isLoading && members.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="space-y-4 md:col-span-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    )
  }

  return (
    <>
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <MemberSheetContent
          key={editingMember?.id ?? 'no-member'}
          organizationId={organizationId}
          editingMember={editingMember}
          onClose={handleCloseEdit}
        />
      </Sheet>

      <Sheet open={isManageRolesOpen} onOpenChange={setIsManageRolesOpen}>
        <ManageRoleSheetContent organizationId={organizationId} onClose={() => setIsManageRolesOpen(false)} />
      </Sheet>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <SectionHeader title="Team Members" description="Manage team member access and permissions" />

          <div className="flex gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-9"
              />
            </div>
            {canManageRoles ? (
              <Button variant="outline" onClick={() => setIsManageRolesOpen(true)} className="h-10 gap-2">
                <ShieldCheck className="h-4 w-4" />
                Manage Roles
              </Button>
            ) : null}
          </div>

          <MemberList
            organizationId={organizationId}
            members={filteredMembers}
            onEditMember={handleEditMember}
            onRemoveMember={(id) => removeMember.mutate({ organizationId, memberId: id })}
          />
        </div>

        <div className="space-y-6 md:col-span-1">
          <SectionHeader title="Organization Owner" description="Primary organization administrator" />
          <OwnershipCard owner={owner} />
        </div>
      </div>
    </>
  )
}
