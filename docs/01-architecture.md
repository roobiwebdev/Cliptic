<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Architecture

The whole codebase is built around two ideas.

**One: there's a single file that describes every feature.** `src/lib/resources.ts` lists every permission, plan limit, plan flag, sidebar item, audit template, and rate-limit override your app has. It's called the registry.

**Two: there's a single function that builds every protected tRPC procedure.** It reads the registry and wires up everything tedious — auth, permission checks, transactions, audit logs, usage counters. You only write the business logic.

When those two ideas work together, you barely write any plumbing.

## The layers

```
UI                      React + tRPC client + <FeatureGate>
tRPC routers            src/trpc/routers/*.ts    — your business logic
Procedure builder       src/trpc/procedures/protected.ts  — auth, audit, tx, gates
Services                src/services/*.service.ts — pure Prisma queries (optional)
Infrastructure          src/lib/* — registry, gates, rate limit, errors, auth
Prisma                  prisma/schema.prisma + src/generated/prisma
```

Routers and the client share one `AppRouter` type. No DTOs.

## What you write vs what the codebase writes

When you add a feature, you touch:

1. `prisma/schema.prisma` — your model
2. `src/lib/resources.ts` — one registry entry
3. `src/trpc/routers/<your-feature>.ts` — input schemas plus the business logic
4. `src/trpc/routers/_app.ts` — one line to mount the router
5. `src/services/<your-feature>.service.ts` — optional, only when a query is reused

The codebase handles the rest: permission checks, audit logs, plan-limit gates, usage counters, transactions, rate limits, sidebar entries, optimistic UI updates.

## Where business logic lives

In the router. Not in services.

Services are pure Prisma. One verb against one table. No auth, no audit, no transactions, no business rules. You don't even need a service file for trivial CRUD — `ctx.db.document.create({ data: input })` inline in the router is fine.

## What a request looks like

A user clicks "Create project". Here's the path:

1. The client calls `trpc.projects.create.mutate({ organizationId, name })`.
2. tRPC routes the call to `projects.create`.
3. Global rate limit check.
4. Auth check (session resolved once per request, cached).
5. Membership check — is this user in this org?
6. Optional gates run: role, permission, plan limit, plan flag.
7. A database transaction opens. The handler runs with `ctx.db` set to the transaction client.
8. Your handler runs — `ctx.db.project.create({ ... })`.
9. The usage counter for `projects` bumps by one.
10. An audit row is written.
11. The transaction commits. If anything threw, everything rolls back.

For queries it's similar but skips the transaction, the counter, and the audit row.

## Why it's shaped this way

When auth, audit, and transactions live in one place, you stop debating whether each handler "should" check them. When feature metadata lives in one file, you stop hunting through seven files to find where a permission string is referenced.

The pattern is rigid on purpose. It removes small decisions so you can focus on the actual feature.
