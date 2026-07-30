/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getQueryClient, trpc
 *
 * WHAT:  Server-only tRPC entry point — exposes the typed in-process proxy
 *        (`trpc`) and the request-scoped QueryClient factory for prefetch + hydrate.
 * WHY:   `cache()` ensures sibling Server Components in one request share ONE
 *        QueryClient so the hydration boundary serializes a single payload; the
 *        proxy bypasses HTTP and calls procedures in-process.
 * WHERE: Imported by Server Components and route handlers that prefetch (e.g.
 *        src/app/**). Depends on src/trpc/init.ts, src/trpc/tanstack-config.ts,
 *        and src/trpc/routers/_app.ts.
 */

import 'server-only'

import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { cache } from 'react'
import { createTRPCContext } from './init'
import { makeQueryClient } from './tanstack-config'
import { appRouter } from './routers/_app'

/**
 * SOURCE OF TRUTH KEYWORDS: getQueryClient
 *
 * WHAT:  Request-scoped QueryClient factory for Server Components.
 * WHY:   Without `cache()`, parallel prefetches each construct a new client and
 *        the `<HydrationBoundary>` ships only one — leaving the others' queries
 *        un-dehydrated and causing client-side refetches.
 * WHERE: Used by the `trpc` proxy below and by Server Components calling
 *        `<HydrationBoundary state={dehydrate(getQueryClient())}>`.
 */
/* `cache()` so sibling Server Components in one request share ONE
 * QueryClient — without it, parallel prefetches each get their own and the
 * hydration boundary only ships one. */
export const getQueryClient = cache(makeQueryClient)

/**
 * SOURCE OF TRUTH KEYWORDS: trpc
 *
 * WHAT:  In-process typed tRPC proxy for server-side prefetch and direct calls.
 * WHY:   Bypasses HTTP — invokes procedures inside the same Node process while
 *        preserving the superjson transformer and the request-shared context.
 * WHERE: Used by Server Components for `queryClient.prefetchQuery(trpc.x.y.queryOptions(...))`.
 */
/* In-process typed proxy: `await queryClient.prefetchQuery(
 * trpc.x.list.queryOptions(...))` then ship via `<HydrationBoundary>`. The
 * superjson transformer set on `initTRPC.create({...})` flows through. */
export const trpc = createTRPCOptionsProxy({
  ctx: createTRPCContext,
  router: appRouter,
  queryClient: getQueryClient,
})
