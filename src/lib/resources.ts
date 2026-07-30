/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: RESOURCES, ResourceDefinition, ResourceKey,
 *   LimitResourceKey, FlagResourceKey, PermissionedResourceKey, Permission,
 *   PermissionAction, ResourceLimit, ResourceFlag, ResourceNav, ResourceAudit,
 *   ResourceRateLimit, PLAN_KEYS, RESOURCE_ENTRIES, LIMIT_RESOURCE_KEYS,
 *   FLAG_RESOURCE_KEYS, getResourceLimitForPlan, getResourceFlagForPlan,
 *   getResourceFromPath, getMutationFeatureMap, isResourceKey,
 *   interpolateAuditDescribe, getOrganizationStatement
 *
 * WHAT:  Unified registry of every resource concept — permissions, limits, flags,
 *        sidebar nav, audit description templates, rate-limit overrides.
 * WHY:   Single source of truth — adding a verb to RESOURCES wires up the
 *        permission string, owner-role grant, role-builder UI metadata, sidebar
 *        item, optimistic-update mapping, and audit entity automatically.
 * WHERE: Consumed by procedureFactory (src/trpc/procedures/protected.ts),
 *        permission constants (src/lib/better-auth/permissions.ts), feature
 *        gates (src/lib/feature-gate.ts), and optimistic UI
 *        (src/trpc/react-provider.tsx); depends on src/lib/config/plans.ts.
 */

import { PLAN_KEYS, type PlanKey } from '@/lib/config/plans'

/* PLAN_KEYS / PlanKey are the single source of truth in plans.ts (RESOURCES only
 * consumes them for perPlan exhaustiveness). Re-exported here so existing
 * importers of `@/lib/resources` keep resolving without a second declaration. */
export { PLAN_KEYS }

type PerPlan<T> = Record<PlanKey, T>

export interface ResourceLimit {
  perPlan: PerPlan<number | 'unlimited'>
  upgradeMessage: string
  availableOnFreeTrial: boolean
  unit?: string
}

export interface ResourceFlag {
  perPlan: PerPlan<boolean>
  availableOnFreeTrial: boolean
}

export interface ResourceNav {
  label: string
  href: string
  icon: string
  section?: 'main' | 'settings' | (string & {})
  /** Defaults to 'read' when omitted. */
  requirePermission?: string
  requireFlag?: boolean
}

export interface ResourceAudit {
  entity?: string
  /** Templates support {input.field} and {output.field} interpolation. */
  describe?: Record<string, string>
}

