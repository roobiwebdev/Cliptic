/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: MemberList
 *
 * WHAT:  The list of team members + pending invitations. Each row shows an
 *        avatar, name/email, a role/status badge, and a `⋯` menu (edit/remove
 *        for members; resend/cancel for pending invites). Destructive actions
 *        confirm via an AlertDialog.
 * WHY:   Actions are permission-gated (owners always pass). Resend/cancel call
 *        the invitation router; remove is delegated to the parent (optimistic).
 * WHERE: Left column of MemberManager.
 */

import * as React from 'react'
import { MoreHorizontalIcon, Loader2Icon, RefreshCw, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { memberInitials } from './ownership-card'
import type { OrganizationMember } from './member-types'

export function MemberList({
  organizationId,
  members,
  onEditMember,
  onRemoveMember,
}: {
  organizationId: string
  members: OrganizationMember[]
  onEditMember: (member: OrganizationMember) => void
  onRemoveMember: (memberId: string) => void
}) {
  const { hasPermission } = useActiveOrganization()
  const utils = trpc.useUtils()

  const canUpdate = hasPermission(permissions.MEMBER_UPDATE)
  const canDelete = hasPermission(permissions.MEMBER_DELETE)
  const canCancel = hasPermission(permissions.INVITATION_CANCEL)
  const canResend = hasPermission(permissions.INVITATION_CREATE)

  const [removeTarget, setRemoveTarget] = React.useState<OrganizationMember | null>(null)
  const [cancelTarget, setCancelTarget] = React.useState<OrganizationMember | null>(null)
  const [processingInviteId, setProcessingInviteId] = React.useState<string | null>(null)

  const resend = trpc.invitation.resend.useMutation()
  const cancel = trpc.invitation.cancel.useMutation()

  async function handleResend(invitationId: string) {
    setProcessingInviteId(invitationId)
    try {
      await resend.mutateAsync({ organizationId, invitationId })
      toast.success('Invitation resent')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation')
    } finally {
      setProcessingInviteId(null)
    }
  }

  async function confirmCancel() {
    if (!cancelTarget?.invitationId) return
    const invitationId = cancelTarget.invitationId
    setCancelTarget(null)
    setProcessingInviteId(invitationId)
    try {
      await cancel.mutateAsync({ organizationId, invitationId })
      await Promise.all([
        utils.member.list.invalidate({ organizationId }),
        utils.usage.getFeatureGates.invalidate({ organizationId }),
      ])
      toast.success('Invitation canceled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel invitation')
    } finally {
      setProcessingInviteId(null)
    }
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No members found</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {members.map((member) => {
          const isPending = member.isPending
          const processing = member.invitationId !== null && processingInviteId === member.invitationId
          const showMenu = isPending ? canResend || canCancel : canUpdate || canDelete
          return (
            <div
              key={member.id}
              className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar className="size-10 shrink-0">
                  {member.user.image ? <AvatarImage src={member.user.image} alt={member.user.name} /> : null}
                  <AvatarFallback>{memberInitials(member.user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {isPending ? (
                  <>
                    {member.roleName ? (
                      <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
                        {member.roleName}
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Pending
                    </Badge>
                  </>
                ) : member.roleName ? (
                  <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
                    {member.roleName}
                  </Badge>
                ) : member.permissions.length > 0 ? (
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    {member.permissions.length}{' '}
                    {member.permissions.length === 1 ? 'permission' : 'permissions'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    No permissions
                  </Badge>
                )}

                {showMenu ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={processing} />}
                    >
                      {processing ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontalIcon className="h-4 w-4" />
                      )}
                      <span className="sr-only">Open menu</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isPending ? (
                        <>
                          {canResend ? (
                            <DropdownMenuItem
                              onClick={() => member.invitationId && handleResend(member.invitationId)}
                              disabled={processing}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Resend invitation
                            </DropdownMenuItem>
                          ) : null}
                          {canCancel ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setCancelTarget(member)}
                            >
                              Cancel invitation
                            </DropdownMenuItem>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {canUpdate ? (
                            <DropdownMenuItem onClick={() => onEditMember(member)}>
                              Edit permissions
                            </DropdownMenuItem>
                          ) : null}
                          {canDelete ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRemoveTarget(member)}
                            >
                              Remove member
                            </DropdownMenuItem>
                          ) : null}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{removeTarget?.user.name}</strong> ({removeTarget?.user.email}) from your
              organization? They lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeTarget) onRemoveMember(removeTarget.id)
                setRemoveTarget(null)
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel the invitation for <strong>{cancelTarget?.user.email}</strong>? They will no longer be
              able to accept it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep invitation</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmCancel}
            >
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
