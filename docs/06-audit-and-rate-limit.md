<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Audit and rate limit

Two cross-cutting concerns sit at the edge of every request.

## Audit logging

Every successful protected mutation writes exactly one row to `ActivityLog`. The write happens inside the same transaction as the handler's writes — audit and business data commit together, or roll back together.

### What gets recorded

| Column           | Source                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------- |
| `userId`         | `ctx.user.id`                                                                          |
| `organizationId` | The `organizationId` field on the input.                                               |
| `action`         | The verb from the procedure path (`create`, `delete`, …), or `audit.action`.           |
| `entity`         | The resource from the procedure path, or `audit.entity`.                               |
| `entityId`       | First match of: `audit.getEntityId(...)`, `output.id`, `input.id`. Optional.           |
| `description`    | Interpolated from `RESOURCES[x].audit.describe[verb]` or `audit.describe`. Optional.   |
| `metadata`       | Optional, narrow shape — zod-validated.                                                |
| `ipAddress`      | From `getRequestForensics()`. **Forensic only.**                                       |
| `userAgent`      | From `getRequestForensics()`. **Forensic only.**                                       |

### Description templates

Templates live on the registry entry. They support `{input.field}` and `{output.field}`:

```ts
projects: {
  audit: {
    describe: {
      create: 'Created project {output.name}',
      delete: 'Deleted project {input.id}',
    },
  },
}
```

Missing keys render as the literal placeholder. The interpolator only goes one level deep.

For a one-off override without editing the registry:

```ts
update: protectedProcedure({
  audit: { describe: 'Renamed project {output.name}' },
})
```

### Metadata is narrow on purpose

`AuditMetadata` is a `z.strictObject` with four optional fields: `changedFields`, `previousValue`, `newValue`, `data`. Values are limited to `string | number | boolean | null`. Unknown keys are rejected. The point is to keep audit payloads diff-friendly and stop accidental PII from leaking in.

### Opt-outs and overrides

| Situation                                  | What to pass                                                   |
| ------------------------------------------ | -------------------------------------------------------------- |
| Token refresh, ping, no-op write           | `audit: false`                                                 |
| Standard create / update / delete          | Nothing — automatic.                                           |
| Custom entity name or verb                 | `audit: { entity: 'organization', action: 'transferOwnership' }` |
| One-off description override               | `audit: { describe: '...' }`                                   |
| Custom entity-id extraction                | `audit: { getEntityId: ({ input, output }) => ... }`           |

**Don't call `logActivity()` from a router.** Auto-audit will fire too and you'll get duplicate rows.

### The safe-select boundary

`AUDIT_LOG_SAFE_SELECT` in `src/services/activity-log.service.ts` is the only select used by the read path. It deliberately omits `ipAddress` and `userAgent`. Treat that select as a security boundary — adding either field would expose every member's IP to every other member.

The `AuditLogEntry` type is derived from this select via `Prisma.ActivityLogGetPayload`, so changes flow through to the wire shape automatically.

### Reading the audit log

`auditLogs.list` in `src/trpc/routers/audit-logs.ts` is the read path. Filters: `action`, `entity`, `userId`, `fromDate`, `toDate`, and a `search` field that matches across description, entity, entityId, action, and user name.

## Rate limiting

The rate limiter is Upstash-backed. Three limiters ship out of the box.

### Global API limiter

`apiLimiter` (100 per 10s sliding window) runs at two points:

- `src/proxy.ts` ingress for `/api/trpc/*` — broad per-IP cap.
- `baseProcedure` in the tRPC layer — keyed by user ID if known, else by `ip:<getClientIp>`.

### Auth limiter

`authLimiter` (10 per 60s) runs at the proxy for `POST /api/auth/*`. Tight on purpose — brute force and credential stuffing protection.

### Per-resource overrides

A resource can declare its own rate-limit map keyed by action:

```ts
invitation: {
  name: 'Invitations',
  permissions: ['create', 'cancel'],
  rateLimit: {
    create: { count: 10, window: '1 m' },
  },
}
```

The procedure builder looks up `RESOURCES[<path resource>].rateLimit?.[<path verb>]` and, if it finds a config, runs an extra limiter before the gates. The identifier combines `userId:organizationId:ip` so abuse is scoped tightly.

### Fail-open

When `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are unset, the limiter builders return `null` and `checkRateLimit` returns `{ allowed: true }`. Same on Redis errors at runtime. Rate limiting is a guardrail, not the only line of defense — refusing all traffic on a Redis outage is almost always worse than letting more through.

Configure Redis in production. Locally it's optional.

### IP precedence

`getClientIp(headers)` in `src/lib/rate-limit.ts` checks these in order:

1. `x-vercel-forwarded-for` (first entry)
2. `cf-connecting-ip`
3. `x-real-ip`
4. `x-forwarded-for` (last entry only)

Platform-injected headers come first because the edge rewrites them. The last entry of `x-forwarded-for` is only safe because the edge strips inbound client-supplied XFF.

### Rate-limit headers

`buildRateLimitHeaders(result)` emits IETF-draft `RateLimit-*` headers plus `Retry-After` on a block. The proxy uses them on 429. The tRPC error path puts the same data inside `cause` (the structured `RATE_LIMITED` error) so clients can render a precise retry timer.

## Redis is not a query cache

Redis here is for rate limiting only. **No service caches reads in Redis. No router invalidates Redis on mutation.** Within one request, React's `cache()` already dedupes service reads. Cross-request query caching (Redis, `unstable_cache`, anything else) is out of scope for this boilerplate — see CLAUDE.md Pattern 12.
