<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Procedures and routers

Every protected tRPC procedure goes through one function: `protectedProcedure(options?)` in `src/trpc/procedures/protected.ts`. We call it the procedure builder. It handles every cross-cutting concern so your handler can be pure business logic.

## The convention

Name your procedure `<resource>.<verb>` where `<resource>` matches a key in the registry. The procedure builder reads the path and wires up:

| Path           | What happens automatically                                       |
| -------------- | ---------------------------------------------------------------- |
| `x.create`     | Checks the plan limit. Increments the usage counter. Audits.     |
| `x.delete`     | Decrements the usage counter (clamped at zero). Audits.          |
| `x.update`     | Audits with `action='update'`.                                   |
| `x.<anything>` | Audits with `action='<anything>'`. No counter, no limit gate.    |

You write the database call. The builder does the rest.

```ts
create: protectedProcedure({ requirePermission: permissions.PROJECTS_CREATE })
  .input(z.object({ organizationId: z.string(), name: z.string().min(1) }))
  .mutation(({ ctx, input }) =>
    ctx.db.project.create({ data: { organizationId: input.organizationId, name: input.name } })
  )
```

Notice what isn't there: no auth check, no transaction, no `logActivity` call, no `incrementUsage`. All of that runs around your handler.

## Options

Pass options when the convention doesn't fit or you want to declare a gate.

| Option              | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `requireRole`       | Member must hold one of these roles.                                    |
| `requirePermission` | Member must hold this permission. Owners bypass.                        |
| `requireLimit`      | Force a limit check even when the path isn't `<x>.create`.              |
| `requireFlag`       | Resource flag must be on for the org's plan.                            |
| `paginate`          | Computes `ctx.pagination` from `page` / `pageSize` input.               |
| `audit`             | `false` to skip; object to override entity, action, description.        |
| `skipUsageBump`     | Don't bump the counter even if the path is `<x>.create` / `.delete`.    |
| `skipLimitCheck`    | Don't check the limit on `<x>.create`.                                  |
| `txTimeout`         | Override the transaction timeout (default 10s).                         |

## When the convention doesn't fit

Sometimes a verb consumes a quota but isn't `create`. For example, a `forms.publish` action that should still count against the `forms` limit:

```ts
publish: protectedProcedure({ requireLimit: 'forms' })
  .input(z.object({ organizationId: z.string(), formId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const form = await ctx.db.form.findFirst({
      where: { id: input.formId, organizationId: input.organizationId },
    })
    if (!form) throw new TRPCError({ code: 'NOT_FOUND' })
    if (form.publishedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already published' })
    return ctx.db.form.update({ where: { id: form.id }, data: { publishedAt: new Date() } })
  })
```

## What ctx gives you

Inside a protected handler:

- `ctx.db` — Prisma client. Inside a mutation it's the transaction client. Always use this for writes.
- `ctx.user` — the signed-in user.
- `ctx.session` — the session.
- `ctx.organization` — the active org.
- `ctx.memberRole` — the member's role string.
- `ctx.pagination` — present when `paginate: true` was passed.
- `ctx.prisma` — the singleton (fine for reads outside the transaction).

## Routers

A router is a file under `src/trpc/routers/` that exports a `createTRPCRouter({...})` object. **Business logic lives in the handler bodies.** See `docs/07-adding-a-feature.md` for a full example.

## Services

A service is a function that does one Prisma call. That's it.

```ts
import 'server-only'
import type { Prisma, PrismaClient } from '@/generated/prisma'

type DbClient = PrismaClient | Prisma.TransactionClient

export async function listDocuments(
  db: DbClient,
  organizationId: string,
  pagination: { skip: number; take: number }
) {
  const [items, total] = await Promise.all([
    db.document.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    }),
    db.document.count({ where: { organizationId } }),
  ])
  return { items, total }
}
```

The `db` parameter is the seam. The router passes `ctx.db` so the call commits inside the transaction. A background job passes the singleton.

**You don't need a service file for trivial CRUD.** `ctx.db.document.create({ data: input })` inline in the router is fine. Add a service when the same query (with its filters and ordering) is used from more than one place.

Services never call auth checks, never write audit rows, never open transactions, never bump counters. If you're tempted to do any of that — you're in router territory.

## Where things go

| What                                                | Where                                  |
| --------------------------------------------------- | -------------------------------------- |
| Pure DB call, used once                             | Router (`ctx.db.X.method`)             |
| Pure DB call, reused                                | Service (`src/services/*.service.ts`)  |
| Business rule, validation, orchestration            | Router handler body                    |
| Auth, audit, transactions, gates                    | Procedure options (or automatic)       |
| Gate computation, audit infrastructure, rate limits | `src/lib/`                             |

## Things to never do in a handler

- `prisma.$transaction(...)` — you're already inside one.
- `await logActivity(...)` — auto-audit will fire too and you'll duplicate the row.
- `incrementUsage(...)` on a `.create` path — the builder does it.
- `if (memberRole !== 'owner') throw` — use `requireRole`.
- Compute `skip` / `take` from input — use `paginate: true`.
- Import `prisma` directly for writes — use `ctx.db`.

## The base procedures

`protectedProcedure` is built on top of two simpler ones:

- **`baseProcedure`** — public, rate-limited. Use it for webhooks and health checks.
- **`authProcedure`** — requires a logged-in user, no org scope. Use it for endpoints like "list my organizations".

Anything that touches tenant data should use `protectedProcedure`. That's what gives you the conventions.

## Request-scoped caching

Service-layer reads that get called many times per request should wrap themselves in React's `cache()`:

```ts
import { cache } from 'react'

export const getUserMemberships = cache(async (userId: string) => {
  return prisma.member.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'desc' },
  })
})
```

Within one request — even if 12 server components ask for the same data — the function runs once. Across requests it runs fresh.

Don't reach for Redis to cache query results. Redis here is for rate limiting only. Build, measure, then add cross-request caching where profiling proves it's needed.
