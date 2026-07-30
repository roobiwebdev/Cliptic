/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: processRole, resolveRoleName, roleDisplayName,
 *   getRolePermissionMap, parseRolePermissions
 *
 * WHAT:  Decodes the encoded `role` string the member sheet sends into a
 *        concrete OrganizationRole name, creating the role row on demand.
 * WHY:   The member sheet can send three things: a plain existing role name,
 *        `"<name>|||<JSON perms>"` (a named/admin role to create+assign), or a
 *        bare `"<JSON perms>"` (per-member custom permissions → a stable
 *        `custom-<hash>` role). Centralizing the decode here keeps the routers
 *        thin and matches the funnelmods team behavior. Roles are scoped by
 *        organizationId, so names aren't org-prefixed. Storage is the JSON
 *        statement map read by src/trpc/init.ts.
 * WHERE: Called by invitation.create and member.update; permission helpers used
 *        for the statement map. Pure DB access via the passed `db`.
 */

import type { DbClient } from '@/lib/config/prisma'
import { permissionsToStatement, statementToPermissions } from '@/lib/better-auth/permission-helpers'

/* Normalizes a display name to a stable role key. */
function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

/* Stable short hash of a permission set → the `custom-<hash>` role name, so the
 * same custom permission set reuses one role row instead of piling up. */
function customRoleName(permissions: string[]): string {
  const sorted = [...permissions].sort()
  const hash = Buffer.from(sorted.join(',')).toString('base64').slice(0, 8)
  return `custom-${hash}`.toLowerCase()
}

/* Creates the role row if (org, role) doesn't exist yet. */
async function ensureRole(
  db: DbClient,
  organizationId: string,
  role: string,
  permissions: string[]
): Promise<void> {
  const existing = await db.organizationRole.findFirst({
    where: { organizationId, role },
    select: { id: true },
  })
  if (existing) return
  await db.organizationRole.create({
    data: {
      id: crypto.randomUUID(),
      organizationId,
      role,
      permission: JSON.stringify(permissionsToStatement(permissions)),
    },
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: processRole
 *
 * WHAT:  Resolves the encoded role string to a stored role name (creating the
 *        role when needed) and returns that name for Member.role / Invitation.role.
 * WHERE: invitation.create, member.update.
 */
export async function processRole(
  db: DbClient,
  organizationId: string,
  role: string
): Promise<string> {
  if (role === 'owner') return 'owner'

  /* Named role with embedded permissions: "<name>|||<JSON perms>". */
  if (role.includes('|||') && role.includes('[')) {
    const separatorIndex = role.indexOf('|||')
    const namePart = role.slice(0, separatorIndex)
    const permsPart = role.slice(separatorIndex + 3)
    const permissions = safeParsePermissions(permsPart)
    const roleName = normalizeRoleName(namePart)
    await ensureRole(db, organizationId, roleName, permissions)
    return roleName
  }

  /* Bare permission array → per-member custom role. */
  if (role.startsWith('[')) {
    const permissions = safeParsePermissions(role)
    const roleName = customRoleName(permissions)
    await ensureRole(db, organizationId, roleName, permissions)
    return roleName
  }

  /* Plain, already-existing role name. */
  return role
}

function safeParsePermissions(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === 'string')
  } catch {
    /* fall through */
  }
  return []
}

/**
 * SOURCE OF TRUTH KEYWORDS: roleDisplayName
 *
 * WHAT:  The label shown for a role: '' for auto-generated custom roles (the UI
 *        shows a permission count instead), otherwise the role name.
 * WHERE: member.list enrichment.
 */
export function roleDisplayName(role: string): string {
  if (role === 'owner') return 'owner'
  if (role.startsWith('custom-')) return ''
  return role
}

/**
 * SOURCE OF TRUTH KEYWORDS: getRolePermissionMap
 *
 * WHAT:  Loads all OrganizationRole rows for an org into a role → permission
 *        strings map (parsed from the stored JSON statement).
 * WHY:   member.list needs each member's permissions; one query + a map avoids
 *        N lookups.
 * WHERE: member.list.
 */
export async function getRolePermissionMap(
  db: DbClient,
  organizationId: string
): Promise<Map<string, string[]>> {
  const rows = await db.organizationRole.findMany({
    where: { organizationId },
    select: { role: true, permission: true },
  })
  const map = new Map<string, string[]>()
  for (const row of rows) {
    map.set(row.role, parseRolePermissions(row.permission))
  }
  return map
}

/**
 * SOURCE OF TRUTH KEYWORDS: parseRolePermissions
 *
 * WHAT:  Parses a stored permission JSON string into a `resource:action[]` list.
 * WHERE: getRolePermissionMap and the organizationRoles list.
 */
export function parseRolePermissions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return statementToPermissions(parsed as Record<string, string[]>)
    }
  } catch {
    /* corrupt row — no permissions */
  }
  return []
}
