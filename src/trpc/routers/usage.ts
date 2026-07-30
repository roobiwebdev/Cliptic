/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: usageRouter, AUTO_DERIVED_FROM_RESOURCES
 *
 * WHAT:  Exposes the feature-gate map for the active organization so the UI
 *        can show "you're at limit" affordances.
 * WHY:   Gate ENFORCEMENT lives in protectedProcedure and is
 *        AUTO_DERIVED_FROM_RESOURCES — every `<resource>.create` whose
 *        registry entry declares a `limit` is auto-checked, and every verb
 *        on a flag-resource is auto-checked. This router exists only to let
 *        the client read the same gate state for rendering — never to
 *        gate-check before another call.
 * WHERE: Consumed by src/components/feature-gate.tsx; mounted by
 *        src/trpc/routers/_app.ts; delegates to src/lib/feature-gate.ts.
 */

import { z } from 'zod'
import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { getFeatureGates } from '@/lib/feature-gate'

export const usageRouter = createTRPCRouter({
  getFeatureGates: protectedProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => getFeatureGates(input.organizationId)),
})
