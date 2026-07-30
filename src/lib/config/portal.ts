/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: portalConfig, isPortalEnabled, isPortalOwnerEmail,
 *   PORTAL_PATH
 *
 * WHAT:  Env-driven config for the platform-admin portal — whether it's on, the
 *        designated owner email that bootstraps the first admin, and the route
 *        prefix.
 * WHY:   One place resolves the portal env so the rest of the app reads
 *        constants. `isPortalOwnerEmail` is the single source of truth for "is
 *        this the operator": an exact, case-insensitive, trimmed match — no
 *        wildcards or partial matching (a security boundary). The owner email
 *        is server-only (NOT NEXT_PUBLIC), so client callers always see it as
 *        empty and the real gate runs server-side.
 * WHERE: Read by src/services/portal.service.ts (admin resolution + auto-
 *        provision), the /portal layout, and the dashboard/onboarding portal
 *        redirects.
 */

export const PORTAL_PATH = process.env['PORTAL_PATH_PREFIX'] || '/portal'

export const portalConfig = {
  enabled: process.env['PORTAL_ENABLED'] === 'true',
  initialOwnerEmail: process.env['PORTAL_INITIAL_OWNER_EMAIL'] || '',
  pathPrefix: PORTAL_PATH,
} as const

/**
 * SOURCE OF TRUTH KEYWORDS: isPortalEnabled
 *
 * WHAT:  True when PORTAL_ENABLED=true.
 * WHERE: Gate before any portal operation / route.
 */
export function isPortalEnabled(): boolean {
  return portalConfig.enabled
}

/**
 * SOURCE OF TRUTH KEYWORDS: isPortalOwnerEmail
 *
 * WHAT:  True when the email exactly matches PORTAL_INITIAL_OWNER_EMAIL
 *        (case-insensitive, trimmed) and the portal is enabled.
 * WHY:   The operator's email bootstraps the first portal admin with no manual
 *        DB seeding. Exact match only — security boundary.
 * WHERE: portal.service admin resolution + auto-provision.
 */
export function isPortalOwnerEmail(email: string): boolean {
  if (!portalConfig.enabled || !portalConfig.initialOwnerEmail) return false
  return email.toLowerCase().trim() === portalConfig.initialOwnerEmail.toLowerCase().trim()
}
