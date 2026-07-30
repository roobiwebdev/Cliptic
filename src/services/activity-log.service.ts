/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: logActivity, getOrganizationAuditLogs, getPlatformActivityLogs,
 *   AuditLogEntry, AuditLogPage, ActivityAction, LogActivityInput,
 *   AuditMetadata, auditMetadataSchema, AuditEntityName
 *
 * WHAT:  Pure Prisma DB access for the ActivityLog table — one write
 *        (logActivity) and one paginated read (getOrganizationAuditLogs).
 * WHY:   Audit writes are automatic — the protected procedure factory calls
 *        logActivity inside the handler's transaction, so routers must NOT
 *        call it again. No business logic lives here; the file is a thin
 *        wrapper around two Prisma queries plus the safe-select boundary.
 * WHERE: Writes invoked from src/trpc/procedures/protected.ts auto-audit; the
 *        read path powers src/trpc/routers/audit-logs.ts.
 */

import 'server-only'
import { z } from 'zod'
import { prisma, type DbClient } from '@/lib/config'
import type { Prisma } from '@/generated/prisma'
import type { ResourceKey } from '@/lib/resources'

/**
 * SOURCE OF TRUTH KEYWORDS: ActivityAction
 *
 * WHAT:  Action verb stored on each audit row.
 * WHY:   Canonical CRUD verbs auto-derive from procedure paths; the branded
 *        string lets routers declare custom verbs without losing type safety.
 * WHERE: Set by protected procedure auto-audit and by explicit `audit.action`
 *        overrides in router options.
 */
export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | (string & { __activityAction?: never })

type AuditMetadataPrimitive = string | number | boolean | null

/**
 * SOURCE OF TRUTH KEYWORDS: AuditMetadata
 *
 * WHAT:  Strict shape for the JSON `metadata` column on activity rows.
 * WHY:   Primitives only — keeps audit payloads diff-friendly and prevents
 *        accidental PII (objects/arrays of objects) leaking into the log.
 * WHERE: Validated by auditMetadataSchema before write inside logActivity.
 */
export interface AuditMetadata {
  changedFields?: string[] | undefined
  previousValue?: AuditMetadataPrimitive | AuditMetadataPrimitive[] | undefined
  newValue?: AuditMetadataPrimitive | AuditMetadataPrimitive[] | undefined
  data?: Record<string, AuditMetadataPrimitive> | undefined
}

const auditMetadataPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

/**
 * SOURCE OF TRUTH KEYWORDS: auditMetadataSchema
 *
 * WHAT:  Zod schema mirroring AuditMetadata; runtime guard for JSON writes.
 * WHY:   strictObject rejects unknown keys so callers can't quietly inflate
 *        the audit payload past the typed contract.
 * WHERE: Used by logActivity before persisting `metadata`.
 */
export const auditMetadataSchema = z.strictObject({
  changedFields: z.array(z.string()).optional(),
  previousValue: z
    .union([auditMetadataPrimitiveSchema, z.array(auditMetadataPrimitiveSchema)])
    .optional(),
  newValue: z
    .union([auditMetadataPrimitiveSchema, z.array(auditMetadataPrimitiveSchema)])
    .optional(),
  data: z.record(z.string(), auditMetadataPrimitiveSchema).optional(),
})

/**
 * SOURCE OF TRUTH KEYWORDS: AuditEntityName
 *
 * WHAT:  Union of entity names that may appear on an audit row.
 * WHY:   Either a RESOURCES key or one of the Better-Auth-owned entities; the
 *        named list keeps log queries filterable from a typed enum.
 * WHERE: Stored as `entity` on ActivityLog rows; set by protected procedure
 *        auto-audit from the procedure path.
 */
export type AuditEntityName =
  | ResourceKey
  | 'organization'
  | 'subscription'
  | 'session'
  | 'member'
  | 'role'

/**
 * SOURCE OF TRUTH KEYWORDS: LogActivityInput
 *
 * WHAT:  Input contract for logActivity — every field required to render one
 *        audit row.
 * WHY:   userId/organizationId are mandatory so audit rows always carry a
 *        scoping key; ipAddress/userAgent are optional and excluded from reads.
 * WHERE: Constructed by protected procedure auto-audit from ctx + procedure
 *        metadata.
 */
export interface LogActivityInput {
  userId: string
  organizationId: string
  action: ActivityAction
  entity: AuditEntityName
  entityId?: string | null | undefined
  description?: string | undefined
  metadata?: AuditMetadata | undefined
  ipAddress?: string | null | undefined
  userAgent?: string | null | undefined
}

/**
 * SOURCE OF TRUTH KEYWORDS: AuditLogEntry
 *
 * WHAT:  The exact shape returned by getOrganizationAuditLogs, derived from
 *        AUDIT_LOG_SAFE_SELECT.
 * WHY:   Type is generated from the select so adding a column to the select
 *        flows through to all consumers without manual surgery.
 * WHERE: Returned inside AuditLogPage to the audit-logs tRPC router.
 */
