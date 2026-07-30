/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: RoleCommandSelector, SelectableRole
 *
 * WHAT:  Combobox for choosing a member's role — the built-in Admin preset, a
 *        saved custom role, "Custom permissions" (set switches manually), or
 *        "Create <name>" from the current switches. Saved roles can be deleted.
 * WHY:   Mirrors the funnelmods role picker. Selecting a role only prepares the
 *        member-sheet state (the encoded role is created on save via
 *        processRole); deleting a saved role writes immediately.
 * WHERE: Used by MemberSheetContent.
 */

import * as React from 'react'
import { Check, ChevronDown, Plus, ShieldCheckIcon, Trash2, Loader2Icon } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { getAdminPresetPermissions } from '@/lib/better-auth/permission-helpers'
import { RESERVED_ROLE_NAMES } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

export interface SelectableRole {
  id: string
  role: string
  permissions: string[]
}

function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function roleLabel(role: string): string {
  if (role === 'admin') return 'Admin'
  if (role.startsWith('custom-')) return 'Custom role'
  return role
}

export function RoleCommandSelector({
  organizationId,
  selectedRole,
  onSelect,
  onCreateNew,
  currentPermissions,
  disabled = false,
}: {
  organizationId: string
  selectedRole: SelectableRole | null
  onSelect: (role: SelectableRole | null) => void
  onCreateNew: (roleName: string) => void
  currentPermissions: string[]
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const utils = trpc.useUtils()

  const rolesQuery = trpc.organizationRoles.list.useQuery({ organizationId })
  const deleteRole = trpc.organizationRoles.delete.useMutation({
    onSuccess: async () => {
      await utils.organizationRoles.list.invalidate({ organizationId })
    },
  })

  const roles = rolesQuery.data ?? []
  const savedRoles = roles.filter((r) => !r.role.startsWith('custom-'))
  const adminExists = savedRoles.some((r) => r.role === 'admin')

  const normalized = normalizeRoleName(search)
  const isReserved = RESERVED_ROLE_NAMES.includes(normalized) || normalized === 'admin'
  const isDuplicate = savedRoles.some((r) => r.role === normalized)
  const canCreate =
    normalized.length > 1 && !isReserved && !isDuplicate && currentPermissions.length > 0

  function handleSelectAdmin() {
    onSelect({ id: 'admin', role: 'admin', permissions: getAdminPresetPermissions() })
    setOpen(false)
  }
  function handleSelectSaved(role: SelectableRole) {
    onSelect(role)
    setOpen(false)
  }
  function handleCreate() {
    onCreateNew(normalized)
    setOpen(false)
    setSearch('')
  }

  const displayValue = selectedRole ? roleLabel(selectedRole.role) : 'Custom permissions'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" role="combobox" aria-expanded={open} className="h-11 w-full justify-between" disabled={disabled} />
        }
      >
        <span className="flex items-center gap-2 truncate">
          {selectedRole ? <ShieldCheckIcon className="size-4" /> : null}
          <span className="truncate">{displayValue}</span>
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search roles or create new..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {isReserved ? (
                <span className="text-xs text-destructive">That role name is reserved.</span>
              ) : currentPermissions.length === 0 ? (
                <span className="text-xs text-muted-foreground">Select permissions first to create a role.</span>
              ) : (
                <span className="text-xs text-muted-foreground">No roles found.</span>
              )}
            </CommandEmpty>

            {!adminExists ? (
              <CommandGroup heading="Built-in roles">
                <CommandItem value="admin" onSelect={handleSelectAdmin}>
                  <Check className={cn('mr-2 h-4 w-4', selectedRole?.role === 'admin' ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Admin</p>
                      <Badge variant="secondary" className="text-xs">Built-in</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Full access except billing</p>
                  </div>
                </CommandItem>
              </CommandGroup>
            ) : null}

            <CommandGroup heading="Custom">
              <CommandItem value="custom-permissions" onSelect={() => { onSelect(null); setOpen(false) }}>
                <Check className={cn('mr-2 h-4 w-4', selectedRole === null ? 'opacity-100' : 'opacity-0')} />
                <div className="flex-1">
                  <p className="font-medium">Custom permissions</p>
                  <p className="text-xs text-muted-foreground">Set permissions manually</p>
                </div>
              </CommandItem>
            </CommandGroup>

            {savedRoles.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Saved roles">
                  {savedRoles.map((role) => {
                    const isSelected = selectedRole?.id === role.id
                    const isDeleting = deleteRole.isPending && deleteRole.variables?.roleId === role.id
                    return (
                      <CommandItem key={role.id} value={role.role} onSelect={() => handleSelectSaved(role)} className="group">
                        <Check className={cn('mr-2 h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{roleLabel(role.role)}</p>
                          <p className="text-xs text-muted-foreground">
                            {role.permissions.length} {role.permissions.length === 1 ? 'permission' : 'permissions'}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="ml-2 h-8 w-8 shrink-0 opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                          disabled={isDeleting}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteRole.mutate({ organizationId, roleId: role.id })
                            if (selectedRole?.id === role.id) onSelect(null)
                          }}
                        >
                          {isDeleting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            ) : null}

            {canCreate ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Create new">
                  <CommandItem onSelect={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    <div className="flex-1">
                      <p className="font-medium">Create &quot;{normalized}&quot;</p>
                      <p className="text-xs text-muted-foreground">Save current permissions as a reusable role</p>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
