/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: APP_NAME, APP_DESCRIPTION, APP_URL,
 *   APP_METADATA_BASE, APP_DOMAIN, BRANDING
 *
 * WHAT:  Public app identity strings + URL primitives plus the consolidated
 *        BRANDING object (upgrade-modal copy, metadata base).
 * WHY:   One file resolves env-driven branding so the rest of the app reads
 *        constants, not `process.env`, keeping client/server output stable.
 *        BRANDING holds visual / textual identity ONLY — no routes or
 *        redirect targets. Sign-in route lives in AUTH_ROUTES
 *        (src/lib/config/auth-routes.ts); product nav routes live on the
 *        corresponding RESOURCES entry's `nav.href`.
 * WHERE: Re-exported from src/lib/config/index.ts; consumed by metadata,
 *        layouts, auth.ts, and the upgrade-modal UI.
 */

export const APP_NAME = process.env['NEXT_PUBLIC_APP_NAME'] ?? 'My App'

export const APP_DESCRIPTION =
  process.env['NEXT_PUBLIC_APP_DESCRIPTION'] ?? `${APP_NAME} — multi-tenant SaaS.`

export const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

export const APP_METADATA_BASE = (() => {
  try {
    return new URL(APP_URL)
  } catch {
    return new URL('http://localhost:3000')
  }
})()

export const APP_DOMAIN = APP_METADATA_BASE.hostname

/**
 * SOURCE OF TRUTH KEYWORDS: BRANDING
 *
 * WHAT:  Aggregated branding object exposing the resolved names, URLs, and
 *        upgrade-modal copy used across the UI.
 * WHY:   One frozen record so UI surfaces never reach into env or duplicate
 *        copy strings; {resourceName} placeholder is interpolated from
 *        RESOURCES[x].name at render time. Intentionally has NO `routes`
 *        field — routes are not branding (see file header).
 * WHERE: Consumed by upgrade modal copy and layout metadata.
 */
export const BRANDING = {
  appName: APP_NAME,
  appDescription: APP_DESCRIPTION,
  appUrl: APP_URL,
  appDomain: APP_DOMAIN,
  metadataBase: APP_METADATA_BASE,
  upgradeModal: {
    title: 'Upgrade required',
    /* {resourceName} is interpolated from RESOURCES[x].name. */
    bodyTemplate:
      "You've hit your plan limit for {resourceName}. Upgrade your workspace to keep going.",
    genericBody:
      "You've hit your plan limit for this feature. Upgrade your workspace to keep going.",
    primaryCtaLabel: 'View plans',
    secondaryCtaLabel: 'Maybe later',
  },
} as const
