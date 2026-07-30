/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: TRPCReactProvider, trpc, MUTATION_RESOURCE_MAP,
 *   FeatureGateMutationObserver, PendingMutation, AuthRedirectObserver
 *
 * WHAT:  Client-side tRPC entry — exposes the `trpc` React hooks, mounts the
 *        provider tree, and runs two cache observers: the optimistic
 *        feature-gate counter observer and the AuthRedirectObserver that
 *        bounces the user to the sign-in route whenever any tRPC call
 *        surfaces `UNAUTHORIZED`.
 * WHY:   Optimistic +1/-1 on `usage.getFeatureGates` cache during a mutation's
 *        pending phase prevents fast-clicks from squeaking past plan limits
 *        during the round-trip; rollback on error keeps cache honest, success
 *        needs no reconcile because the server auto-bump matches the
 *        convention exactly. The auth redirect lives at this layout level
 *        (not per-page) so any unauthenticated request — whether from a root
 *        page, a dashboard, or a mutation triggered by a click — funnels
 *        through one well-known handler instead of every page re-implementing
 *        its own `redirect(...)`.
 * WHERE: Mounted in src/app/layout.tsx. Reads RESOURCES mappings via
 *        src/lib/resources.ts (`getMutationFeatureMap`), the FeatureGatesData
 *        shape from src/components/feature-gate.tsx, and AUTH_ROUTES from
 *        src/lib/config/auth-routes.ts.
 */

'use client'

import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, splitLink, httpSubscriptionLink } from '@trpc/client'
import { TRPCClientError } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import superjson from 'superjson'
import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { makeQueryClient } from './tanstack-config'
import type { AppRouter } from './routers/_app'
import { getMutationFeatureMap, isResourceKey, type LimitResourceKey } from '@/lib/resources'
import type { FeatureGatesData } from '@/components/feature-gate'
import { AUTH_ROUTES } from '@/lib/config/auth-routes'
import { ROUTES } from '@/lib/config/routes'
import { ERROR_CODES } from '@/lib/errors'

interface PendingMutation {
  resource: LimitResourceKey
  countChange: number
}

/**
 * SOURCE OF TRUTH KEYWORDS: MUTATION_RESOURCE_MAP
 *
 * WHAT:  Procedure-path → `{ resource, operation }` lookup derived from RESOURCES.
 * WHY:   Built once at module load so the mutation observer doesn't re-walk the
 *        resource registry on every cache event.
 * WHERE: Consumed by `getMutationMapping` below; populated from
 *        `getMutationFeatureMap()` in src/lib/resources.ts.
 */
/* Built once at module load from RESOURCES; avoids re-walking on every event. */
const MUTATION_RESOURCE_MAP = getMutationFeatureMap()

function getMutationMapping(mutationKey: unknown) {
  if (!Array.isArray(mutationKey)) return null
  const procedurePath = mutationKey[0]
  if (!Array.isArray(procedurePath)) return null
  return MUTATION_RESOURCE_MAP[procedurePath.join('.')] ?? null
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  if (process.env['VERCEL_URL']) return `https://${process.env['VERCEL_URL']}`
  if (process.env['NEXT_PUBLIC_APP_URL']) return process.env['NEXT_PUBLIC_APP_URL']
  return 'http://localhost:3000'
}

/**
 * SOURCE OF TRUTH KEYWORDS: trpc
 *
 * WHAT:  The React-Query-bound tRPC hooks object typed against `AppRouter`.
 * WHY:   Single source of `useQuery` / `useMutation` / `useSubscription` hooks
 *        for the whole client app so router type changes propagate everywhere.
 * WHERE: Imported by every client component that calls tRPC.
 */
export const trpc = createTRPCReact<AppRouter>()

/* Browser singleton — lazy so SSR doesn't try to construct during module load. */
let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

/**
 * SOURCE OF TRUTH KEYWORDS: TRPCReactProvider
 *
 * WHAT:  Root client-side provider that wires QueryClient + tRPC links + the
 *        feature-gate observer into the React tree.
 * WHY:   `splitLink` routes subscriptions to SSE (auto-reconnect via `tracked()`)
 *        while batching queries/mutations over HTTP, and a singleton browser
 *        QueryClient survives Fast Refresh and route navigations.
 * WHERE: Mounted in src/app/layout.tsx.
 */