export interface ResourceRateLimit {
  [action: string]: { count: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}` }
}

/**
 * A feature surface — any combination of fields below. Only `name` is required.
 *
 *   permissions only          → RBAC-gated action with no UI page
 *   flag only                 → plan-tier on/off toggle (e.g., bulk export button)
 *   limit only                → plan-tier quota with no dedicated page
 *   nav only                  → sidebar page with no quotas
 *   permissions + nav + audit → full CRUD entity (the typical case)
 *
 * `<FeatureGate resource="...">` and `useFeatureGate('...')` work on ANY entry
 * that declares `limit` or `flag`, regardless of whether `nav` is present.
 */
export interface ResourceDefinition {
  name: string
  description?: string
  permissions?: readonly string[]
  /** limit and flag are mutually exclusive — pick at most one. */
  limit?: ResourceLimit
  flag?: ResourceFlag
  nav?: ResourceNav
  audit?: ResourceAudit
  rateLimit?: ResourceRateLimit
}

/**
 * SOURCE OF TRUTH KEYWORDS: RESOURCES
 *
 * WHAT:  The feature registry — every feature surface the app exposes is
 *        declared here. A surface can be a CRUD entity, a flag-only toggle,
 *        a quota with no page, or any combination (see ResourceDefinition).
 * WHY:   Single source of truth: permission constants, owner-role grants,
 *        sidebar items, limit/flag values, audit templates, rate-limit
 *        overrides, and optimistic update mappings all derive from this.
 * WHERE: Read everywhere via RESOURCE_ENTRIES / typed helpers below.
 *
 * Naming: Better-Auth-owned surfaces (member, invitation) use singular keys
 * so auto-derived permission strings line up with Better Auth's internal
 * checks. App-owned surfaces use plural.
 */
export const RESOURCES = {
  member: {
    name: 'Team Members',
    description: 'Add, remove, and modify organization members',
    permissions: ['create', 'read', 'update', 'delete'],
    limit: {
      perPlan: { free: 1, starter: 3, pro: 10, enterprise: 'unlimited', portal: 'unlimited' },
      upgradeMessage: 'Upgrade to {nextPlan} to invite more teammates',
      availableOnFreeTrial: true,
      unit: 'seats',
    },
    nav: {
      label: 'Team',
      href: '/dashboard/team',
      icon: 'Users',
      section: 'main',
    },
  },

  invitation: {
    name: 'Invitations',
    description: 'Send invites and cancel pending invitations',
    permissions: ['create', 'cancel'],
  },

  organizationRoles: {
    name: 'Organization Roles',
    description: 'Create and manage custom roles and their permissions',
    permissions: ['create', 'read', 'update', 'delete'],
  },

  storage: {
    name: 'Storage',
    description: 'File storage capacity',
    limit: {
      perPlan: {
        free: 100 * 1024 * 1024,
        starter: 5 * 1024 * 1024 * 1024,
        pro: 25 * 1024 * 1024 * 1024,
        enterprise: 'unlimited',
        portal: 'unlimited',
      },
      upgradeMessage: 'Upgrade to {nextPlan} to expand your storage',
      availableOnFreeTrial: true,
      unit: 'bytes',
    },
  },

  apiCalls: {
    name: 'API Calls',
    description: 'Total API calls per month',
    limit: {
      perPlan: { free: 1_000, starter: 50_000, pro: 500_000, enterprise: 'unlimited', portal: 'unlimited' },
      upgradeMessage: 'Upgrade to {nextPlan} for more API calls',
      availableOnFreeTrial: true,
      unit: 'calls',
    },
  },

  customDomain: {
    name: 'Custom Domain',
    description: 'Map your own domain to your workspace',
    flag: {
      perPlan: { free: false, starter: true, pro: true, enterprise: true, portal: true },
      availableOnFreeTrial: false,
    },
  },

  customBranding: {
    name: 'Custom Branding',
    description: 'Remove or customize platform branding',
    flag: {
      perPlan: { free: false, starter: true, pro: true, enterprise: true, portal: true },
      availableOnFreeTrial: false,
    },
  },

  auditLogs: {
    name: 'Audit Logs',
    description: 'Access full audit log history with forensic detail',
    permissions: ['read'],
    flag: {
      perPlan: { free: false, starter: false, pro: true, enterprise: true, portal: true },
      availableOnFreeTrial: false,
    },
    nav: {
      label: 'Audit Logs',
      href: '/dashboard/audit-logs',
      icon: 'ScrollText',
      section: 'settings',
      requireFlag: true,
    },
  },

  billing: {
    name: 'Billing & Payments',
    description: 'Manage subscriptions, invoices, and payment methods',
    permissions: ['create', 'read', 'update', 'delete'],
    nav: {
      label: 'Billing',
      href: '/dashboard/settings/billing',
      icon: 'CreditCard',
      section: 'settings',
    },
  },

  organizationSettings: {
    name: 'Organization Settings',
    description: 'Update organization name, logo, and other org-wide settings',
    permissions: ['read', 'update'],
    audit: { entity: 'organization' },
    nav: {
      label: 'Organization',
      href: '/dashboard/settings/organization',
      icon: 'Settings',
      section: 'settings',
    },
  },

  integrations: {
    name: 'Integrations',
    description: 'Connect or disconnect third-party services',
    permissions: ['read', 'update'],
  },
} as const satisfies Record<string, ResourceDefinition>

export type ResourceKey = keyof typeof RESOURCES

export type LimitResourceKey = {
  [K in ResourceKey]: (typeof RESOURCES)[K] extends { limit: ResourceLimit } ? K : never
}[ResourceKey]

export type FlagResourceKey = {
  [K in ResourceKey]: (typeof RESOURCES)[K] extends { flag: ResourceFlag } ? K : never
}[ResourceKey]

export type PermissionedResourceKey = {
  [K in ResourceKey]: (typeof RESOURCES)[K] extends { permissions: readonly string[] }
    ? K
    : never
}[ResourceKey]

export type PermissionAction<R extends PermissionedResourceKey> =
  (typeof RESOURCES)[R] extends { permissions: infer A }
    ? A extends readonly (infer T)[]
      ? T
      : never
    : never

/**
 * SOURCE OF TRUTH KEYWORDS: Permission
 *
 * WHAT:  Template-literal union of every legal `resource:action` string plus
 *        the Better Auth owner wildcard `*:*`.
 * WHY:   Compile-time guarantee that permission strings exist in RESOURCES;
 *        prevents typos at every callsite of permission() and requirePermission.
 * WHERE: Re-exported from src/lib/better-auth/permissions.ts.
 */
export type Permission =
  | {
      [R in PermissionedResourceKey]: `${R & string}:${PermissionAction<R> & string}`
    }[PermissionedResourceKey]
  | '*:*'

/**
 * SOURCE OF TRUTH KEYWORDS: isResourceKey
 *
 * WHAT:  Type guard narrowing an arbitrary string to ResourceKey.
 * WHY:   hasOwnProperty so prototype-chain keys ('toString' etc.) do NOT pass.
 * WHERE: Used by getResourceFromPath and the RESOURCE_ENTRIES builder below.
 */
export function isResourceKey(value: string): value is ResourceKey {
  return Object.prototype.hasOwnProperty.call(RESOURCES, value)
}

/* Single widening point for iterating RESOURCES as [key, def] tuples — the
 * `as const satisfies` literal types refuse to see optional fields on the
 * union when iterated directly, so we widen here once. */
export const RESOURCE_ENTRIES: ReadonlyArray<readonly [ResourceKey, ResourceDefinition]> =
  (() => {
    const out: Array<readonly [ResourceKey, ResourceDefinition]> = []
    for (const key of Object.keys(RESOURCES)) {
      if (isResourceKey(key)) {
        out.push([key, RESOURCES[key]])
      }
    }
    return out
  })()

/**
 * SOURCE OF TRUTH KEYWORDS: getOrganizationStatement
 *
 * WHAT:  Builds the resource→actions statement record consumed by Better Auth.
 * WHY:   Filters RESOURCES down to entries with permissions so non-permissioned
 *        resources (limits/flags only) do not pollute the access-control schema.
 * WHERE: Used by src/lib/better-auth/permissions.ts to build organizationStatement.
 */
export function getOrganizationStatement(): Record<string, readonly string[]> {
  const statement: Record<string, readonly string[]> = {}
  for (const [key, def] of RESOURCE_ENTRIES) {
    if (def.permissions && def.permissions.length > 0) {
      statement[key] = def.permissions
    }
  }
  return statement
}

/**
 * SOURCE OF TRUTH KEYWORDS: SidebarNavItem, SidebarNavSection, getSidebarNav
 *
 * WHAT:  Sidebar item shape (one per RESOURCES entry that declares `nav`) and
 *        the per-section grouping the sidebar renders.
 * WHY:   The sidebar is derived from the SAME registry that drives permissions
 *        and gates — adding `nav` to a resource is the ONLY step needed to make
 *        it appear in the sidebar, with its permission/flag gating already
 *        wired. No second nav source-of-truth file.
 * WHERE: Produced by getSidebarNav(); consumed by
 *        src/components/global/sidebar/app-sidebar.tsx.
 */
export interface SidebarNavItem {
  key: ResourceKey
  label: string
  href: string
  icon: string
  /** Full `resource:action` the member must hold; owners always pass. */
  requirePermission: Permission
  /** When true, the item is hidden unless the resource's plan flag is on. */
  requireFlag: boolean
}

export interface SidebarNavSection {
  section: string
  items: SidebarNavItem[]
}

/* Render order for the known sections; unknown sections append after. */
const NAV_SECTION_ORDER: readonly string[] = ['main', 'settings']

/**
 * SOURCE OF TRUTH KEYWORDS: getSidebarNav
 *
 * WHAT:  Builds the grouped sidebar nav from every RESOURCES entry with `nav`.
 * WHY:   Single registry pass — the item's permission defaults to
 *        `<resource>:read` unless the nav entry overrides the action, and
 *        `requireFlag` carries through so the sidebar can hide plan-locked
 *        items. Keeps the sidebar in lockstep with the registry.
 * WHERE: Called by app-sidebar.tsx (client) to render sections.
 */
export function getSidebarNav(): SidebarNavSection[] {
  const bySection = new Map<string, SidebarNavItem[]>()

  for (const [key, def] of RESOURCE_ENTRIES) {
    if (!def.nav) continue
    const action = def.nav.requirePermission ?? 'read'
    /* `${key}:${action}` is a Permission by construction, but RESOURCE_ENTRIES
     * is typed against the widened ResourceDefinition so TS sees `string`. This
     * is the same documented boundary the permission-constants builder uses. */
    const requirePermission = `${key}:${action}` as Permission
    const section = def.nav.section ?? 'main'
    const item: SidebarNavItem = {
      key,
      label: def.nav.label,
      href: def.nav.href,
      icon: def.nav.icon,
      requirePermission,
      requireFlag: def.nav.requireFlag ?? false,
    }
    const existing = bySection.get(section)
    if (existing) existing.push(item)
    else bySection.set(section, [item])
  }

  const orderedKeys = [
    ...NAV_SECTION_ORDER.filter((s) => bySection.has(s)),
    ...[...bySection.keys()].filter((s) => !NAV_SECTION_ORDER.includes(s)),
  ]
  return orderedKeys.map((section) => ({
    section,
    items: bySection.get(section) ?? [],
  }))
}

/**
 * SOURCE OF TRUTH KEYWORDS: getResourceFromPath
 *
 * WHAT:  Extracts the resource key from a tRPC procedure path like
 *        `projects.create` -> `projects`.
 * WHY:   Convention-driven auto-wiring (audit entity, limit checks, counter
 *        bumps) keys off the first path segment matching a RESOURCES entry.
 * WHERE: Used by protectedProcedure (src/trpc/procedures/protected.ts).
 */
export function getResourceFromPath(path: string): ResourceKey | null {
  if (!path) return null
  const first = path.split('.')[0]
  if (first === undefined) return null
  return isResourceKey(first) ? first : null
}

function isLimitEntry(
  entry: readonly [ResourceKey, ResourceDefinition]
): entry is readonly [LimitResourceKey, ResourceDefinition & { limit: ResourceLimit }] {
  return entry[1].limit !== undefined
}

function isFlagEntry(
  entry: readonly [ResourceKey, ResourceDefinition]
): entry is readonly [FlagResourceKey, ResourceDefinition & { flag: ResourceFlag }] {
  return entry[1].flag !== undefined
}

/**
 * SOURCE OF TRUTH KEYWORDS: getMutationFeatureMap, AUTO_DERIVED_FROM_RESOURCES
 *
 * WHAT:  Builds the client-side `procedure.path -> { resource, operation }` map
 *        used to optimistically bump usage counters on success.
 * WHY:   Rigid by design — if a procedure should bump a counter but doesn't
 *        fit `<resource>.create` / `<resource>.delete`, rename the procedure
 *        rather than special-casing here. The server-side counter bump is
 *        AUTO_DERIVED_FROM_RESOURCES in protectedProcedure off the same path
 *        shape, so client and server stay in lockstep without a second
 *        registry.
 * WHERE: Consumed by src/trpc/react-provider.tsx for optimistic UI.
 */
export function getMutationFeatureMap(): Record<
  string,
  { resource: LimitResourceKey; operation: 'increment' | 'decrement' }
> {
  const map: Record<
    string,
    { resource: LimitResourceKey; operation: 'increment' | 'decrement' }
  > = {}
  for (const entry of RESOURCE_ENTRIES) {
    if (!isLimitEntry(entry)) continue
    const [key] = entry
    map[`${key}.create`] = { resource: key, operation: 'increment' }
    map[`${key}.delete`] = { resource: key, operation: 'decrement' }
  }
  return map
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * SOURCE OF TRUTH KEYWORDS: interpolateAuditDescribe
 *
 * WHAT:  Interpolates `{input.field}` / `{output.field}` placeholders in audit
 *        description templates against the procedure's input and output.
 * WHY:   Missing keys render as the literal placeholder so audit rows stay
 *        inspectable instead of crashing.
 * WHERE: Called by protectedProcedure's auto-audit path
 *        (src/trpc/procedures/protected.ts).
 */
export function interpolateAuditDescribe(
  template: string,
  params: { input: unknown; output: unknown }
): string {
  return template.replace(/\{(input|output)\.([a-zA-Z0-9_]+)\}/g, (_, source, field) => {
    const obj = source === 'input' ? params.input : params.output
    if (!isJsonObject(obj) || !(field in obj)) {
      return `{${source}.${field}}`
    }
    const value = obj[field]
    if (value === null || value === undefined) return `{${source}.${field}}`
    return String(value)
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: getResourceLimitForPlan
 *
 * WHAT:  Resolves a numeric cap for a (resource, plan) pair, mapping
 *        'unlimited' to Infinity.
 * WHY:   Centralises the 'unlimited' sentinel so comparisons are simple
 *        `current >= cap` everywhere downstream.
 * WHERE: Used by src/lib/feature-gate.ts and the usage-counter logic.
 */
export function getResourceLimitForPlan(
  resource: LimitResourceKey,
  plan: PlanKey
): number {
  const value = RESOURCES[resource].limit.perPlan[plan]
  return value === 'unlimited' ? Infinity : value
}

/**
 * SOURCE OF TRUTH KEYWORDS: getResourceFlagForPlan
 *
 * WHAT:  Returns the boolean availability of a flag resource for a given plan.
 * WHY:   Single read-point for feature-flag gating so requireFlag and the UI
 *        agree on availability.
 * WHERE: Used by src/lib/feature-gate.ts and nav rendering.
 */
export function getResourceFlagForPlan(
  resource: FlagResourceKey,
  plan: PlanKey
): boolean {
  return RESOURCES[resource].flag.perPlan[plan]
}

/* `satisfies` is load-bearing: if a new limit/flag resource gets added and
 * the tuple isn't updated, TS fails to compile. */
export const LIMIT_RESOURCE_KEYS = RESOURCE_ENTRIES
  .filter(isLimitEntry)
  .map(([k]) => k) satisfies readonly LimitResourceKey[]

export const FLAG_RESOURCE_KEYS = RESOURCE_ENTRIES
  .filter(isFlagEntry)
  .map(([k]) => k) satisfies readonly FlagResourceKey[]
