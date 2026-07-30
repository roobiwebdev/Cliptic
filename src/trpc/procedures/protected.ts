/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: router, baseProcedure, authProcedure,
 *   protectedProcedure, ProtectedOptions, AuditOverride, PaginationOptions,
 *   PaginationContext, AUTO_DERIVED_FROM_RESOURCES
 *
 * WHAT:  The procedure factory — every protected mutation/query is built here.
 * WHY:   Centralizes auth, audit, transactions, counter math, and limit/flag/role
 *        gates so handlers stay pure business logic. Convention drives behavior
 *        via the `<resource>.<verb>` path shape, and ALL plan-tier concerns
 *        (limit, flag, usage counter) are AUTO_DERIVED_FROM_RESOURCES — there
 *        is no per-procedure opt-in or opt-out. The developer declares the
 *        feature once in src/lib/resources.ts; the factory enforces it
 *        everywhere. Search "AUTO_DERIVED_FROM_RESOURCES" to find every site
 *        that implements this contract.
 * WHERE: Composed by routers in src/trpc/routers/*. Reads RESOURCES from
 *        src/lib/resources.ts; writes audit via src/services/activity-log.service.ts;
 *        checks limits via src/lib/feature-gate.ts; bumps counters via
 *        src/services/usage.service.ts; rate-limits via src/lib/rate-limit.ts;
 *        reads context from src/trpc/init.ts.
 */

import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { headers } from 'next/headers'
import type { Context } from '../init'
import { createStructuredError } from '../init'
import { ERROR_CODES, type StructuredErrorCause } from '@/lib/errors'
import {
  apiLimiter,
  checkRateLimit,
  getResourceLimiter,
  getClientIp,
} from '@/lib/rate-limit'
import { getUserMemberships } from '@/services/membership.service'
import type { Permission } from '@/lib/better-auth/permissions'
import {
  RESOURCES,
  RESOURCE_ENTRIES,
  LIMIT_RESOURCE_KEYS,
  FLAG_RESOURCE_KEYS,
  getResourceFromPath,
  interpolateAuditDescribe,
  type ResourceKey,
  type ResourceDefinition,
  type LimitResourceKey,
  type FlagResourceKey,
} from '@/lib/resources'
import { checkFeatureGate, checkBooleanFeature } from '@/lib/feature-gate'
import { incrementUsage, decrementUsage } from '@/services/usage.service'
import { prisma } from '@/lib/config/prisma'
import type { Prisma } from '@/generated/prisma'
import {
  logActivity,
  auditMetadataSchema,
  type AuditEntityName,
  type AuditMetadata,
} from '@/services/activity-log.service'
import { getRequestForensics } from '@/lib/request-forensics'

// ---------------------------------------------------------------------------
// tRPC instance
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return { ...shape, data: { ...shape.data, cause: error.cause } }
  },
  /* SSE numbers are tRPC defaults: survive proxy idle timeouts (~30s) while
   * staying under serverless hard caps (~10min). */
  sse: {
    maxDurationMs: 5 * 60 * 1_000,
    ping: { enabled: true, intervalMs: 10_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
})

/**
 * SOURCE OF TRUTH KEYWORDS: router
 *
 * WHAT:  The raw tRPC router builder from the configured `initTRPC`.
 * WHY:   Exposed so the procedures module is the single seat of tRPC configuration;
 *        routers and procedure factories use these to compose behavior.
 * WHERE: Re-exported via src/trpc/procedures/index.ts and consumed in src/trpc/init.ts
 *        (as `createTRPCRouter`).
 */
export const router = t.router
const middleware = t.middleware

// ---------------------------------------------------------------------------
// baseProcedure — public, rate-limited. Inherited by every other procedure.
// ---------------------------------------------------------------------------

