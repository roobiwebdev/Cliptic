/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: auditLogsRouter, AUTO_DERIVED_FROM_RESOURCES
 *
 * WHAT:  tRPC wiring for the audit-log reader exposed to the dashboard.
 * WHY:   Permission is per-member RBAC and declared here. The plan-tier flag
 *        is NOT declared here on purpose: it's AUTO_DERIVED_FROM_RESOURCES
 *        because the `auditLogs` registry entry carries a `flag`. The
 *        procedure factory enforces it for every verb on this resource —
 *        forgetting to wire `requireFlag` is no longer a class of bug that
 *        can exist. `paginate: true` delegates page/size clamping to the
 *        factory.
 * WHERE: Calls getOrganizationAuditLogs in src/services/activity-log.service;
 *        mounted by src/trpc/routers/_app. Flag definition lives at
 *        src/lib/resources.ts (`auditLogs.flag`).
 */

import { z } from 'zod'
import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import { getOrganizationAuditLogs } from '@/services/activity-log.service'

/* `page` / `pageSize` are read by the procedure factory from rawInput; the
 * factory owns clamping and default values. Declaring them here (without
 * .default / .max) keeps the input schema documentary while leaving a single
 * source of truth for the math in `paginate: true`. */
const listAuditLogsSchema = z.object({
  organizationId: z.string(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  userId: z.string().optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
  search: z.string().optional(),
})

export const auditLogsRouter = createTRPCRouter({
  list: protectedProcedure({
    requirePermission: permissions.AUDIT_LOGS_READ,
    paginate: true,
  })
    .input(listAuditLogsSchema)
    .query(async ({ ctx, input }) => {
      const { skip, take } = ctx.pagination
      return getOrganizationAuditLogs(
        {
          organizationId: input.organizationId,
          action: input.action,
          entity: input.entity,
          userId: input.userId,
          fromDate: input.fromDate,
          toDate: input.toDate,
          search: input.search,
        },
        skip,
        take
      )
    }),
})
