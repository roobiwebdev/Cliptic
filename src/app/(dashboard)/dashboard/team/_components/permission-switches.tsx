/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: PermissionSwitches
 *
 * WHAT:  Registry-driven permission editor — one bordered card per resource
 *        group with a clickable "toggle all" header and a switch per action.
 * WHY:   Groups come from getPermissionGroups (derived from RESOURCES) so the
 *        toggles always match the app's real permissions. Controlled:
 *        `selected` is the source of truth; owners are read-only (full access).
 * WHERE: Used by the member sheet and the manage-role sheet.
 */

import * as React from 'react'
import { InfoIcon } from 'lucide-react'

import { getPermissionGroups } from '@/lib/better-auth/permission-helpers'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const PERMISSION_GROUPS = getPermissionGroups()

export function PermissionSwitches({
  selected,
  onChange,
  isOwner = false,
  disabled = false,
}: {
  selected: string[]
  onChange: (next: string[]) => void
  isOwner?: boolean
  disabled?: boolean
}) {
  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const locked = isOwner || disabled

  const setPermissions = (next: Set<string>) => onChange([...next])

  const toggleOne = (permission: string) => {
    if (locked) return
    const next = new Set(selectedSet)
    if (next.has(permission)) next.delete(permission)
    else next.add(permission)
    setPermissions(next)
  }

  const toggleGroup = (groupPermissions: string[]) => {
    if (locked) return
    const allOn = groupPermissions.every((p) => selectedSet.has(p))
    const next = new Set(selectedSet)
    for (const p of groupPermissions) {
      if (allOn) next.delete(p)
      else next.add(p)
    }
    setPermissions(next)
  }

  return (
    <div className="space-y-4">
      {isOwner ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Organization owners have full access to all permissions and cannot be modified.
          </p>
        </div>
      ) : null}

      {PERMISSION_GROUPS.map((group) => {
        const groupPermissions = group.permissions.map((p) => p.permission)
        const allEnabled = isOwner || groupPermissions.every((p) => selectedSet.has(p))
        return (
          <div key={group.resourceKey} className="rounded-lg border">
            <div
              className={cn(
                'flex items-center justify-between p-4',
                locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              )}
              onClick={() => toggleGroup(groupPermissions)}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-none">{group.resourceName}</p>
                {group.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                ) : null}
              </div>
              <Switch checked={allEnabled} disabled={locked} className="ml-3" />
            </div>

            <Separator />

            <div className="space-y-0 p-4">
              {group.permissions.map(({ permission, action }) => (
                <div
                  key={permission}
                  className={cn(
                    'flex items-center justify-between py-3',
                    locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  )}
                  onClick={() => toggleOne(permission)}
                >
                  <Label className="flex-1 text-sm font-normal capitalize">{action}</Label>
                  <Switch
                    checked={isOwner || selectedSet.has(permission)}
                    disabled={locked}
                    className="ml-3"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
