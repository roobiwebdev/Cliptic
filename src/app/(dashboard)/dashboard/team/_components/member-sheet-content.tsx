/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: MemberSheetContent
 *
 * WHAT:  The invite / edit-member Sheet body — email (invite) or member info
 *        (edit), a role combobox, permission switches, and the invitation link
 *        after a successful invite.
 * WHY:   Encodes the chosen role into the string the routers decode via
 *        processRole: a saved role name, `<name>|||<perms>` (admin/new role), or
 *        a bare `<perms>` array (custom per-member). Reuses RoleCommandSelector
 *        + PermissionSwitches. Matches the funnelmods team behavior.
 * WHERE: Mounted inside a <Sheet> by MemberManager (edit) and InviteMemberButton
 *        (invite).
 */

import * as React from 'react'
import { Loader2Icon, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { getAdminPresetPermissions } from '@/lib/better-auth/permission-helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { RoleCommandSelector, type SelectableRole } from './role-command-selector'
import { PermissionSwitches } from './permission-switches'
import type { OrganizationMember } from './member-types'

export function MemberSheetContent({
  organizationId,
  editingMember,
  onClose,
}: {
  organizationId: string
  editingMember: OrganizationMember | null
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const isEditing = editingMember !== null
  const isOwner = editingMember?.roleName === 'owner'

  /* Initial values come straight from props at mount — the parents remount
   * this component (via `key`) when the target changes, so no seeding effect
   * (which the React Compiler lint forbids) is needed. */
  const [email, setEmail] = React.useState(() => editingMember?.user.email ?? '')
  const [permissions, setPermissions] = React.useState<string[]>(() =>
    editingMember ? editingMember.permissions : getAdminPresetPermissions()
  )
  /* undefined = "not chosen yet, fall back to the role derived from the member". */
  const [roleOverride, setRoleOverride] = React.useState<SelectableRole | null | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [invitationLink, setInvitationLink] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const rolesQuery = trpc.organizationRoles.list.useQuery({ organizationId })
  const invite = trpc.invitation.create.useMutation()
  const update = trpc.member.update.useMutation()

  /* The member's current role resolved against the saved-roles list — derived,
   * not stored, since the roles query is async. */
  const derivedRole = React.useMemo<SelectableRole | null>(() => {
    if (!editingMember) return null
    const saved = rolesQuery.data?.find((r) => r.role === editingMember.role)
    return saved ? { id: saved.id, role: saved.role, permissions: saved.permissions } : null
  }, [editingMember, rolesQuery.data])

  const selectedRole = roleOverride !== undefined ? roleOverride : derivedRole

  function handleRoleSelect(role: SelectableRole | null) {
    setRoleOverride(role)
    if (role) setPermissions(role.permissions)
  }
  function handleCreateNew(roleName: string) {
    setRoleOverride({ id: 'new', role: roleName, permissions })
  }

  /* Existing saved roles lock the switches; 'new'/'admin'/custom leave them editable. */
  const switchesLocked = selectedRole !== null && selectedRole.id !== 'new'

  function encodeRole(): string {
    if (selectedRole) {
      if (selectedRole.id === 'new' || selectedRole.id === 'admin') {
        return `${selectedRole.role}|||${JSON.stringify(permissions)}`
      }
      return selectedRole.role
    }
    return JSON.stringify(permissions)
  }

  async function handleSave() {
    setError(null)
    if (!isEditing && !email.trim()) {
      setError('Email is required.')
      return
    }
    if (!isOwner && permissions.length === 0) {
      setError('Please select at least one permission.')
      return
    }

    const role = encodeRole()
    try {
      if (isEditing && editingMember) {
        await update.mutateAsync({ organizationId, memberId: editingMember.id, role, permissions })
        await utils.member.list.invalidate({ organizationId })
        toast.success('Member updated')
        onClose()
      } else {
        const result = await invite.mutateAsync({ organizationId, email: email.trim(), role })
        await Promise.all([
          utils.member.list.invalidate({ organizationId }),
          utils.usage.getFeatureGates.invalidate({ organizationId }),
        ])
        setInvitationLink(result.invitationLink)
        toast.success('Invitation sent')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  async function handleCopy() {
    if (!invitationLink) return
    try {
      await navigator.clipboard.writeText(invitationLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const isProcessing = invite.isPending || update.isPending

  return (
    <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
      <SheetHeader className="p-0">
        <SheetTitle className="text-xl">{isEditing ? 'Edit member' : 'Invite member'}</SheetTitle>
        <SheetDescription className="text-sm">
          {isEditing ? 'Update this member’s role and permissions.' : 'Invite someone to your organization.'}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6">
        {isEditing ? (
          <div className="space-y-1 rounded-lg border bg-muted/50 p-4">
            <p className="text-sm font-medium">{editingMember?.user.name}</p>
            <p className="text-sm text-muted-foreground">{editingMember?.user.email}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="invite-email" className="text-sm font-medium">
              Email address
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="member@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isProcessing || invitationLink !== null}
              className="h-11"
            />
          </div>
        )}

        {isOwner ? (
          <PermissionSwitches selected={[]} onChange={() => {}} isOwner />
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Role &amp; permissions</Label>
              <RoleCommandSelector
                organizationId={organizationId}
                selectedRole={selectedRole}
                onSelect={handleRoleSelect}
                onCreateNew={handleCreateNew}
                currentPermissions={permissions}
                disabled={isProcessing || invitationLink !== null}
              />
              <p className="text-xs text-muted-foreground">
                Pick a saved role, create a reusable role, or set custom permissions.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Permissions</Label>
              <PermissionSwitches
                selected={permissions}
                onChange={setPermissions}
                disabled={isProcessing || switchesLocked || invitationLink !== null}
              />
              {switchesLocked ? (
                <p className="text-xs italic text-muted-foreground">
                  Permissions are locked while a saved role is selected. Choose “Custom permissions” to edit.
                </p>
              ) : null}
            </div>
          </>
        )}

        {invitationLink ? (
          <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Invitation link</Label>
              <p className="text-xs text-muted-foreground">
                Share this link with the invitee (also emailed when Resend is configured).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input value={invitationLink} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex gap-3 pt-2">
          {invitationLink ? (
            <Button onClick={onClose} className="h-11 flex-1">
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isProcessing} className="h-11 flex-1">
                Cancel
              </Button>
              {isOwner ? null : (
                <Button onClick={handleSave} disabled={isProcessing} className="h-11 flex-1">
                  {isProcessing ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isEditing ? 'Save changes' : 'Invite member'}
                </Button>
              )}
            </>
          )}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </SheetContent>
  )
}
