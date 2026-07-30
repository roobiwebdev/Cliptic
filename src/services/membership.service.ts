/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getUserMemberships
 *
 * WHAT:  Pure Prisma DB access — returns every organization membership a user
 *        belongs to, with the organization row joined in.
 * WHY:   Request-scoped cache() dedupes repeat lookups during one render so
 *        the org-switcher and protected procedures don't double-query. No
 *        business rules live here; this file is a single Prisma read.
 * WHERE: Consumed by org-discovery flows in src/trpc/routers/organization.ts
 *        and anywhere the active-org lookup needs the full membership list.
 */

import { cache } from 'react'
import { prisma } from '@/lib/config'

/**
 * SOURCE OF TRUTH KEYWORDS: getUserMemberships
 *
 * WHAT:  Lists a user's member rows, newest first, with organization included.
 * WHY:   Single read path for "what orgs am I in" — collapsing to one query
 *        keeps org-switcher UI and server-side resolution consistent.
 * WHERE: Used by the organization router's discovery procedures.
 */
export const getUserMemberships = cache(async (userId: string) => {
  return prisma.member.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'desc' },
  })
})