export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          /* Subscriptions → SSE (one-way streams with auto-reconnect via
           * tRPC `tracked()`); queries/mutations → batched HTTP. */
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            eventSourceOptions: () => ({ withCredentials: true }),
            /* Forces the connection-params handshake so tRPC's
             * reconnect-with-backoff activates. */
            connectionParams: async () => ({}),
          }),
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            transformer: superjson,
            fetch(url, options) {
              /* tRPC types `signal: AbortSignal | undefined` but the DOM
               * `RequestInit` types it as `... | null` under
               * `exactOptionalPropertyTypes`. Rebuild a clean RequestInit
               * with `credentials: 'include'` for cookie forwarding; spread
               * to forward future tRPC additions (cache, priority, ...). */
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DOM RequestInit boundary, see comment.
              const init: RequestInit = { ...(options as any), credentials: 'include' }
              return fetch(url, init)
            },
          }),
        }),
      ],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <FeatureGateMutationObserver queryClient={queryClient} />
        <AuthRedirectObserver queryClient={queryClient} />
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  )
}

/**
 * SOURCE OF TRUTH KEYWORDS: FeatureGateMutationObserver
 *
 * WHAT:  Subscribes to the mutation cache and applies optimistic +1/-1 deltas
 *        to every cached `usage.getFeatureGates` query during a mutation's
 *        pending phase, rolling back on error.
 * WHY:   Closes the race window where a fast-clicking user could fire two
 *        creates back-to-back and beat the server's counter bump; success needs
 *        no reconcile because the server's auto-bump matches the same delta.
 * WHERE: Mounted once inside `TRPCReactProvider`; reads MUTATION_RESOURCE_MAP.
 */
/* Optimistic counter updates: bumps the cached `usage.getFeatureGates` data
 * on mutation START so a fast-click can't squeak past the limit during the
 * round-trip. Rolls back on error/idle; success needs no reconcile because
 * the server's auto-bump matches the +1/-1 convention exactly. */
function FeatureGateMutationObserver({ queryClient }: { queryClient: QueryClient }) {
  /* Ref so the map survives re-renders WITHOUT triggering them. */
  const pendingMutationsRef = useRef<Map<number, PendingMutation>>(new Map())

  useEffect(() => {
    const pendingMutations = pendingMutationsRef.current

    /* Two key shapes seen in the wild: nested array
     * `[['usage','getFeatureGates'], {input}]` and flat-string legacy.
     * Cover both, fail closed on anything else. */
    const isFeatureGatesQuery = (queryKey: unknown): boolean => {
      try {
        if (!Array.isArray(queryKey) || queryKey.length === 0) return false
        const firstPart = queryKey[0]
        if (Array.isArray(firstPart)) {
          return firstPart.some(
            (part) => typeof part === 'string' && part.includes('getFeatureGates')
          )
        }
        if (typeof firstPart === 'string') return firstPart.includes('getFeatureGates')
        return false
      } catch {
        return false
      }
    }

    const updateFeatureGateCache = (resourceKey: string, countChange: number): boolean => {
      if (!resourceKey || countChange === 0) return false
      let updated = false

      try {
        for (const query of queryClient.getQueryCache().getAll()) {
          if (!isFeatureGatesQuery(query.queryKey)) continue

          queryClient.setQueryData<FeatureGatesData>(query.queryKey, (oldData) => {
            /* Defensive: leave malformed cache entries alone. */
            if (!oldData || typeof oldData !== 'object') return oldData
            if (!oldData.gates || typeof oldData.gates !== 'object') return oldData
            if (!isResourceKey(resourceKey)) return oldData
            const gate = oldData.gates[resourceKey]
            if (!gate) return oldData
            if (typeof gate.usage !== 'number') return oldData

            const newUsage = Math.max(0, gate.usage + countChange)
            const newAtLimit =
              !gate.isUnlimited && gate.limit !== null && newUsage >= gate.limit

            updated = true
            return {
              ...oldData,
              gates: {
                ...oldData.gates,
                [resourceKey]: { ...gate, usage: newUsage, atLimit: newAtLimit },
              },
            }
          })
        }
      } catch (error) {
        console.error('[FeatureGateMutationObserver] Cache update failed:', error)
      }

      return updated
    }

    const processMutationEvent = (mutation: {
      mutationId: number
      state: { status: string; variables?: unknown; data?: unknown }
      options: { mutationKey?: unknown }
    }) => {
      try {
        const { mutationId } = mutation
        const status = mutation.state.status
        const mapping = getMutationMapping(mutation.options.mutationKey)
        if (!mapping) return

        const resourceKey = mapping.resource
        /* `<resource>.create` → +1; `<resource>.delete` → -1. Bulk variants
         * aren't supported by the auto-mapping. */
        const countChange = mapping.operation === 'increment' ? 1 : -1

        if (status === 'pending') {
          /* Skip if already counted (status events can fire more than once). */
          if (pendingMutations.has(mutationId)) return
          pendingMutations.set(mutationId, { resource: resourceKey, countChange })
          updateFeatureGateCache(resourceKey, countChange)
          return
        }

        if (status === 'error' || status === 'idle') {
          const pending = pendingMutations.get(mutationId)
          if (pending) {
            updateFeatureGateCache(pending.resource, -pending.countChange)
            pendingMutations.delete(mutationId)
          }
          return
        }

        if (status === 'success') {
          pendingMutations.delete(mutationId)
        }
      } catch (error) {
        console.error('[FeatureGateMutationObserver] Event processing failed:', error)
      }
    }

    /* Catch-up scan for mutations that started before the observer mounted
     * (rare; happens during initial hydration). */
    try {
      for (const mutation of queryClient.getMutationCache().getAll()) {
        if (mutation.state.status === 'pending') {
          processMutationEvent({
            mutationId: mutation.mutationId,
            state: {
              status: mutation.state.status,
              variables: mutation.state.variables,
              data: mutation.state.data,
            },
            options: { mutationKey: mutation.options.mutationKey },
          })
        }
      }
    } catch (error) {
      console.error('[FeatureGateMutationObserver] Initial scan failed:', error)
    }

    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || !event.mutation) return
      processMutationEvent({
        mutationId: event.mutation.mutationId,
        state: {
          status: event.mutation.state.status,
          variables: event.mutation.state.variables,
          data: event.mutation.state.data,
        },
        options: { mutationKey: event.mutation.options.mutationKey },
      })
    })

    return () => {
      unsubscribe()
      /* Don't reset pendingMutations — the ref persists and any in-flight
       * rollbacks need to find their entry. */
    }
  }, [queryClient])

  return null
}

