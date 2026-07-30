/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ManageRoleSheetContent
 *
 * WHAT:  The "Manage roles" Sheet — lists reusable roles (edit / delete) and a
 *        form to create or edit a role's permissions.
 * WHY:   Reusable roles created here appear in the member sheet's role picker.
 *        Create uses organizationRoles.create; edit uses .update (by roleId);
 *        delete uses .delete (by roleId, blocked while in use).
 * WHERE: Mounted inside a <Sheet> by MemberManager.
 */

import * as React from 'react'
import { Loader2Icon, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PermissionSwitches } from './permission-switches'

export function ManageRoleSheetContent({
  organizationId,
  onClose,
}: {
  organizationId: string
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const rolesQuery = trpc.organizationRoles.list.useQuery({ organizationId })
  const createRole = trpc.organizationRoles.create.useMutation()
  const updateRole = trpc.organizationRoles.update.useMutation()
  const deleteRole = trpc.organizationRoles.delete.useMutation()

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [roleName, setRoleName] = React.useState('')
  const [permissions, setPermissions] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)

  const roles = (rolesQuery.data ?? []).filter((r) => !r.role.startsWith('custom-'))

  function resetForm() {
    setEditingId(null)
    setRoleName('')
    setPermissions([])
    setError(null)
  }

  function startEdit(role: { id: string; role: string; permissions: string[] }) {
    setEditingId(role.id)
    setRoleName(role.role)
    setPermissions(role.permissions)
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    if (!editingId && roleName.trim().length < 2) {
      setError('Role name must be at least 2 characters.')
      return
    }
    if (permissions.length === 0) {
      setError('Select at least one permission.')
      return
    }
    try {
      if (editingId) {
        await updateRole.mutateAsync({ organizationId, roleId: editingId, permissions })
      } else {
        await createRole.mutateAsync({ organizationId, roleName: roleName.trim(), permissions })
      }
      await utils.organizationRoles.list.invalidate({ organizationId })
      toast.success(editingId ? 'Role updated' : 'Role created')
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the role.')
    }
  }

  async function handleDelete(roleId: string) {
    try {
      await deleteRole.mutateAsync({ organizationId, roleId })
      await utils.organizationRoles.list.invalidate({ organizationId })
      toast.success('Role deleted')
      if (editingId === roleId) resetForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the role.')
    }
  }

  const isSaving = createRole.isPending || updateRole.isPending

  return (
    <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-md">
      <SheetHeader className="p-0">
        <SheetTitle className="text-xl">Manage roles</SheetTitle>
        <SheetDescription className="text-sm">
          Create reusable roles with a fixed set of permissions.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Existing roles</Label>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reusable roles yet.</p>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{role.role}</span>
                    <Badge variant="secondary" className="text-xs">
                      {role.permissions.length} perms
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(role)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(role.id)}
                      disabled={deleteRole.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <p className="text-sm font-medium">{editingId ? `Edit “${roleName}”` : 'New role'}</p>
          <div className="space-y-2">
            <Label htmlFor="role-name" className="text-sm font-medium">
              Role name
            </Label>
            <Input
              id="role-name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="editor"
              disabled={Boolean(editingId) || isSaving}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Permissions</Label>
            <PermissionSwitches selected={permissions} onChange={setPermissions} disabled={isSaving} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-3">
            {editingId ? (
              <Button variant="outline" onClick={resetForm} disabled={isSaving} className="h-11 flex-1">
                Cancel edit
              </Button>
            ) : null}
            <Button onClick={handleSubmit} disabled={isSaving} className="h-11 flex-1">
              {isSaving ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Save changes' : 'Create role'}
            </Button>
          </div>
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </SheetContent>
  )
}
