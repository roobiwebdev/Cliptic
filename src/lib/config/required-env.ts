/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: REQUIRED_ENV, RequiredEnvVar, EnvChecklistItem,
 *   getEnvChecklist, getMissingRequiredEnv, hasMissingRequiredEnv,
 *   OPTIONAL_ENV, OptionalEnvVar, OptionalEnvItem, getOptionalEnvChecklist
 *
 * WHAT:  Two lists: REQUIRED_ENV (the app CANNOT run without these) and
 *        OPTIONAL_ENV (fail-soft integrations like Stripe/Resend the app runs
 *        fine WITHOUT), plus helpers to check which are set.
 * WHY:   Drives the developer setup gate: the root layout renders a checklist
 *        instead of the app until every required var is present, so a fresh
 *        clone fails with clear instructions rather than a cryptic crash.
 *        Optional integrations NEVER block startup — they're surfaced on the
 *        same checklist purely as informational rows (purpose + how to enable)
 *        so a developer knows what's off and what turning it on unlocks.
 *        Only presence is checked and only labels/help/ok are exposed — secret
 *        VALUES are never read out, so nothing leaks to the client.
 * WHERE: Read by src/app/layout.tsx (the gate); rendered by
 *        src/components/global/setup-checklist.tsx.
 */

import { PLAN_ORDER, PLANS, isPaidPlan } from './plans'

export interface RequiredEnvVar {
  /** The process.env key that must be set. */
  key: string
  /** Short human label for the checklist row. */
  label: string
  /** One-line instruction telling the developer how to satisfy it. */
  help: string
  /** Icon name resolved by the setup checklist (see its icon map). */
  icon: string
  /**
   * Optional call-to-action link rendered under the help text — e.g. a
   * recommended provider to get the value from. `label` is the button text,
   * `url` opens in a new tab. Purely presentational (no secret), so it's safe
   * to expose to the client.
   */
  link?: { label: string; url: string }
  /**
   * Optional walkthrough video (e.g. a Loom) shown as a secondary CTA under the
   * help text. `label` overrides the default button text. Presentational only
   * (no secret), so it's safe to expose to the client.
   */
  video?: { url: string; label?: string }
  /**
   * Optional predicate that decides whether this var is required RIGHT NOW.
   * Omitted ⇒ always required. Returning false ⇒ the var is irrelevant given
   * the current config and is dropped from the checklist entirely (not shown,
   * not counted). This is how an opt-in feature (e.g. the portal) makes its
   * companion vars required only once the feature is turned on — so enabling
   * the feature without its config surfaces as an incomplete checklist item
   * instead of failing silently.
   */
  when?: () => boolean
}

/* Edit this list to change what blocks startup. Keep it to the bare minimum —
 * anything that can fail soft belongs in its own config module, not here. A var
 * that only matters when a feature is enabled uses `when` so it's required
 * conditionally rather than always. */
export const REQUIRED_ENV: readonly RequiredEnvVar[] = [
  {
    key: 'DATABASE_URL',
    label: 'Database',
    help: 'Set DATABASE_URL to your PostgreSQL connection URL, then run `npx prisma migrate dev` to create the tables.',
    icon: 'Database',
    link: {
      label: 'Get a free Postgres database at Neon',
      url: 'https://neon.tech/?ref=wp',
    },
    /* TODO(webprodigies): replace with your real Loom share link. */
    video: {
      url: 'https://www.loom.com/share/36262244039a48159937721fea0ab993',
    },
  },
  {
    key: 'BETTER_AUTH_SECRET',
    label: 'Auth secret',
    help: 'Set BETTER_AUTH_SECRET. Type this command in your mac terminal. It should give you a key: openssl rand -base64 32',
    icon: 'KeyRound',
  },
  {
    /* Required only when the portal is turned on: without the owner email the
     * portal is on but no admin account is ever created, so no one can open
     * /portal — a silent, confusing dead end. */
    key: 'PORTAL_INITIAL_OWNER_EMAIL',
    label: 'Portal owner email',
    help: 'You turned the admin portal on (PORTAL_ENABLED="true"). Set PORTAL_INITIAL_OWNER_EMAIL to the email address you sign in with — that account becomes the portal admin. If you don\'t need the portal, set PORTAL_ENABLED="false" instead.',
    icon: 'ShieldCheck',
    when: () => process.env['PORTAL_ENABLED'] === 'true',
  },
]

export interface EnvChecklistItem extends RequiredEnvVar {
  ok: boolean
}

/**
 * SOURCE OF TRUTH KEYWORDS: OptionalEnvVar, OptionalEnvKey, OPTIONAL_ENV
 *
 * WHAT:  An integration the app runs fine WITHOUT (fail-soft). Shown on the
 *        setup checklist as an informational row — never blocks startup.
 * WHY:   A developer should be able to see, at a glance, what's turned off,
 *        WHAT it would do if enabled, and HOW to enable it — so an unwired
 *        integration (e.g. Stripe) is a clearly-explained choice, not a
 *        mystery. An integration is a GROUP of env vars (`keys`), not one flag:
 *        showing each key's status means a half-configured integration (e.g.
 *        secret key set but no price IDs) reads as exactly that, instead of a
 *        misleading "Configured". `purpose` carries the reasoning + the current
 *        fallback behaviour; `help` carries the enable-it instructions.
 * WHERE: Rendered by src/components/global/setup-checklist.tsx.
 */
