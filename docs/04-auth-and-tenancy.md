<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Auth and tenancy

Better Auth handles identity. Its organization plugin handles tenancy. Custom roles live as rows in the database. This page covers how those pieces fit together.

## The Better Auth setup

`src/lib/better-auth/auth.ts` configures the server instance. The plugins in use:

| Plugin            | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `admin`           | Impersonation, ban/unban, admin endpoints.               |
| `organization`    | Multi-tenant model, invitations, dynamic access control. |
| `twoFactor`       | TOTP plus backup codes.                                  |
| `lastLoginMethod` | "Continue with the method you used last time."           |
| `nextCookies`     | Captures `Set-Cookie` from upstream plugins.             |

**Plugin order matters.** `admin` must come before `organization` because the org plugin reads admin context. `nextCookies()` must be last so it captures every other plugin's cookies.

Other things worth knowing:

- `requireEmailVerification: true` closes a takeover where someone pre-registers a victim's email so Better Auth later merges it with their Google sign-in.
- A `databaseHooks.user.create.before` enforces `REGISTRATION_OPEN` at the DB layer. Even if a route is bypassed, the user isn't created.
- Cross-subdomain cookies turn on when `NEXT_PUBLIC_APP_DOMAIN` is set.

## Session types

Never write your own `User` or `Session` interface. Use these:

```ts
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user
```

They regenerate from the Better Auth config, so they stay in sync with the schema and the enabled plugins.

## Session caching

`getCachedSession()` wraps `auth.api.getSession()` in React's `cache()`. Without it, the protected layout, the tRPC context, and every server component would each fire their own session query — under a fanned-out prefetch, the Prisma pool runs out. With it, one request = one session call.

Don't cache sessions in Redis. Revocations need to take effect immediately.

## Active organization

`createTRPCContext` exposes `getActiveOrganization` lazily. The resolution order:

1. If `session.activeOrganizationId` is set and the user is a member, use that.
2. Otherwise, the first membership where the user is `owner`.
3. Otherwise, the first membership in the list.

Owners get an empty `permissions: string[]` array as a sentinel meaning "all access". The procedure builder's permission check short-circuits when the role is `owner`.

## Custom roles

Every role except `owner` is dynamic. They live as rows in `OrganizationRole` — one row per (role, permission) pair. `Member.role` stores the role name. At procedure time, the context resolver loads matching rows and flattens them into a `permissions: string[]` array.

This is what makes the role-builder UI possible: new roles get created at runtime without a redeploy.

## Permission strings

The convention is `<resource>:<verb>`. Every legal string is in the typed `Permission` union, and there are ergonomic constants on the `permissions` object:

```ts
import { permissions } from '@/lib/better-auth/permissions'

permissions.PROJECTS_CREATE     // 'projects:create'
permissions.MEMBER_DELETE       // 'member:delete'
permissions.AUDIT_LOGS_READ     // 'auditLogs:read'
```

Use the constants. Typos become compile errors.

## The proxy file

Next.js 16 renamed `middleware.ts` to `proxy.ts`. **Don't create a file called `middleware.ts`** — Next.js won't read it.

What `src/proxy.ts` does:

1. Short-circuits static asset paths.
2. Redirects `/sign-up` to `/sign-in` when registration is closed.
3. Stamps `x-pathname` and `x-hostname` onto request headers so RSCs can read them via `await headers()`.

## IP and user agent

`getRequestForensics()` in `src/lib/request-forensics.ts` returns `{ ipAddress, userAgent }`. The procedure builder calls this when writing audit rows. The IP resolver checks headers in this order: `x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`.

These are forensic fields only. **They are never returned to the frontend.** `AUDIT_LOG_SAFE_SELECT` in the activity log service deliberately omits both columns — adding them would expose every member's IP to every other member. Treat that select as a security boundary.

## Onboarding gate

A user with zero memberships can't access any protected procedure. They hit `PRECONDITION_FAILED { errorCode: 'ONBOARDING_INCOMPLETE' }`. The client narrows on that and sends them to onboarding. The `User.onboardingComplete` boolean is for UI display only — the real gate is whether you have a membership row.
