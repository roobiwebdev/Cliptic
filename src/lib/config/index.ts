/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: prisma, DbClient, APP_NAME, APP_URL, APP_DOMAIN,
 *   APP_DESCRIPTION, APP_METADATA_BASE, BRANDING, AUTH_ROUTES,
 *   REGISTRATION_OPEN, PLANS, PlanKey, PlanDefinition, resend,
 *   getResendClient, RESEND_DEFAULT_FROM, isResendConfigured, ROUTES,
 *   AppRouteKey, PLAN_ORDER, BillingInterval, getPlanPriceId, getPlanByPriceId,
 *   getNextPlan, isPaidPlan, getStripeClient, isStripeConfigured,
 *   getStripeWebhookSecret, STRIPE_API_VERSION, portalConfig, isPortalEnabled,
 *   isPortalOwnerEmail, PORTAL_PATH
 *
 * WHAT:  Barrel re-export for the `src/lib/config/*` modules.
 * WHY:   Single import surface (`@/lib/config`) so consumers don't depend on
 *        the per-concern split, and so the prisma singleton, branding,
 *        auth-routes, plans, and registration flag can be regrouped without
 *        ripple edits.
 * WHERE: Imported broadly across the app and by src/lib/better-auth/auth.ts.
 */

export { prisma } from './prisma'
export type { DbClient } from './prisma'
export {
  APP_NAME,
  APP_URL,
  APP_DOMAIN,
  APP_DESCRIPTION,
  APP_METADATA_BASE,
  BRANDING,
} from './branding'
export { AUTH_ROUTES } from './auth-routes'
export type { AuthRouteKey } from './auth-routes'
export { ROUTES } from './routes'
export type { AppRouteKey } from './routes'
export { REGISTRATION_OPEN } from './registration'
export {
  PLAN_KEYS,
  PLANS,
  PLAN_ORDER,
  isPaidPlan,
  getPlanPriceId,
  getPlanByPriceId,
  getNextPlan,
} from './plans'
export type { PlanKey, PlanDefinition, BillingInterval } from './plans'
export {
  getResendClient,
  RESEND_DEFAULT_FROM,
  isResendConfigured,
  isDevEmailFallbackActive,
} from './resend'
export {
  getStripeClient,
  isStripeConfigured,
  getStripeWebhookSecret,
  STRIPE_API_VERSION,
} from './stripe'
export {
  portalConfig,
  isPortalEnabled,
  isPortalOwnerEmail,
  PORTAL_PATH,
} from './portal'