export type AuditLogEntry = Prisma.ActivityLogGetPayload<{
  select: typeof AUDIT_LOG_SAFE_SELECT
}>

/**
 * SOURCE OF TRUTH KEYWORDS: AuditLogPage
 *
 * WHAT:  Paginated wrapper around AuditLogEntry plus page math.
 * WHY:   Single shape lets the table compute totalPages without re-deriving
 *        from skip/take on the client.
 * WHERE: Returned by getOrganizationAuditLogs to the audit-logs router.
 */
export interface AuditLogPage {
  logs: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * SOURCE OF TRUTH KEYWORDS: logActivity
 *
 * WHAT:  Writes one ActivityLog row from a validated LogActivityInput.
 * WHY:   Routers must NOT call this — protected procedure auto-audit already
 *        does, so explicit calls produce duplicate rows.
 * WHERE: Called only from src/trpc/procedures/protected.ts auto-audit; receives
 *        the active tx as `db`.
 */
// Pass `db` as the active TransactionClient so the audit row commits with the
// underlying mutation. Falling back to the singleton is only safe outside the
// request lifecycle. Pure DB access — runtime validation of `input.metadata`
// is the caller's responsibility (the factory parses with auditMetadataSchema
// before calling); the typed `AuditMetadata` shape is JSON-safe by construction.
export async function logActivity(
  input: LogActivityInput,
  db: DbClient = prisma
): Promise<void> {
  await db.activityLog.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      description: input.description ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      ...(input.metadata !== undefined && {
        metadata: input.metadata as Prisma.InputJsonValue,
      }),
    },
  })
}

// Security boundary: do NOT add `ipAddress` or `userAgent` here. The dashboard
// renders this shape; including forensic fields would expose every member's IP
// to every other member. AuditLogEntry is derived from this select.
const AUDIT_LOG_SAFE_SELECT = {
  id: true,
  userId: true,
  organizationId: true,
  action: true,
  entity: true,
  entityId: true,
  description: true,
  metadata: true,
  createdAt: true,
  user: {
    select: {
      name: true,
      image: true,
    },
  },
} as const

/**
 * SOURCE OF TRUTH KEYWORDS: getOrganizationAuditLogs
 *
 * WHAT:  Paginated audit-log reader with action/entity/user/date/search filters.
 * WHY:   Uses AUDIT_LOG_SAFE_SELECT so forensic columns (ipAddress, userAgent)
 *        never reach the dashboard or other members of the org.
 * WHERE: Sole consumer is src/trpc/routers/audit-logs.ts (permission-gated).
 */
/**
 * SOURCE OF TRUTH KEYWORDS: getPlatformActivityLogs
 *
 * WHAT:  Platform-wide (all organizations) audit-log page for the /portal admin
 *        console.
 * WHY:   The portal operator needs cross-tenant visibility. Reuses
 *        AUDIT_LOG_SAFE_SELECT so forensic columns (ipAddress, userAgent) are
 *        never exposed even to the platform admin — the boundary holds here too.
 * WHERE: Called by portal.service (portal-admin gated).
 */
export async function getPlatformActivityLogs(skip: number, take: number): Promise<AuditLogPage> {
  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      select: AUDIT_LOG_SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.activityLog.count(),
  ])
  const pageSize = Math.max(1, take)
  return {
    logs,
    total,
    page: Math.floor(skip / pageSize) + 1,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

export async function getOrganizationAuditLogs(
  filters: {
    organizationId: string
    action?: string | undefined
    entity?: string | undefined
    userId?: string | undefined
    fromDate?: Date | undefined
    toDate?: Date | undefined
    search?: string | undefined
  },
  skip: number,
  take: number
): Promise<AuditLogPage> {
  const where: Prisma.ActivityLogWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.action && { action: filters.action }),
    ...(filters.entity && { entity: filters.entity }),
    ...(filters.userId && { userId: filters.userId }),
    ...((filters.fromDate || filters.toDate) && {
      createdAt: {
        ...(filters.fromDate && { gte: filters.fromDate }),
        ...(filters.toDate && { lte: filters.toDate }),
      },
    }),
    ...(filters.search && {
      OR: [
        { description: { contains: filters.search, mode: 'insensitive' as const } },
        { entity: { contains: filters.search, mode: 'insensitive' as const } },
        { entityId: { contains: filters.search, mode: 'insensitive' as const } },
        { action: { contains: filters.search, mode: 'insensitive' as const } },
        { user: { name: { contains: filters.search, mode: 'insensitive' as const } } },
      ],
    }),
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      select: AUDIT_LOG_SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.activityLog.count({ where }),
  ])

  const pageSize = Math.max(1, take)
  const page = Math.floor(skip / pageSize) + 1

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}