/**
 * SOURCE OF TRUTH KEYWORDS: baseProcedure
 *
 * WHAT:  Public procedure with a global rate-limit cap, the trunk every other
 *        procedure inherits from.
 * WHY:   Putting the global limiter at the root means every endpoint is rate-limited
 *        by default; identifier falls back to client IP when no user is resolved.
 * WHERE: Composed by `authProcedure` below; used directly by truly public routers
 *        (e.g. webhooks, health checks) under src/trpc/routers/*.
 */
export const baseProcedure = t.procedure.use(
  middleware(async ({ ctx, next }) => {
    const requestHeaders = await headers()
    const identifier = ctx.user?.id ?? `ip:${getClientIp(requestHeaders)}`
    const result = await checkRateLimit(apiLimiter, identifier)

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        cause: {
          errorCode: ERROR_CODES.RATE_LIMITED,
          limit: result.limit,
          remaining: result.remaining,
          resetAt: result.resetAt,
          retryAfter,
          message: `You've exceeded the rate limit of ${result.limit} requests. Please wait ${retryAfter} seconds before trying again.`,
        } satisfies StructuredErrorCause,
      })
    }

    return next()
  })
)

// ---------------------------------------------------------------------------
// authProcedure — requires a logged-in user; no organization scoping.
// ---------------------------------------------------------------------------

/**
 * SOURCE OF TRUTH KEYWORDS: authProcedure
 *
 * WHAT:  Inherits `baseProcedure` and additionally requires a logged-in user.
 * WHY:   Used by endpoints that need an identity but no organization scope
 *        (e.g. listing my memberships); triggers the lazy `resolveAuth()` that
 *        `baseProcedure` deliberately skips.
 * WHERE: Composed by `protectedProcedure` below; used directly for user-scoped
 *        endpoints in src/trpc/routers/*.
 */
export const authProcedure = baseProcedure.use(async ({ ctx, next }) => {
  await ctx.resolveAuth()
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    })
  }
  /* Re-stamp user/session so downstream sees them as non-nullable. */
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user } })
})

// ---------------------------------------------------------------------------
// protectedProcedure — org-scoped factory; see CLAUDE.md RULE 3.
// ---------------------------------------------------------------------------

/**
 * SOURCE OF TRUTH KEYWORDS: AuditOverride
 *
 * WHAT:  Optional override bag for a single procedure's audit row — entity, action,
 *        description template, entityId extractor, and metadata.
 * WHY:   Lets the rare procedure whose path doesn't match the convention still
 *        produce a sensible audit row without writing a manual `logActivity()` call.
 * WHERE: Used as `ProtectedOptions['audit']` (object form); consumed by `writeAuditRow`.
 */
export interface AuditOverride {
  entity?: AuditEntityName
  action?: string
  /** Template string with `{input.field}` / `{output.field}` placeholders. */
  describe?: string
  getEntityId?: (params: { input: unknown; output: unknown }) => string | undefined
  metadata?: AuditMetadata
}

/**
 * SOURCE OF TRUTH KEYWORDS: PaginationOptions, PaginationContext
 *
 * WHAT:  `PaginationOptions` tunes defaults + max page size for a procedure;
 *        `PaginationContext` is the resolved `{ page, pageSize, skip, take }`
 *        delivered to handlers via `ctx.pagination`.
 * WHY:   Handlers stop reimplementing `skip = (page - 1) * pageSize` and the
 *        max-page-size guard sits in one place, preventing accidental DoS.
 * WHERE: Used by `ProtectedOptions['paginate']`; ctx slot read by paginated
 *        routers in src/trpc/routers/*.
 */
export interface PaginationOptions {
  defaultPage?: number
  defaultPageSize?: number
  maxPageSize?: number
}

export interface PaginationContext {
  page: number
  pageSize: number
  skip: number
  take: number
}

