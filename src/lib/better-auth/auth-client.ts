/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: authClient
 *
 * WHAT:  Better Auth browser client wired with the same plugin set as the
 *        server (organization, twoFactor, admin, lastLoginMethod).
 * WHY:   Client plugins MUST mirror server plugins so type inference and
 *        runtime calls line up; baseURL uses window.location.origin so one
 *        bundle ships unchanged to localhost and any production domain.
 * WHERE: Imported by every client component performing auth/org actions;
 *        shares ac / roles with src/lib/better-auth/permissions.ts.
 */

import { createAuthClient } from 'better-auth/client'
import {
  organizationClient,
  twoFactorClient,
  adminClient,
  lastLoginMethodClient,
} from 'better-auth/client/plugins'

import { ac, roles } from '@/lib/better-auth/permissions'

/* baseURL uses the current origin so the same bundle works on localhost and
 * any production domain without rebuilding. Client plugins must mirror the
 * server side (auth.ts). */
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [
    organizationClient({
      ac,
      roles,
      dynamicAccessControl: { enabled: true },
    }),
    twoFactorClient(),
    adminClient(),
    lastLoginMethodClient(),
  ],
})
