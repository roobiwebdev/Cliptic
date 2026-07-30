<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Feature gates

A feature gate decides whether the current org can use a given feature based on its plan. There are two kinds: **limits** (numeric quotas) and **flags** (booleans).

## Limit vs flag

A **limit** has a numeric cap per plan. Examples: `projects` (1 / 5 / 20 / unlimited), `member` (1 / 3 / 10 / unlimited), `apiCalls`. The cap can be `'unlimited'`, which resolves to `Infinity`. Limit-shaped resources get a `UsageMetrics` row per (org, resource).

A **flag** is a plan-tier on/off switch. Examples: `customDomain`, `auditLogs`, `analytics`. No counter — the gate is just "is this feature available on this plan".

A resource has either `limit` or `flag`, never both.

## Server-side enforcement

The procedure builder is the source of truth.

- `<x>.create` with a `limit` → automatic limit check.
- `requireLimit: 'x'` → forces a limit check on any procedure path.
- `requireFlag: 'x'` → enforces a plan-tier flag.

A failed gate throws a `TRPCError` whose `cause` carries the error code (`USAGE_LIMIT_REACHED` or `FEATURE_NOT_AVAILABLE`), the resource, the current and limit numbers, and `upgradeRequired: true`. The client narrows on `error.data.cause.errorCode`.

Gate computation lives in `src/lib/feature-gate.ts`. Routers don't call it directly. They declare `requireLimit` / `requireFlag` and let the builder do the lookup.

## How plan tier resolves

`getOrganizationTier(orgId)` walks the most recent `Subscription` row for the org:

1. No subscription → `free`.
2. Unknown plan key → log a warning, return `free`.
3. Plan is literally `free` → `free`.
4. `periodEnd` is in the past → `free` (lapsed paid plan).
5. `status === 'trialing'` but `trialEnd` is gone → `free` (lapsed trial).
6. Otherwise → the active tier with the linked subscription.

The free-trial axis is separate from the cap. A resource with `availableOnFreeTrial: false` is blocked during trial regardless of the plan's cap.

## Usage counters

`incrementUsage` and `decrementUsage` in `src/services/usage.service.ts` are pure Prisma writes. They take `db` as their first argument.

Counter writes happen in two places only:

1. The procedure builder's auto-bump on `<resource>.create` (increment) and `<resource>.delete` (decrement).
2. Explicit calls from a router for non-conventional paths — e.g. a `forms.publish` handler that should consume the `forms` quota would call `incrementUsage(ctx.db, orgId, 'forms', 1)`.

Counter writes use `ctx.db` so they commit inside the handler's transaction. Throw later in the handler and the counter rolls back too.

Decrements are clamped at zero. Batch deletes that return `{ count: 0 }` decrement by zero.

## The `<FeatureGate>` component

`<FeatureGate>` wraps a single child element. It intercepts `onClick` and either calls through or opens the upgrade modal.

```tsx
import { FeatureGate } from '@/components/feature-gate'
import { Button } from '@/components/ui/button'

<FeatureGate resource="projects">
  <Button onClick={createProject}>New project</Button>
</FeatureGate>
```

Works on any resource that declares `limit` or `flag` — no `nav` entry required.

Defaults worth knowing:

- **Fail-closed during load.** Until `trpc.usage.getFeatureGates` resolves, the child is rendered with `disabled: true`. Pass `optimistic` to flip this.
- **Upgrade modal on at-limit.** The click is intercepted; `<UpgradeModal>` opens.
- **`onLimitReached` override.** If you pass it, the modal is suppressed and your handler runs.
- **`fallback` prop.** Replaces the child entirely while loading.

The `useFeatureGate(resource)` hook gives you the snapshot directly:

```tsx
const gate = useFeatureGate('projects')
// { usage, limit, atLimit, isUnlimited, featureName } | null
```

`null` means loading or the active org hasn't resolved yet.

## The upgrade modal

`<UpgradeModal>` reads its copy and routes from `BRANDING` in `src/lib/config/branding.ts`. The body template supports `{resourceName}` (interpolated from `RESOURCES[resource].name`). The CTA links to `BRANDING.routes.billing`.

To rebrand the modal, edit `BRANDING`. Don't hard-code copy in the modal component.

## What the usage router exposes

`src/trpc/routers/usage.ts` exposes one query — `getFeatureGates` — which returns a per-resource snapshot `{ usage, limit, atLimit, isUnlimited, featureName }` plus the org's tier. It exists for the UI to render at-limit affordances.

It does NOT expose pre-flight gate checkers like "can I do X?" by design. Gate enforcement is the procedure builder's job: declare `requireLimit` or `requireFlag` on the procedure and the factory handles it. You should never need to ask "can I" before calling a procedure.
