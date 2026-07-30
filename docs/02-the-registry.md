<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# The registry

`src/lib/resources.ts` is the one place every feature in your app gets declared. Permissions, plan limits, plan flags, sidebar items, audit templates, rate-limit overrides — all of it lives here.

## What an entry looks like

A full CRUD entity:

```ts
projects: {
  name: 'Projects',
  description: 'Workspaces or projects within an organization',
  permissions: ['create', 'read', 'update', 'delete'],
  limit: {
    perPlan: { free: 1, starter: 5, pro: 20, enterprise: 'unlimited' },
    upgradeMessage: 'Upgrade to {nextPlan} for more projects',
    availableOnFreeTrial: true,
  },
  nav: {
    label: 'Projects',
    href: '/dashboard/projects',
    icon: 'Folder',
    section: 'main',
  },
}
```

Only `name` is required. Everything else is opt-in.

## The four shapes you'll see

Most entries are one of these:

- **CRUD entity** — `permissions` + `limit` + `nav` (most app features)
- **Flag-only toggle** — just `flag` (a button that lights up on higher plans)
- **Quota-only** — just `limit` (`apiCalls`, `aiCredits`, no dedicated UI)
- **Permission-only action** — just `permissions` (one verb you want to gate)

A resource declares either `limit` or `flag`, never both.

## The fields

### `permissions`

A list of verbs the resource exposes. Each verb becomes a permission string like `<resource>:<verb>`. The owner role auto-grants all of them.

```ts
permissions: ['create', 'read', 'update', 'delete']
// produces: 'projects:create', 'projects:read', ...
// also produces typed constants: permissions.PROJECTS_CREATE
```

### `limit`

A numeric quota per plan. `'unlimited'` resolves to `Infinity`.

```ts
limit: {
  perPlan: { free: 1, starter: 5, pro: 20, enterprise: 'unlimited' },
  upgradeMessage: 'Upgrade to {nextPlan} for more projects',
  availableOnFreeTrial: true,
}
```

`availableOnFreeTrial: false` blocks the resource during a free trial regardless of the cap.

### `flag`

A plan-tier boolean. Used for features that are on or off, not counted.

```ts
flag: {
  perPlan: { free: false, starter: true, pro: true, enterprise: true },
  availableOnFreeTrial: false,
}
```

### `nav`

Sidebar metadata. Add this and the resource shows up in the sidebar. `requireFlag: true` hides the item when the resource's flag is off for the current plan.

```ts
nav: {
  label: 'Audit Logs',
  href: '/dashboard/audit-logs',
  icon: 'ScrollText',
  section: 'settings',
  requireFlag: true,
}
```

### `audit`

Description templates for the audit log. Supports `{input.field}` and `{output.field}` placeholders.

```ts
audit: {
  describe: {
    create: 'Created project {output.name}',
    delete: 'Deleted project {input.id}',
  },
}
```

You can also override the entity name here: `audit: { entity: 'organization' }`.

### `rateLimit`

Per-action overrides on top of the global rate limit. Keys are the procedure verb.

```ts
rateLimit: {
  create: { count: 10, window: '1 m' },
}
```

## What you get from one entry

Add a resource entry and these come for free:

- Typed permission constants (`permissions.PROJECTS_CREATE`)
- Owner role grants for every declared verb
- Better Auth access-control statement
- Sidebar item (if `nav` is set)
- Limit gate on `<resource>.create` (if `limit` is set)
- Counter bump on `<resource>.create` and `<resource>.delete`
- Flag gate (when a procedure declares `requireFlag`)
- Optimistic client-side counter bump
- Audit entity name and templates

That's the deal: one entry, ten things wired up.

## Naming

Better-Auth-owned surfaces use singular keys (`member`, `invitation`) because Better Auth's internal checks expect those exact strings. Your app's resources use plural (`projects`, `documents`). Pick one style and stick to it within each.
