/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: organizationRouter
 *
 * WHAT:  Business logic + tRPC wiring for the bootstrapping queries the client
 *        calls before it knows which organizationId to pass elsewhere, plus the
 *        create-organization mutation used by onboarding.
 * WHY:   Runs on authProcedure (not protectedProcedure) — protected procedures
 *        require an organizationId input, which is exactly what these resolve /
 *        create. Handler bodies delegate to ctx helpers (active-org precedence,
 *        membership ordering) and to the organization service (org + owner
 *        member creation).
 * WHERE: Backed by ctx helpers wired in src/trpc/init and the organization
 *        service (src/services/organization.service.ts); mounted by
 *        src/trpc/routers/_app.
 */

import { createTRPCRouter } from '../init'
import { authProcedure } from '../procedures'
import { createOrganizationSchema } from '@/lib/types'
import { createOrganizationWithOwner } from '@/services/organization.service'

// authProcedure, not protectedProcedure: this is how the client discovers
// which org to use before it can pass organizationId in inputs — and how a
// brand-new user (zero memberships) creates their first org during onboarding.
export const organizationRouter = createTRPCRouter({
  getActiveOrganization: authProcedure.query(async ({ ctx }) =>
    ctx.getActiveOrganization()
  ),

  getUserOrganizations: authProcedure.query(async ({ ctx }) =>
    ctx.getUserOrganizations()
  ),

  /**
   * SOURCE OF TRUTH KEYWORDS: createOrganization
   *
   * WHAT:  Creates the caller's organization + owner membership and marks the
   *        user onboarded, returning ids the client uses for setActive.
   * WHY:   authProcedure — the caller has no membership yet, so the org-scoped
   *        protectedProcedure can't apply (and there's no audit context until
   *        the org exists). The org + owner-member + onboarding flag commit in
   *        one explicit transaction.
   * WHERE: Called by the onboarding flow; followed client-side by
   *        authClient.organization.setActive.
   */
  createOrganization: authProcedure
    .input(createOrganizationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.$transaction(async (tx) => {
        const result = await createOrganizationWithOwner(tx, {
          userId: ctx.user.id,
          name: input.name,
          logo: input.logo,
        })
        await tx.user.update({
          where: { id: ctx.user.id },
          data: { onboardingComplete: true },
        })
        return result
      })
    }),
})
