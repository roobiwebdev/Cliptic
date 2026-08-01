/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: userRouter, getProfile, deleteAccount
 *
 * WHAT:  Current-user profile read plus permanent account deletion.
 * WHY:   Both run on authProcedure (identity, no org scope). deleteAccount
 *        removes the organizations the user owns (not a User relation, so they
 *        need explicit deletion) and then the user row, whose cascades clear
 *        sessions/accounts/memberships/clip jobs — all inside one transaction so
 *        a partial failure rolls back.
 * WHERE: Mounted as `user` in src/trpc/routers/_app; consumed by NavUser and the
 *        account settings page.
 */

import { createTRPCRouter } from '../init'
import { authProcedure } from '../procedures'
import * as userService from '@/services/user.service'

export const userRouter = createTRPCRouter({
  getProfile: authProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    image: ctx.user.image ?? null,
  })),

  /* Permanently delete the signed-in user + every organization they own, and
   * everything hanging off both (cascades). The client signs out after. */
  deleteAccount: authProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id
    await ctx.prisma.$transaction(async (tx) => {
      const ownedOrganizationIds = await userService.getOwnedOrganizationIds(tx, userId)
      await userService.deleteOrganizations(tx, ownedOrganizationIds)
      await userService.deleteUserById(tx, userId)
    })
    return { success: true as const }
  }),
})
