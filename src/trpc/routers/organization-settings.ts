/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: organizationSettingsRouter
 *
 * WHAT:  Read + update org-wide settings (name, logo).
 * WHY:   protectedProcedure gives auth + organizationSettings:* permission
 *        gates + audit. The audit entity is overridden to 'organization' to
 *        match the registry's stated intent (RESOURCES.organizationSettings.
 *        audit.entity).
 * WHERE: Mounted as `organizationSettings` in src/trpc/routers/_app; consumed
 *        by the organization settings page.
 */

import { z } from 'zod'

import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import { updateOrganizationSettingsSchema } from '@/lib/types'

export const organizationSettingsRouter = createTRPCRouter({
  get: protectedProcedure({ requirePermission: permissions.ORGANIZATION_SETTINGS_READ })
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, name: true, slug: true, logo: true },
      })
    }),

  update: protectedProcedure({
    requirePermission: permissions.ORGANIZATION_SETTINGS_UPDATE,
    audit: { entity: 'organization', action: 'update' },
  })
    .input(updateOrganizationSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.organization.update({
        where: { id: input.organizationId },
        data: {
          name: input.name,
          /* '' clears the logo; undefined leaves it unchanged. */
          ...(input.logo !== undefined ? { logo: input.logo === '' ? null : input.logo } : {}),
        },
        select: { id: true, name: true, slug: true, logo: true },
      })
    }),
})
