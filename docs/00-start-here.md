<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Start here

These docs explain how this boilerplate is shaped and why. The README tells you what to do. These docs tell you how things fit together.

## Read order

1. `01-architecture.md` — the big picture in one page
2. `02-the-registry.md` — the one file that drives almost everything
3. `03-procedures-and-routers.md` — where your code goes
4. `04-auth-and-tenancy.md` — Better Auth, organizations, roles
5. `05-feature-gates.md` — plan limits and flags
6. `06-audit-and-rate-limit.md` — automatic audit logs and abuse protection
7. `07-adding-a-feature.md` — a full end-to-end walkthrough
8. `08-types-and-grep.md` — type rules and how to navigate the code

## If you only have five minutes

Read `01-architecture.md` for the mental model, then jump to `07-adding-a-feature.md`. Come back for the rest later.

## What this is

Every multi-tenant SaaS needs the same plumbing: auth, organizations, roles, plan tiers, audit logs, rate limiting. This boilerplate gives you that, and nothing else. Forms, payments adapters, file storage, landing pages — those belong in your app, not here.

## A note on `.claude/CLAUDE.md`

That file is the pattern rulebook for AI agents. It is intentionally terse — "when you see X, do Y" with no explanation. These docs explain the why behind those rules.
