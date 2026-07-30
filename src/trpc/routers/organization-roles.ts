/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: organizationRolesRouter
 *
 * WHAT:  Custom-role CRUD — list, create, update, delete per-org roles, each a
 *        single OrganizationRole row whose `permission` column stores a JSON
 *        statement map `{ resource: [actions] }`.
 * WHY:   This is the storage the context resolver (src/trpc/init.ts) parses to
 *        grant non-owner members their permissions. Conversions go through the
 *        registry-derived permission-helpers so a role can only hold verbs the
 *        app defines. `owner` is reserved (schema) and never stored here.
 * WHERE: Mounted as `organizationRoles` in src/trpc/routers/_app; consumed by
 *        the role-builder UI on the team page.
 */

import { TRPCError } from '@trpc/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'

import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import { createRoleSchema, updateRoleSchema, deleteRoleSchema } from '@/lib/types'
import {
  permissionsToStatement,
  statementToPermissions,
  type PermissionStatement,
} from '@/lib/better-auth/permission-helpers'

/* Parse the stored JSON statement back to a permission-string list. */
function parsePermissions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return statementToPermissions(parsed as PermissionStatement)
    }
  } catch {
    /* Corrupt row — surface no permissions rather than throwing. */
  }
  return []
}

export const organizationRolesRouter = createTRPCRouter({
  list: protectedProcedure({ requirePermission: permissions.ORGANIZATION_ROLES_READ })
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.organizationRole.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { createdAt: 'asc' },
      })
      return rows.map((row) => ({
        id: row.id,
        role: row.role,
        permissions: parsePermissions(row.permission),
      }))
    }),

  create: protectedProcedure({ requirePermission: permissions.ORGANIZATION_ROLES_CREATE })
    .input(createRoleSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.organizationRole.findFirst({
        where: { organizationId: input.organizationId, role: input.roleName },
        select: { id: true },
      })
      if (existing) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A role with that name already exists' })
      }

      const statement = permissionsToStatement(input.permissions)
      return ctx.db.organizationRole.create({
        data: {
          id: nanoid(),
          organizationId: input.organizationId,
          role: input.roleName,
          permission: JSON.stringify(statement),
        },
      })
    }),

  update: protectedProcedure({ requirePermission: permissions.ORGANIZATION_ROLES_UPDATE })
    .input(updateRoleSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.organizationRole.findFirst({
        where: { id: input.roleId, organizationId: input.organizationId },
        select: { id: true },
      })
      if (!role) throw new TRPCError({ code: 'NOT_FOUND', message: 'Role not found' })

      const statement = permissionsToStatement(input.permissions)
      return ctx.db.organizationRole.update({
        where: { id: role.id },
        data: { permission: JSON.stringify(statement) },
      })
    }),

  delete: protectedProcedure({ requirePermission: permissions.ORGANIZATION_ROLES_DELETE })
    .input(deleteRoleSchema)
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.organizationRole.findFirst({
        where: { id: input.roleId, organizationId: input.organizationId },
        select: { id: true, role: true },
      })
      if (!role) throw new TRPCError({ code: 'NOT_FOUND', message: 'Role not found' })

      /* Block deletion while members still hold the role — they'd be left
       * with an unresolvable role and zero permissions. */
      const inUse = await ctx.db.member.count({
        where: { organizationId: input.organizationId, role: role.role },
      })
      if (inUse > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Reassign the ${inUse} member(s) using this role before deleting it`,
        })
      }

      return ctx.db.organizationRole.delete({ where: { id: role.id } })
    }),
})