export interface OptionalEnvKey {
  /** The process.env key. */
  key: string
  /** Short human label (name the thing, e.g. "Secret key"). */
  label: string
  /** true ⇒ helpful but doesn't gate the "Configured" badge (e.g. per-plan price ids). */
  optional?: boolean
}

export interface OptionalEnvVar {
  /** Stable id for the row (not tied to any single env var). */
  id: string
  /** Short human label for the row (name the integration, not a key). */
  label: string
  /** What it does + what the app does WITHOUT it (the fail-soft fallback). */
  purpose: string
  /** How to turn it on if they want it. */
  help: string
  /** Icon name resolved by the setup checklist (see its icon map). */
  icon: string
  /** Every env var this integration reads, with per-key status shown. */
  keys: OptionalEnvKey[]
  /** Optional provider/sign-up link (same shape as RequiredEnvVar.link). */
  link?: { label: string; url: string }
  /** Optional walkthrough video (same shape as RequiredEnvVar.video). */
  video?: { url: string; label?: string }
}

/* Per-plan Stripe price-id keys, DERIVED from the plan source of truth so the
 * labels follow the (env-driven) plan names and the key list never duplicates
 * PLAN_ORDER. `free` has no price; the env-var name follows plans.ts' fixed
 * `NEXT_PUBLIC_<PLANKEY>_PRICE_<INTERVAL>` convention. Marked optional: you only
 * need a price for the plans you actually sell. */
const STRIPE_PRICE_KEYS: OptionalEnvKey[] = PLAN_ORDER.filter(isPaidPlan).flatMap((plan) =>
  (['monthly', 'yearly'] as const).map((interval) => ({
    key: `NEXT_PUBLIC_${plan.toUpperCase()}_PRICE_${interval.toUpperCase()}`,
    label: `${PLANS[plan].name} price (${interval})`,
    optional: true,
  }))
)

/* Fail-soft integrations. Adding one here surfaces it on the setup checklist as
 * an informational row; it NEVER affects hasMissingRequiredEnv (never blocks). */
export const OPTIONAL_ENV: readonly OptionalEnvVar[] = [
  {
    id: 'stripe',
    label: 'Payments (Stripe)',
    purpose:
      'Optional. Stripe isn’t connected yet, so checkout is skipped — people are let straight into the app and no card is ever charged. Add your Stripe keys to turn on real paid plans, subscriptions, and the billing screen.',
    help: 'Create a Stripe account, add the three keys below, then a price ID for each paid plan you want to sell (create the prices in the Stripe dashboard). A plan with no price ID can’t be checked out.',
    icon: 'CreditCard',
    link: { label: 'Create a Stripe account', url: 'https://dashboard.stripe.com/register' },
    keys: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key' },
      { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', label: 'Publishable key' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret' },
      ...STRIPE_PRICE_KEYS,
    ],
  },
]

export interface OptionalEnvKeyStatus extends OptionalEnvKey {
  ok: boolean
}

export interface OptionalEnvItem extends Omit<OptionalEnvVar, 'keys'> {
  keys: OptionalEnvKeyStatus[]
  /** True when every NON-optional key is set. */
  ok: boolean
}

/* A var counts as set only when it's a non-empty, trimmed string. */
function isSet(key: string): boolean {
  const value = process.env[key]
  return typeof value === 'string' && value.trim().length > 0
}

/* A var is in scope unless its `when` predicate says it's irrelevant now. */
function isRequiredNow(item: RequiredEnvVar): boolean {
  return item.when === undefined || item.when()
}

/**
 * SOURCE OF TRUTH KEYWORDS: getEnvChecklist
 *
 * WHAT:  The currently-required vars annotated with whether each is set.
 *        Vars whose `when` predicate is false are excluded entirely.
 * WHERE: Passed to <SetupChecklist /> by the root layout.
 */
export function getEnvChecklist(): EnvChecklistItem[] {
  return REQUIRED_ENV.filter(isRequiredNow).map((item) => ({
    ...item,
    ok: isSet(item.key),
  }))
}

/**
 * SOURCE OF TRUTH KEYWORDS: getOptionalEnvChecklist
 *
 * WHAT:  The optional integrations annotated with whether each is configured.
 * WHY:   Presentational only — these never gate startup; the checklist shows
 *        them so a developer knows what's off and how to switch it on.
 * WHERE: Passed to <SetupChecklist /> by the root layout.
 */
export function getOptionalEnvChecklist(): OptionalEnvItem[] {
  return OPTIONAL_ENV.map((item) => {
    const keys = item.keys.map((k) => ({ ...k, ok: isSet(k.key) }))
    /* "Configured" = every non-optional key is set; optional (per-plan price)
     * keys are shown but don't gate the badge. */
    const ok = keys.filter((k) => !k.optional).every((k) => k.ok)
    return { ...item, keys, ok }
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: getMissingRequiredEnv
 *
 * WHAT:  Only the required vars that are NOT set.
 * WHERE: Used by the gate to decide whether to show the checklist.
 */
export function getMissingRequiredEnv(): EnvChecklistItem[] {
  return getEnvChecklist().filter((item) => !item.ok)
}

/**
 * SOURCE OF TRUTH KEYWORDS: hasMissingRequiredEnv
 *
 * WHAT:  True when at least one required var is missing.
 * WHERE: The root layout's branch condition.
 */
export function hasMissingRequiredEnv(): boolean {
  return REQUIRED_ENV.filter(isRequiredNow).some((item) => !isSet(item.key))
}