/**
 * SOURCE OF TRUTH KEYWORDS: ProtectedOptions, AUTO_DERIVED_FROM_RESOURCES
 *
 * WHAT:  The options bag that drives the entire protectedProcedure middleware.
 *        Holds only the concerns that CAN'T be derived from RESOURCES:
 *        role/permission gates (declared per-procedure), pagination, audit
 *        override, and tx timeout.
 * WHY:   Plan limits, plan flags, and usage counters are AUTO-DERIVED from
 *        the procedure path (`<resource>.<verb>`) against RESOURCES — there is
 *        no per-procedure opt-in or opt-out. The developer declares the limit
 *        / flag ONCE on the registry entry; the factory enforces it
 *        everywhere. This avoids the dual-source-of-truth bug where a router
 *        could "forget" to wire a limit that the plan tier already promised.
 *        See CLAUDE.md Pattern 2 (RESOURCES is the single source of truth)
 *        and Pattern 4 (naming drives behavior).
 * WHERE: Accepted by `protectedProcedure(options)`; consumed by the middleware
 *        body and by `writeAuditRow`.
 */
export interface ProtectedOptions {
  /** Member must hold one of these org roles (e.g. `['owner']`) to call. */
  requireRole?: string[]
  /** Member must hold this `resource:action` permission. Owners always pass. */
  requirePermission?: Permission
  paginate?: boolean | PaginationOptions
  /** `false` to opt out; object to override inferred fields. */
  audit?: boolean | AuditOverride
  /** Override mutation tx timeout (default 10_000ms). */
  txTimeout?: number
}

const DEFAULT_TX_TIMEOUT_MS = 10_000
const DEFAULT_TX_MAX_WAIT_MS = 5_000

/**
 * SOURCE OF TRUTH KEYWORDS: PaginationCtxFor
 *
 * WHAT:  Conditional type that resolves to `PaginationContext` when `paginate`
 *        is truthy on the options object, and `undefined` otherwise.
 * WHY:   Makes `ctx.pagination` non-nullable for handlers that asked for it and
 *        `undefined` for ones that didn't — no runtime guards needed.
 * WHERE: Used by `protectedProcedure`'s ctx augmentation and the
 *        `resolvePaginationFor` helper.
 */
/* `Exclude<O, undefined>` defeats distribution over the bare `undefined`
 * default; without it `PaginationCtxFor<undefined>` collapses to
 * `PaginationContext` and handlers without `paginate` see a non-nullable ctx. */
type PaginationCtxFor<O extends ProtectedOptions | undefined> =
  Exclude<O, undefined> extends { paginate: infer P }
    ? [P] extends [false | undefined]
      ? undefined
      : PaginationContext
    : undefined

/**
 * SOURCE OF TRUTH KEYWORDS: protectedProcedure
 *
 * WHAT:  Builds a procedure with auth + organization scoping + audit + tx +
 *        gates auto-wired from the procedure path and `ProtectedOptions`.
 * WHY:   `<resource>.create` auto-checks limits and increments counters;
 *        `<resource>.delete` auto-decrements; all mutations write an audit row
 *        inside the same transaction, so rollback is atomic with the handler's
 *        writes.
 * WHERE: Used by every router in src/trpc/routers/*. Options shape: see
 *        ProtectedOptions above.
 */
