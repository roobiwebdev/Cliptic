/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: memberRouter, OrganizationMember
 *
 * WHAT:  Team-member management — list (members + pending invitations merged
 *        into one array), change a member's role/permissions, and remove a
 *        member.
 * WHY:   Built on protectedProcedure so auth, org-scoping, permission gates,
 *        audit, and tx are automatic. `list` returns ONE array (with an
 *        `isPending` flag) so the team UI renders members and invites uniformly.
 *        `update` accepts the encoded role string and decodes it via processRole
 *        (creating the role row if needed). `member.delete` auto-decrements the
 *        `member` seat counter via the factory. Owners + the caller's own row
 *        are protected.
 * WHERE: Mounted as `member` in src/trpc/routers/_app.
 */

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import { updateMemberSchema, removeMemberSchema } from '@/lib/types'
import {
  processRole,
  roleDisplayName,
  getRolePermissionMap,
} from '@/services/role.service'

const OWNER_ROLES = ['owner', 'client-owner']

export const memberRouter = createTRPCRouter({
  /* Members + pending invitations as one list; each carries isPending, the
   * display roleName, and the flattened permissions. */
  list: protectedProcedure({ requirePermission: permissions.MEMBER_READ })
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [members, invitations, roleMap] = await Promise.all([
        ctx.db.member.findMany({
          where: { organizationId: input.organizationId },
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        ctx.db.invitation.findMany({
          where: { organizationId: input.organizationId },
          orderBy: { createdAt: 'desc' },
        }),
        getRolePermissionMap(ctx.db, input.organizationId),
      ])

      const enrichedMembers = members.map((m) => {
        const isOwner = OWNER_ROLES.includes(m.role)
        return {
          id: m.id,
          user: { name: m.user.name, email: m.user.email, image: m.user.image },
          role: m.role,
          isPending: false,
          permissions: isOwner ? [] : roleMap.get(m.role) ?? [],
          roleName: isOwner ? 'owner' : roleDisplayName(m.role),
          invitationId: null as string | null,
        }
      })

      const pendingMembers = invitations.map((inv) => ({
        id: inv.id,
        user: {
          name: inv.email.split('@')[0] ?? inv.email,
          email: inv.email,
          image: null as string | null,
        },
        role: inv.role ?? 'member',
        isPending: true,
        permissions: [] as string[],
        roleName: roleDisplayName(inv.role ?? 'member'),
        invitationId: inv.id,
      }))

      return [...enrichedMembers, ...pendingMembers]
    }),

  /* Reassign a member's role. Owner rows and the caller's own row are locked. */
  update: protectedProcedure({ requirePermission: permissions.MEMBER_UPDATE })
    .input(updateMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.member.findFirst({
        where: { id: input.memberId, organizationId: input.organizationId },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })
      if (OWNER_ROLES.includes(member.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'The owner role cannot be changed' })
      }
      if (member.userId === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot change your own role' })
      }

      const role = await processRole(ctx.db, input.organizationId, input.role)
      return ctx.db.member.update({ where: { id: member.id }, data: { role } })
    }),

  /* Remove a member. Factory auto-decrements the `member` seat counter. */
  delete: protectedProcedure({ requirePermission: permissions.MEMBER_DELETE })
    .input(removeMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.member.findFirst({
        where: { id: input.memberId, organizationId: input.organizationId },
      })
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' })
      if (OWNER_ROLES.includes(member.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'The owner cannot be removed' })
      }
      if (member.userId === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot remove yourself' })
      }

      return ctx.db.member.delete({ where: { id: member.id } })
    }),
})
