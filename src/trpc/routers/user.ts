/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: userRouter, getProfile
 *
 * WHAT:  Current-user profile read (id, name, email, image) for the UI.
 * WHY:   Runs on authProcedure (identity, no org scope) so it can be prefetched
 *        in the dashboard/portal server layouts and hydrated — the sidebar user
 *        menu then renders from cache with no client round-trip / flicker.
 * WHERE: Mounted as `user` in src/trpc/routers/_app; consumed by NavUser.
 */

import { createTRPCRouter } from '../init'
import { authProcedure } from '../procedures'

export const userRouter = createTRPCRouter({
  getProfile: authProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    image: ctx.user.image ?? null,
  })),
})
