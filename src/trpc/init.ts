/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: createTRPCContext, Context, createStructuredError,
 *   createTRPCRouter, baseProcedure, authProcedure, protectedProcedure
 *
 * WHAT:  tRPC request-context factory plus the sole sanctioned error-throw helper
 *        for procedures, and the re-export surface for the procedure factories.
 * WHY:   Wrapping context in React `cache()` gives every Server Component and
 *        procedure in a single request one shared auth lookup and Prisma pool
 *        slot; lazy auth resolution keeps static rendering legal.
 * WHERE: Imported by src/trpc/server.tsx, src/trpc/routers/*, src/app/api/trpc/*,
 *        and src/trpc/procedures/protected.ts (for the `Context` type). Depends
 *        on src/lib/better-auth/auth.ts, src/services/membership.service.ts,
 *        and src/lib/config (prisma).
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { TRPCError } from '@trpc/server'
import { prisma } from '@/lib/config'
import { getCachedSession } from '@/lib/better-auth/auth'
import type { Session, User } from '@/lib/better-auth/auth'
import type { StructuredErrorCause } from '@/lib/errors'

/**
 * SOURCE OF TRUTH KEYWORDS: createTRPCContext, Context
 *
 * WHAT:  Builds the per-request tRPC context (prisma, session, user, lazy org resolvers).
 * WHY:   `cache()` dedupes auth + membership lookups within a request so the Prisma
 *        pool isn't exhausted (P2024) under fanned-out Server Component prefetches;
 *        auth resolution is deferred because `cookies()` is illegal during static render.
 * WHERE: Consumed by src/trpc/server.tsx (`trpc` proxy) and src/app/api/trpc/[trpc]/route.ts.
 */
/* Wrapped in `cache()` so every Server Component / procedure in the same
 * request shares one context, one auth lookup, one membership query. Without
 * it the Prisma pool gets exhausted under load (P2024). */
export const createTRPCContext = cache(async () => {
  /* Awaited up front so request-scoped headers (proxy.ts stamps) are
   * accessible from any lazy resolver below. */
  await headers()

  let user: User | null = null
  let session: Session | null = null
  let authResolved = false

  /* Auth resolution is LAZY: `auth.api.getSession()` calls `cookies()` which
   * is illegal during static rendering. `baseProcedure` skips it; only
   * `authProcedure`/`protectedProcedure` trigger it. */
  const resolveAuth = cache(async () => {
    if (authResolved) return
    const fullSession = await getCachedSession()
    session = fullSession
    if (fullSession?.user) user = fullSession.user
    authResolved = true
  })

  const getUserOrganizationsLazy = cache(async () => {
    if (!user?.id) return []
    const { getUserMemberships } = await import('@/services/membership.service')
    const memberships = await getUserMemberships(user.id)
    if (!memberships.length) return []

    return Promise.all(
      memberships.map(async (m) => {
        /* Owners get a sentinel empty array — protectedProcedure treats that
         * as "full access" and skips fine-grained checks. */
        if (m.role === 'owner') {
          return {
            id: m.organization.id,
            name: m.organization.name,
            slug: m.organization.slug,
            logo: m.organization.logo,
            role: m.role,
            permissions: [] as string[],
            createdAt: m.createdAt,
          }
        }

        const organizationRole = await prisma.organizationRole.findFirst({
          where: { organizationId: m.organizationId, role: m.role },
          select: { permission: true },
        })

        const permissions: string[] = []
        /* OrganizationRole.permission is a String column storing a JSON map
         * `{ resource: [actions] }` (written by the organizationRoles router).
         * Parse it before flattening — a bare string never satisfies the
         * object guard, so skipping the parse would silently grant nobody. */
        let permObj: unknown = null
        const permRaw = organizationRole?.permission
        if (typeof permRaw === 'string' && permRaw.length > 0) {
          try {
            permObj = JSON.parse(permRaw)
          } catch {
            permObj = null
          }
        }
        if (permObj && typeof permObj === 'object' && !Array.isArray(permObj)) {
          for (const [resource, actions] of Object.entries(permObj)) {
            /* Skip Better Auth meta-resources — they're internal to the AC
             * layer, not app-level features. */
            if (Array.isArray(actions) && resource !== 'organization' && resource !== 'ac') {
              for (const action of actions) {
                if (typeof action === 'string') permissions.push(`${resource}:${action}`)
              }
            }
          }
        }

        return {
          id: m.organization.id,
          name: m.organization.name,
          slug: m.organization.slug,
          logo: m.organization.logo,
          role: m.role,
          permissions,
          createdAt: m.createdAt,
        }
      })
    )
  })

  /* Active-org resolution: session.activeOrganizationId → first owner → first
   * membership. Add custom-domain or query-param overrides above the session
   * branch when the app needs them. */
  const getActiveOrganizationLazy = cache(async () => {
    const organizations = await getUserOrganizationsLazy()
    if (!organizations.length) return null

    const activeOrgId = session?.session.activeOrganizationId ?? null
    if (activeOrgId) {
      const match = organizations.find((org) => org.id === activeOrgId)
      if (match) return match
    }

    return organizations.find((org) => org.role === 'owner') || organizations[0]
  })

  return {
    prisma,
    get session() { return session },
    get user() { return user },
    resolveAuth,
    getUserOrganizations: getUserOrganizationsLazy,
    getActiveOrganization: getActiveOrganizationLazy,
  }
})

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * SOURCE OF TRUTH KEYWORDS: createStructuredError
 *
 * WHAT:  Builds a `TRPCError` whose `cause` is a typed `StructuredErrorCause`.
 * WHY:   Clients read structured fields (errorCode, upgradeRequired, retryAfter, ...)
 *        off `error.data.cause`; raw `throw new TRPCError({...})` loses that shape.
 * WHERE: Used by src/trpc/procedures/protected.ts for every gate failure and by
 *        routers/services that need to surface domain errors to the client.
 */
export function createStructuredError(
  code:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'PRECONDITION_FAILED'
    | 'BAD_REQUEST'
    | 'NOT_FOUND'
    | 'INTERNAL_SERVER_ERROR',
  message: string,
  cause: StructuredErrorCause
): TRPCError {
  return new TRPCError({ code, message, cause })
}

/**
 * SOURCE OF TRUTH KEYWORDS: createTRPCRouter, baseProcedure, authProcedure,
 *   protectedProcedure
 *
 * WHAT:  Re-exports the router builder and procedure factories from the procedures barrel.
 * WHY:   Routers import their entire toolkit from `@/trpc/init`, keeping the
 *        procedures module a private implementation detail.
 * WHERE: Imported by every file in src/trpc/routers/*.
 */
export { router as createTRPCRouter } from './procedures'
export { baseProcedure, authProcedure, protectedProcedure } from './procedures'
