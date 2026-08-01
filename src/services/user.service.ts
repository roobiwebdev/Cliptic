/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getOwnedOrganizationIds, deleteOrganizations,
 *   deleteUserById, OWNER_ROLES
 *
 * WHAT:  Pure Prisma writes/reads for permanent account deletion — the org IDs
 *        a user owns, an org bulk-delete, and a user delete.
 * WHY:   Deleting the user row cascades sessions/accounts/members/clipJobs (see
 *        schema onDelete: Cascade), but organizations the user OWNS are not a
 *        User relation, so they must be removed explicitly first. No business
 *        logic / no transaction here — the router orchestrates that.
 * WHERE: Consumed by user.deleteAccount in src/trpc/routers/user.ts.
 */

import 'server-only'
import type { DbClient } from '@/lib/config/prisma'

/* Roles that own an organization (mirrors OWNER_ROLES in the member router). */
const OWNER_ROLES = ['owner', 'client-owner']

export async function getOwnedOrganizationIds(db: DbClient, userId: string): Promise<string[]> {
  const rows = await db.member.findMany({
    where: { userId, role: { in: OWNER_ROLES } },
    select: { organizationId: true },
  })
  return rows.map((row) => row.organizationId)
}

export async function deleteOrganizations(db: DbClient, organizationIds: string[]): Promise<void> {
  if (organizationIds.length === 0) return
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } })
}

export async function deleteUserById(db: DbClient, userId: string): Promise<void> {
  await db.user.delete({ where: { id: userId } })
}
