<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Types and grep

The codebase uses a strict type discipline and a search-first navigation pattern. This page covers both.

## Type hierarchy

When you need a type, check these in order:

1. **Prisma generated types** (`@/generated/prisma`) — anything the database describes.
2. **Better Auth `$Infer`** — anything Better Auth owns.
3. **Existing app types marked SOURCE OF TRUTH** — find them with grep.
4. **Only then**: write a new type. Mark it with SOURCE OF TRUTH KEYWORDS.

If Prisma defines a shape, don't write your own. The two will drift the first time someone adds a column.

### Prisma examples

```ts
import type { User, Session, Organization, Prisma } from '@/generated/prisma'

// Relation shapes:
type ActivityLogWithUser = Prisma.ActivityLogGetPayload<{ include: { user: true } }>

// Input shapes:
type CreateOrganizationInput = Prisma.OrganizationCreateInput
```

### Better Auth examples

```ts
import type { Session, User } from '@/lib/better-auth/auth'
// = typeof auth.$Infer.Session, typeof auth.$Infer.Session.user
```

These adapt when you enable or disable Better Auth plugins.

### Router-derived types

For client code that mirrors a server contract:

```ts
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/trpc/routers/_app'

type FeatureGatesData = inferRouterOutputs<AppRouter>['usage']['getFeatureGates']
```

Wire shape changes server-side and the client types follow.

## Banned in app code

- `any` — find the real type.
- `unknown` you cast away with `as Foo` — use a type guard.
- `as Foo` (asserting) — replace with a guard or fix the source.
- `!` non-null assertion — handle the null path.
- `// @ts-ignore` and `// @ts-expect-error` — fix the underlying issue.
- A hand-rolled `interface User { ... }` next to `Prisma.User`.

The tsconfig is strict: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. If TypeScript fights you, find the real type. If you can't, ask before reaching for `any`.

## SOURCE OF TRUTH keywords

Most authoritative exports carry a comment line at the top of their file:

```ts
/**
 * SOURCE OF TRUTH KEYWORDS: AuditLogEntry, logActivity, ActivityAction
 * ...
 */
```

This is a search index. Before you create a new type or function, grep for its likely name. If a SOURCE OF TRUTH line mentions it, use the existing thing.

```bash
grep -r "SOURCE OF TRUTH" src/ | grep -i "audit"
```

When you add a new authoritative export, add a SOURCE OF TRUTH KEYWORDS line listing the symbols it owns. One comment, and the next agent finds your code in seconds.

## Doc-comment format

Important exports use a three-section JSDoc:

```ts
/**
 * SOURCE OF TRUTH KEYWORDS: getFeatureGates, FeatureGateData
 *
 * WHAT:  Builds the per-resource gate map the client uses.
 * WHY:   Folds trial-blocked flags into atLimit so the UI has one boolean.
 * WHERE: Exposed via usage.getFeatureGates; consumed by FeatureGate.
 */
```

- **WHAT** — one sentence on inputs and outputs.
- **WHY** — the gotcha, constraint, or non-obvious choice. Skip when trivial.
- **WHERE** — who calls this and what it calls.

Trivial helpers don't need this block.

## How to find code

The pattern is grep first, read second.

1. Grep the keyword most likely in a SOURCE OF TRUTH line — usually the type or function name.
2. Open the matching file and read the block comment.
3. Follow the WHERE pointers if you need more.

Two files, two minutes, no scrolling through the repo.

The anti-pattern is writing a new type because grep felt like work. That's how `User1`, `IUser`, `UserType`, `UserDto` end up in the same codebase, none of them agreeing on the field set. Don't.

## When you can't find what you need

Ask. Better to pause thirty seconds than ship a duplicate type that drifts the moment Prisma regenerates.