export function protectedProcedure<const O extends ProtectedOptions | undefined = undefined>(
  options?: O
) {
  return authProcedure.use(async (opts) => {
    // ─────────────────────────────────────────────────────────────────────
    // [1] REQUEST SETUP — capture start time and pull raw input safely
    //     so downstream gates can read `organizationId` and other fields.
    // ─────────────────────────────────────────────────────────────────────
    const startedAt = Date.now()
    const { ctx, next, type, path } = opts

    let rawInput: unknown
    try {
      rawInput = await opts.getRawInput()
    } catch {
      rawInput = {}
    }

    // ─────────────────────────────────────────────────────────────────────
    // [2] ORGANIZATION SCOPE — every protected call MUST carry an
    //     organizationId; this is the tenant boundary for the request.
    // ─────────────────────────────────────────────────────────────────────
    const organizationId = extractOrganizationId(rawInput)
    if (!organizationId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Organization ID is required' })
    }

    // ─────────────────────────────────────────────────────────────────────
    // [3] ONBOARDING GATE — block users who haven't created an org yet.
    //     Zero memberships ⇒ surface a structured `ONBOARDING_INCOMPLETE`.
    // ─────────────────────────────────────────────────────────────────────
    const memberships = await getUserMemberships(ctx.user.id)
    if (!memberships.length) {
      throw createStructuredError(
        'PRECONDITION_FAILED',
        'Please complete onboarding to access this feature',
        {
          errorCode: ERROR_CODES.ONBOARDING_INCOMPLETE,
          requiredStep: 'onboarding',
          message: 'You need to create an organization first',
        }
      )
    }

    // ─────────────────────────────────────────────────────────────────────
    // [4] MEMBERSHIP CHECK — verify the caller actually belongs to the
    //     organization they're targeting (prevents cross-tenant access).
    // ─────────────────────────────────────────────────────────────────────
    const member = memberships.find((m) => m.organizationId === organizationId)
    if (!member) {
      throw createStructuredError(
        'FORBIDDEN',
        'You do not have access to this organization',
        {
          errorCode: ERROR_CODES.NOT_ORGANIZATION_MEMBER,
          organizationId,
          message: 'User is not a member of the requested organization',
        }
      )
    }

    // ─────────────────────────────────────────────────────────────────────
    // [5] ROLE GATE — coarse-grained allowlist check against member.role
    //     (e.g. owner-only endpoints). Use `requireRole` in options.
    // ─────────────────────────────────────────────────────────────────────
    if (options?.requireRole && !options.requireRole.includes(member.role)) {
      throw createStructuredError(
        'FORBIDDEN',
        'You do not have permission to perform this action',
        {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: options.requireRole,
          current: member.role,
          message: `User role ${member.role} does not have required permissions`,
        }
      )
    }

    // ─────────────────────────────────────────────────────────────────────
    // [6] PERMISSION GATE — fine-grained RBAC check ("resource:action").
    //     Owners bypass; everyone else needs the explicit permission grant.
    // ─────────────────────────────────────────────────────────────────────
    if (options?.requirePermission) {
      const [resourcePart, actionPart] = options.requirePermission.split(':')
      if (!resourcePart || !actionPart) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Invalid permission format: ${options.requirePermission}. Expected format: "resource:action"`,
        })
      }
      const organizations = await ctx.getUserOrganizations()
      const org = organizations.find((o) => o.id === organizationId)
      const hasAccess =
        org?.role === 'owner' || org?.permissions.includes(options.requirePermission)
      if (!hasAccess) {
        throw createStructuredError(
          'FORBIDDEN',
          `You don't have permission to ${actionPart} ${resourcePart}`,
          {
            errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            required: [options.requirePermission],
            current: member.role,
            message: `Missing required permission: ${options.requirePermission}`,
          }
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // [7] PATH RESOLUTION — derive `<resource>.<verb>` from the procedure
    //     path so subsequent sections can auto-wire rate-limits, limits,
    //     usage counters, and audit rows by convention.
    // ─────────────────────────────────────────────────────────────────────
    /* Path-derived auto-wiring. Only single-dot `<resource>.<verb>` paths
     * match a RESOURCES entry; nested-router paths fall through to explicit
     * options, by design — implicit nested behavior would be too magical. */
    const pathResource = getResourceFromPath(path)
    const pathSegments = path.split('.')
    const pathAction = (pathSegments[pathSegments.length - 1] ?? '').toLowerCase()
    const resourceDef: ResourceDefinition | null = pathResource
      ? lookupResourceDef(pathResource)
      : null

    /* GUARDRAIL: a mutation whose `<resource>` segment isn't a RESOURCES key
     * silently bypasses every auto-wired behavior (limit, flag, counter,
     * audit). Fail loudly so the next agent has to add the resource to
     * RESOURCES — that is the only place these concerns are allowed to live
     * (CLAUDE.md Pattern 2). Queries are exempt — they never auto-wire
     * counters or audit anyway.
     *
     * The only sanctioned escape hatch is `audit: false` (token refresh, ping,
     * truly side-effect-free writes); permission or role declarations also
     * count because they prove the dev consciously scoped the procedure. */
    if (type === 'mutation' && pathResource === null) {
      const hasExplicitOverride =
        options?.audit !== undefined ||
        options?.requirePermission !== undefined ||
        options?.requireRole !== undefined
      if (!hasExplicitOverride) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Procedure "${path}" is a mutation whose first segment is not in RESOURCES. Add the resource to src/lib/resources.ts, OR declare an explicit option (audit / requirePermission / requireRole) to opt into a non-conventional path.`,
        })
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // [8] PER-RESOURCE RATE LIMIT — optional, declared on the RESOURCES
    //     entry. Stacks on top of the global limiter in baseProcedure.
    // ─────────────────────────────────────────────────────────────────────
    /* Per-resource rate limiter — stacks on top of the global baseProcedure cap. */
    const rateLimitCfg = resourceDef?.rateLimit?.[pathAction]
    if (rateLimitCfg && pathResource) {
      const limiter = getResourceLimiter(
        pathResource,
        pathAction,
        rateLimitCfg.count,
        rateLimitCfg.window
      )
      const requestHeaders = await headers()
      const identifier = `${ctx.user.id}:${organizationId}:${getClientIp(requestHeaders)}`
      const result = await checkRateLimit(limiter, identifier)
      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many ${pathAction} requests for ${pathResource}. Try again in ${retryAfter}s.`,
          cause: {
            errorCode: ERROR_CODES.RATE_LIMITED,
            limit: result.limit,
            remaining: result.remaining,
            resetAt: result.resetAt,
            retryAfter,
            message: `Resource rate limit exceeded.`,
          },
        })
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // [9] PLAN LIMIT GATE (AUTO_DERIVED_FROM_RESOURCES)
    //     Fires on every `<resource>.create` where the resource declares a
    //     `limit` in RESOURCES. No opt-in, no opt-out — the registry IS the
    //     contract. Unlimited plans are handled trivially by checkFeatureGate
    //     (returns allowed immediately when the resolved cap is Infinity), so
    //     "skipping the check" is unnecessary: the check is already a no-op
    //     when the plan grants unlimited.
    // ─────────────────────────────────────────────────────────────────────
    const limitToCheck: LimitResourceKey | null =
      pathAction === 'create' && isLimitResource(pathResource) ? pathResource : null
    if (limitToCheck) {
      const gateResult = await checkFeatureGate(organizationId, limitToCheck, 1)
      if (!gateResult.allowed) {
        throw createStructuredError(
          'FORBIDDEN',
          gateResult.reason || 'Plan limit reached',
          {
            errorCode: ERROR_CODES.USAGE_LIMIT_REACHED,
            resource: limitToCheck,
            limit: gateResult.limit ?? 0,
            current: gateResult.currentUsage ?? 0,
            upgradeRequired: true,
            message:
              gateResult.reason ||
              'You have reached your plan limit for this feature',
          }
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // [10] FEATURE FLAG GATE (AUTO_DERIVED_FROM_RESOURCES)
    //      Fires on EVERY verb (query or mutation) of a resource whose
    //      RESOURCES entry declares a `flag`. The flag is a plan-tier
    //      entitlement; if the plan doesn't include the feature, the user
    //      can't read it OR write it. Declared once on the registry entry,
    //      enforced everywhere — no per-procedure opt-in.
    // ─────────────────────────────────────────────────────────────────────
    if (isFlagResource(pathResource)) {
      const enabled = await checkBooleanFeature(organizationId, pathResource)
      if (!enabled) {
        const flagDef = RESOURCES[pathResource]
        throw createStructuredError(
          'FORBIDDEN',
          `${flagDef.name} is not available on your current plan`,
          {
            errorCode: ERROR_CODES.FEATURE_NOT_AVAILABLE,
            resource: pathResource,
            currentPlan: 'unknown',
            upgradeRequired: true,
            message: `${flagDef.name} is locked on the current plan. Upgrade to access it.`,
          }
        )
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // [11] PAGINATION — resolve `{page, pageSize, skip, take}` once so
    //      handlers that opted in get a typed `ctx.pagination` slot.
    // ─────────────────────────────────────────────────────────────────────
    const pagination = resolvePaginationFor(options, rawInput)

    // ─────────────────────────────────────────────────────────────────────
    // [12] CONTEXT ENRICHMENT — attach organization, memberRole, and
    //      pagination so handlers don't re-fetch what we already resolved.
    // ─────────────────────────────────────────────────────────────────────
    const enrichedCtxBase = {
      ...ctx,
      organization: member.organization,
      memberRole: member.role,
      pagination,
    }

    // ─────────────────────────────────────────────────────────────────────
    // [13] USAGE-COUNTER PLAN (AUTO_DERIVED_FROM_RESOURCES)
    //      `.create` increments, `.delete` decrements — always, for every
    //      resource that declares a `limit` in RESOURCES. The bump runs
    //      inside the tx below so it rolls back atomically if the handler
    //      throws. No opt-out: counters always reflect reality, even on
    //      unlimited plans where the limit check is a trivial no-op (the
    //      counter still powers UI affordances and usage analytics).
    // ─────────────────────────────────────────────────────────────────────
    const bumpResource: LimitResourceKey | null =
      type === 'mutation' &&
      (pathAction === 'create' || pathAction === 'delete') &&
      isLimitResource(pathResource)
        ? pathResource
        : null
    const bumpDirection: 'increment' | 'decrement' | null = bumpResource
      ? pathAction === 'create'
        ? 'increment'
        : 'decrement'
      : null

    // ─────────────────────────────────────────────────────────────────────
    // [14] HANDLER EXECUTION
    //      - mutation: run inside a Prisma `$transaction` so the handler,
    //        the usage-counter bump, and the audit row all commit (or roll
    //        back) atomically.
    //      - query: skip the transaction; pass the plain prisma client.
    // ─────────────────────────────────────────────────────────────────────
    /* Type `result` against the AUGMENTED next-call so enriched fields
     * (organization, memberRole, pagination, db) flow to handlers. The plain
     * `Awaited<ReturnType<typeof next>>` pins to the base auth ctx. */
    type EnrichedCtx = typeof enrichedCtxBase & { db: Prisma.TransactionClient }
    let result: Awaited<ReturnType<typeof next<EnrichedCtx>>>

    try {
      if (type === 'mutation') {
        /* tRPC's `next()` swallows handler errors and returns `{ok:false,error}`
         * rather than throwing. Returning that envelope from `$transaction`
         * lets Prisma commit. We throw inside the tx callback to force
         * rollback, then re-surface the envelope outside. */
        let handlerResult: Awaited<ReturnType<typeof next<EnrichedCtx>>> | undefined
        const txTimeout = options?.txTimeout ?? DEFAULT_TX_TIMEOUT_MS
        try {
          await prisma.$transaction(
            async (tx) => {
              handlerResult = await next({ ctx: { ...enrichedCtxBase, db: tx } })
              if (!handlerResult.ok) throw handlerResult.error

              if (bumpResource && bumpDirection === 'increment') {
                await incrementUsage(organizationId, bumpResource, 1, tx)
              } else if (bumpResource && bumpDirection === 'decrement') {
                const qty = computeDeleteDecrement(handlerResult.data)
                if (qty > 0) {
                  await decrementUsage(organizationId, bumpResource, qty, tx)
                }
              }

              if (options?.audit !== false) {
                await writeAuditRow({
                  tx,
                  options,
                  ctx,
                  organizationId,
                  rawInput,
                  result: handlerResult.data,
                  pathResource,
                  pathAction,
                  resourceDef,
                })
              }
            },
            { timeout: txTimeout, maxWait: DEFAULT_TX_MAX_WAIT_MS }
          )
          if (!handlerResult) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Transaction completed without producing a handler result',
            })
          }
          result = handlerResult
        } catch (txError) {
          /* If the handler itself errored, surface its original envelope so
           * tRPC's error path stays intact. Otherwise re-throw to outer catch. */
          if (handlerResult && !handlerResult.ok) {
            result = handlerResult
          } else {
            throw txError
          }
        }
      } else {
        result = await next({ ctx: { ...enrichedCtxBase, db: prisma } })
      }
    // ─────────────────────────────────────────────────────────────────────
    // [15] ERROR OBSERVABILITY — emit a structured error log line, then
    //      re-throw so tRPC's normal error path returns the response.
    // ─────────────────────────────────────────────────────────────────────
    } catch (error) {
      logRequest({
        level: 'error',
        path,
        type,
        userId: ctx.user.id,
        organizationId,
        durationMs: Date.now() - startedAt,
        status: 'error',
        errorCode:
          error instanceof TRPCError
            ? error.code
            : error instanceof Error
              ? error.name
              : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    // ─────────────────────────────────────────────────────────────────────
    // [16] SUCCESS OBSERVABILITY — log duration + path on the happy path
    //      and return the handler result to tRPC.
    // ─────────────────────────────────────────────────────────────────────
    logRequest({
      level: 'info',
      path,
      type,
      userId: ctx.user.id,
      organizationId,
      durationMs: Date.now() - startedAt,
      status: 'ok',
    })

    return result
  })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readIdField(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const id = value['id']
  return typeof id === 'string' ? id : undefined
}

function isLimitResource(key: ResourceKey | null): key is LimitResourceKey {
  if (!key) return false
  return (LIMIT_RESOURCE_KEYS as readonly string[]).includes(key)
}

function isFlagResource(key: ResourceKey | null): key is FlagResourceKey {
  if (!key) return false
  return (FLAG_RESOURCE_KEYS as readonly string[]).includes(key)
}

function lookupResourceDef(key: ResourceKey): ResourceDefinition | null {
  for (const [entryKey, def] of RESOURCE_ENTRIES) {
    if (entryKey === key) return def
  }
  return null
}

function extractOrganizationId(rawInput: unknown): string | undefined {
  if (!isRecord(rawInput)) return undefined
  const rawOrgId = rawInput['organizationId']
  /* Strict typeof string blocks coercion attacks (object with toString). */
  if (typeof rawOrgId !== 'string' || rawOrgId.length === 0) return undefined
  return rawOrgId
}

/* Deletes that don't actually delete anything (count===0) must not drift the
 * usage counter — see CLAUDE.md DELETE NO-OP rule. */
function computeDeleteDecrement(result: unknown): number {
  if (!result) return 0
  if (isRecord(result) && typeof result['count'] === 'number') {
    return result['count'] > 0 ? result['count'] : 0
  }
  return 1
}

function logRequest(line: {
  level: 'info' | 'error'
  path: string
  type: 'query' | 'mutation' | 'subscription'
  userId: string
  organizationId: string
  durationMs: number
  status: 'ok' | 'error'
  errorCode?: string
  errorMessage?: string
}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), logger: 'trpc', ...line }))
}

function resolvePaginationFor<O extends ProtectedOptions | undefined>(
  options: O,
  rawInput: unknown
): PaginationCtxFor<O> {
  const runtimeValue = options?.paginate
    ? computePagination(options.paginate, rawInput)
    : undefined
  /* TS can't follow the biconditional `paginate truthy ⇔ ctx is PaginationContext`
   * through the local; the runtime value matches the conditional return type
   * by construction, so this widening is the lone justified boundary cast. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- documented above
  return runtimeValue as any as PaginationCtxFor<O>
}

function computePagination(
  paginate: true | PaginationOptions,
  rawInput: unknown
): PaginationContext {
  const cfg = typeof paginate === 'object' ? paginate : {}
  const defaultPage = cfg.defaultPage ?? 1
  const defaultPageSize = cfg.defaultPageSize ?? 20
  const maxPageSize = cfg.maxPageSize ?? 100

  let page = defaultPage
  let pageSize = defaultPageSize

  if (isRecord(rawInput)) {
    const candidatePage = rawInput['page']
    const candidatePageSize = rawInput['pageSize']
    if (typeof candidatePage === 'number' && Number.isFinite(candidatePage) && candidatePage >= 1) {
      page = Math.floor(candidatePage)
    }
    if (
      typeof candidatePageSize === 'number' &&
      Number.isFinite(candidatePageSize) &&
      candidatePageSize >= 1
    ) {
      pageSize = Math.min(maxPageSize, Math.floor(candidatePageSize))
    }
  }

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

/* Audit row written inside the mutation tx so it commits atomically with the
 * handler's writes. See CLAUDE.md RULE 5. */
async function writeAuditRow(args: {
  tx: Prisma.TransactionClient
  options: ProtectedOptions | undefined
  ctx: { user: { id: string } }
  organizationId: string
  rawInput: unknown
  result: unknown
  pathResource: ResourceKey | null
  pathAction: string
  resourceDef: ResourceDefinition | null
}): Promise<void> {
  const {
    tx,
    options,
    ctx,
    organizationId,
    rawInput,
    result,
    pathResource,
    pathAction,
    resourceDef,
  } = args

  const override = typeof options?.audit === 'object' ? options.audit : undefined

  const fullPath = pathResource !== null ? `${pathResource}.${pathAction}` : pathAction
  const segments = fullPath.split('.')
  const lastSegment = segments[segments.length - 1] ?? 'unknown'
  const inferred = {
    action: lastSegment,
    entity: segments.slice(0, -1).join('.') || lastSegment,
  }

  const action = override?.action ?? inferred.action
  const entity: AuditEntityName =
    override?.entity ?? (pathResource ?? toFallbackEntity(inferred.entity))

  const entityId =
    override?.getEntityId?.({ input: rawInput, output: result }) ??
    readIdField(result) ??
    readIdField(rawInput)

  const templateFromResource = resourceDef?.audit?.describe?.[pathAction] ?? null
  const template = override?.describe ?? templateFromResource
  const description = template
    ? interpolateAuditDescribe(template, { input: rawInput, output: result })
    : undefined

  let metadata: AuditMetadata | undefined
  if (override?.metadata !== undefined) {
    metadata = auditMetadataSchema.parse(override.metadata)
  }

  const forensics = await getRequestForensics()

  /* Transient audit failures are swallowed (logged to stderr) so the user's
   * action still commits — the tx is already in success path here. */
  try {
    await logActivity(
      {
        userId: ctx.user.id,
        organizationId,
        action,
        entity,
        entityId,
        description,
        metadata,
        ipAddress: forensics.ipAddress,
        userAgent: forensics.userAgent,
      },
      tx
    )
  } catch (auditError) {
    console.error('[protectedProcedure] audit write failed:', auditError)
  }
}

function toFallbackEntity(inferred: string): AuditEntityName {
  const known: ReadonlyArray<AuditEntityName> = [
    'organization',
    'subscription',
    'session',
    'member',
    'role',
  ]
  for (const candidate of known) {
    if (candidate === inferred) return candidate
  }
  /* Audit-fidelity loss: a nested-router or non-RESOURCES path resolved to
   * `inferred` which isn't in AuditEntityName. We squash to `'organization'`
   * so the audit row stores something, but the developer should either add
   * `inferred` to AuditEntityName in src/services/activity-log.service.ts or
   * declare an explicit `audit: { entity }` override on the procedure. */
  console.warn(
    `[protectedProcedure] audit entity "${inferred}" not in AuditEntityName — falling back to "organization". Add it to the union or set an explicit audit.entity override.`
  )
  return 'organization'
}
