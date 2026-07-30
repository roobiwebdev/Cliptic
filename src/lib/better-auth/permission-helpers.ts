/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PermissionGroup, getPermissionGroups,
 *   permissionsToStatement, statementToPermissions, PermissionStatement
 *
 * WHAT:  Registry-derived helpers for the role builder — groups every
 *        permissioned resource into a UI-friendly list, and converts between a
 *        flat `Permission[]` and the `{ resource: [actions] }` statement map
 *        stored on OrganizationRole.permission.
 * WHY:   The permission toggles and the stored role shape both derive from the
 *        SAME RESOURCES registry, so adding a verb to a resource adds a toggle
 *        and a storable permission with no extra wiring. The statement map is
 *        exactly what src/trpc/init.ts parses back into permission strings.
 * WHERE: getPermissionGroups → permission-switches UI; permissionsToStatement
 *        → organizationRoles.create/update handlers; statementToPermissions →
 *        reading an existing role's permissions for editing.
 */

import {
  RESOURCE_ENTRIES,
  type Permission,
  type ResourceKey,
} from '@/lib/resources'

export interface PermissionGroup {
  resourceKey: ResourceKey
  resourceName: string
  description: string
  permissions: { permission: Permission; action: string }[]
}

/** The JSON map shape stored in OrganizationRole.permission. */
export type PermissionStatement = Record<string, string[]>

/**
 * SOURCE OF TRUTH KEYWORDS: getPermissionGroups
 *
 * WHAT:  One group per permissioned resource, each listing its `resource:action`
 *        permissions with the bare action label + the resource description.
 * WHERE: Rendered by the permission-switches component in the role builder.
 */
export function getPermissionGroups(): PermissionGroup[] {
  const groups: PermissionGroup[] = []
  for (const [key, def] of RESOURCE_ENTRIES) {
    if (!def.permissions || def.permissions.length === 0) continue
    groups.push({
      resourceKey: key,
      resourceName: def.name,
      description: def.description ?? '',
      permissions: def.permissions.map((action) => ({
        /* `${key}:${action}` is a Permission by construction; RESOURCE_ENTRIES
         * is widened to the base ResourceDefinition so TS only sees string. */
        permission: `${key}:${action}` as Permission,
        action,
      })),
    })
  }
  return groups
}

/**
 * SOURCE OF TRUTH KEYWORDS: getAdminPresetPermissions, ADMIN_PRESET_EXCLUDED
 *
 * WHAT:  The "admin" preset — every declared permission except billing (an
 *        admin manages the team/app but not payments).
 * WHY:   Pre-selected when inviting/creating an admin role, mirroring the
 *        funnelmods default. Derived from the registry so new resources are
 *        included automatically.
 * WHERE: member sheet (invite default) + role-command-selector admin preset.
 */
const ADMIN_PRESET_EXCLUDED: readonly string[] = ['billing']

export function getAdminPresetPermissions(): string[] {
  const perms: string[] = []
  for (const group of getPermissionGroups()) {
    if (ADMIN_PRESET_EXCLUDED.includes(group.resourceKey)) continue
    for (const { permission } of group.permissions) perms.push(permission)
  }
  return perms
}

/**
 * SOURCE OF TRUTH KEYWORDS: permissionsToStatement
 *
 * WHAT:  Folds a flat `Permission[]` into a `{ resource: [actions] }` map for
 *        storage on OrganizationRole.permission.
 * WHERE: Called by organizationRoles.create / .update before persisting.
 */
export function permissionsToStatement(perms: readonly string[]): PermissionStatement {
  const statement: PermissionStatement = {}
  for (const perm of perms) {
    const [resource, action] = perm.split(':')
    if (!resource || !action) continue
    const existing = statement[resource]
    if (existing) {
      if (!existing.includes(action)) existing.push(action)
    } else {
      statement[resource] = [action]
    }
  }
  return statement
}

/**
 * SOURCE OF TRUTH KEYWORDS: statementToPermissions
 *
 * WHAT:  Flattens a stored statement map back into permission strings.
 * WHY:   Lets the role-edit UI pre-tick the toggles for an existing role; the
 *        toggles compare against the typed permission keys from
 *        getPermissionGroups, and every Permission is a string so the compare
 *        is sound without a cast.
 * WHERE: Called when loading a role into the builder.
 */
export function statementToPermissions(statement: PermissionStatement): string[] {
  const out: string[] = []
  for (const [resource, actions] of Object.entries(statement)) {
    if (!Array.isArray(actions)) continue
    for (const action of actions) {
      out.push(`${resource}:${action}`)
    }
  }
  return out
}
