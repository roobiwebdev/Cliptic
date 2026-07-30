/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: makeQueryClient
 *
 * WHAT:  Shared TanStack QueryClient factory used by both server prefetch and
 *        the browser provider.
 * WHY:   Hydration only succeeds when both sides use IDENTICAL default options;
 *        a single factory eliminates drift. `retry: false` is deliberate — tRPC
 *        already returns typed errors and a retry just stalls the UI.
 * WHERE: Imported by src/trpc/server.tsx (server) and src/trpc/react-provider.tsx
 *        (client).
 */

import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query'

export const makeQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        /* tRPC surfaces typed errors (permission/limit/etc.) — retrying just
         * delays the error UI. */
        retry: false,
      },
      dehydrate: {
        /* `pending` opt-in lets streaming SSR ship in-flight queries; the
         * client picks them up without re-firing. */
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  })
}