/**
 * SOURCE OF TRUTH KEYWORDS: AuthRedirectObserver, Sign In Regirect, signInRedirect
 *
 * WHAT:  Layout-level observer that subscribes to the QueryCache and
 *        MutationCache; whenever any tRPC call surfaces a TRPCClientError
 *        with `data.code === 'UNAUTHORIZED'`, it pushes the browser to
 *        AUTH_ROUTES.signIn (no-op if already on that route).
 * WHY:   Pages and components must never `redirect(AUTH_ROUTES.signIn)`
 *        themselves — that scatters auth-flow logic across every entry
 *        point and rots the moment a new page is added. Routing the redirect
 *        through the global tRPC error envelope means the SERVER decides
 *        when the user is unauthenticated (it's the only authority), the
 *        client just listens. Skips the redirect when the user is already on
 *        the sign-in route so background polls on that page can't trigger a
 *        loop.
 * WHERE: Mounted by TRPCReactProvider above. Reads AUTH_ROUTES from
 *        src/lib/config/auth-routes.ts. UNAUTHORIZED is thrown by
 *        authProcedure / protectedProcedure in src/trpc/procedures/protected.ts.
 */
function AuthRedirectObserver({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter()
  const pathname = usePathname()
  /* Ref lets the cache callbacks read the latest pathname without
   * re-subscribing on every navigation. */
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const isUnauthorized = (error: unknown): boolean => {
      if (!(error instanceof TRPCClientError)) return false
      /* tRPC client surfaces the TRPCError `code` as `data.code` on the
       * client; the protected.ts errorFormatter preserves it as-is. */
      const data: unknown = error.data
      if (data === null || typeof data !== 'object') return false
      const code = (data as { code?: unknown }).code
      return code === 'UNAUTHORIZED'
    }

    /* protectedProcedure throws PRECONDITION_FAILED with a structured cause
     * carrying errorCode ONBOARDING_INCOMPLETE for users with zero
     * memberships; the cause survives to the client via the errorFormatter. */
    const isOnboardingIncomplete = (error: unknown): boolean => {
      if (!(error instanceof TRPCClientError)) return false
      const data: unknown = error.data
      if (data === null || typeof data !== 'object') return false
      const cause = (data as { cause?: unknown }).cause
      if (cause === null || typeof cause !== 'object') return false
      return (
        (cause as { errorCode?: unknown }).errorCode ===
        ERROR_CODES.ONBOARDING_INCOMPLETE
      )
    }

    const handleError = (error: unknown) => {
      if (isUnauthorized(error)) {
        if (pathnameRef.current === AUTH_ROUTES.signIn) return
        router.replace(AUTH_ROUTES.signIn)
        return
      }
      if (isOnboardingIncomplete(error)) {
        if (pathnameRef.current === ROUTES.onboarding) return
        router.replace(ROUTES.onboarding)
      }
    }

    const queryUnsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return
      if (event.query.state.status !== 'error') return
      handleError(event.query.state.error)
    })

    const mutationUnsub = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || !event.mutation) return
      if (event.mutation.state.status !== 'error') return
      handleError(event.mutation.state.error)
    })

    return () => {
      queryUnsub()
      mutationUnsub()
    }
  }, [queryClient, router])

  return null
}
