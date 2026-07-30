<!--
  Copyright (c) 2026 Web Prodigies LLC

  This source code is licensed under the MIT license found in the
  LICENSE file in the root directory of this source tree.
-->

# Adding a feature

This walks through adding a `documents` feature end-to-end. CRUD entity, plan limit, sidebar nav, audit templates, a custom `publish` verb, and a per-action rate limit. After the main walkthrough, three smaller variations follow.

## The feature

A document belongs to an organization. The org's plan caps how many documents it can have. Users with the right permission can create, read, update, delete, and `publish` documents. Each mutation writes an audit row. `publish` is rate-limited and has a real business rule — you can only publish a doc that exists, isn't already published, and has enough content.

## Step 1 — Schema

Add the model in `prisma/schema.prisma`:

```prisma
model Document {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  content        String   @default("")
  publishedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("document")
}
```

And the back-relation on `Organization`:

```prisma
model Organization {
  // ...
  documents Document[]
}
```

## Step 2 — Migration

Ask the developer to run:

```bash
npx prisma migrate dev --name add_documents
```

(AI agents don't run prisma migrate, prisma generate, or git.)

## Step 3 — Registry entry

In `src/lib/resources.ts`:

```ts
documents: {
  name: 'Documents',
  description: 'Long-form documents within an organization',
  permissions: ['create', 'read', 'update', 'delete', 'publish'],
  limit: {
    perPlan: { free: 3, starter: 25, pro: 250, enterprise: 'unlimited' },
    upgradeMessage: 'Upgrade to {nextPlan} for more documents',
    availableOnFreeTrial: true,
  },
  nav: {
    label: 'Documents',
    href: '/dashboard/documents',
    icon: 'FileText',
    section: 'main',
  },
  audit: {
    describe: {
      create: 'Created document {output.title}',
      update: 'Updated document {output.title}',
      delete: 'Deleted document {input.id}',
      publish: 'Published document {output.title}',
    },
  },
  rateLimit: {
    publish: { count: 20, window: '1 m' },
  },
}
```

That one entry wires up: permission constants, owner grants, the limit gate on `documents.create`, counter increments/decrements, a sidebar entry, audit templates, and a 20-per-minute rate limit on `documents.publish`.

## Step 4 — Router

Create `src/trpc/routers/documents.ts`. The CRUD verbs are trivial — `ctx.db.document.*` inline. The `publish` verb shows business logic in the handler:

```ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter } from '../init'
import { protectedProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'

const MIN_PUBLISH_CONTENT = 10

export const documentsRouter = createTRPCRouter({
  create: protectedProcedure({ requirePermission: permissions.DOCUMENTS_CREATE })
    .input(z.object({
      organizationId: z.string(),
      title: z.string().min(1).max(200),
      content: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.db.document.create({
        data: {
          organizationId: input.organizationId,
          title: input.title,
          content: input.content ?? '',
        },
      })
    ),

  list: protectedProcedure({ requirePermission: permissions.DOCUMENTS_READ, paginate: true })
    .input(z.object({
      organizationId: z.string(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { skip, take } = ctx.pagination
      const [items, total] = await Promise.all([
        ctx.db.document.findMany({
          where: { organizationId: input.organizationId },
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
        }),
        ctx.db.document.count({ where: { organizationId: input.organizationId } }),
      ])
      return { items, total }
    }),

  delete: protectedProcedure({ requirePermission: permissions.DOCUMENTS_DELETE })
    .input(z.object({ organizationId: z.string(), id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.document.delete({ where: { id: input.id } })
    ),

  // Load → validate state → mutate → return. The builder still handles
  // auth, audit, transactions, and the rate limit.
  publish: protectedProcedure({ requirePermission: permissions.DOCUMENTS_PUBLISH })
    .input(z.object({ organizationId: z.string(), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.id, organizationId: input.organizationId },
      })
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Document not found' })
      if (doc.publishedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Document is already published' })
      }
      if (doc.content.trim().length < MIN_PUBLISH_CONTENT) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Document is too short to publish' })
      }
      return ctx.db.document.update({
        where: { id: doc.id },
        data: { publishedAt: new Date() },
      })
    }),
})
```

(An `update` procedure would follow the same shape as `create`.)

Notice no handler does auth, transactions, audit, or counter math. The builder handles all of it.

## Step 5 — Do you need a service file?

Usually no. The CRUD verbs above are trivial — `ctx.db.document.*` inline is the right answer.

Add a service when the same query (with its filters and ordering) is called from another router or a server component. Lift just that one query:

```ts
// src/services/documents.service.ts
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

Then the router's `list` calls `listDocuments(ctx.db, input.organizationId, ctx.pagination)`. Pure Prisma. No auth, no audit, no transactions.

## Step 6 — Mount

In `src/trpc/routers/_app.ts`:

```ts
import { documentsRouter } from './documents'

export const appRouter = createTRPCRouter({
  organization: organizationRouter,
  usage: usageRouter,
  auditLogs: auditLogsRouter,
  documents: documentsRouter, // ← new
})
```

The router is now reachable at `trpc.documents.*` from any client.

## Step 7 — UI

Wrap the trigger button in `<FeatureGate>`:

```tsx
'use client'

import { FeatureGate } from '@/components/feature-gate'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'

export function CreateDocumentButton() {
  const organizationId = useActiveOrganizationId()
  const create = trpc.documents.create.useMutation()
  if (!organizationId) return null

  return (
    <FeatureGate resource="documents">
      <Button onClick={() => create.mutate({ organizationId, title: 'Untitled' })}>
        New document
      </Button>
    </FeatureGate>
  )
}
```

When the org hits its document cap, the click is intercepted and the upgrade modal opens. The server still enforces the same gate — `<FeatureGate>` is UX only.

## What you didn't touch

The infrastructure layer stayed closed: `src/trpc/procedures/protected.ts`, `src/trpc/init.ts`, the Better Auth files, `src/lib/feature-gate.ts`, the activity-log and usage services, `src/lib/rate-limit.ts`, and the feature-gate / upgrade-modal components. Editing any of those for a new feature is a sign you took a wrong turn.

## Variation: a read-only resource

```ts
analytics: {
  name: 'Analytics',
  permissions: ['read'],
  flag: {
    perPlan: { free: true, starter: true, pro: true, enterprise: true },
    availableOnFreeTrial: true,
  },
  nav: {
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: 'BarChart',
    section: 'main',
    requireFlag: true,
  },
}
```

```ts
overview: protectedProcedure({
  requirePermission: permissions.ANALYTICS_READ,
  requireFlag: 'analytics',
})
  .input(z.object({ organizationId: z.string() }))
  .query(async ({ ctx, input }) => {
    const [docs, members] = await Promise.all([
      ctx.db.document.count({ where: { organizationId: input.organizationId } }),
      ctx.db.member.count({ where: { organizationId: input.organizationId } }),
    ])
    return { documents: docs, members }
  })
```

No mutations means no audit rows. No limit means no counter.

## Variation: a flag-only feature

```ts
bulkExport: {
  name: 'Bulk Export',
  flag: {
    perPlan: { free: false, starter: false, pro: true, enterprise: true },
    availableOnFreeTrial: false,
  },
}
```

```ts
exportCsv: protectedProcedure({ requireFlag: 'bulkExport' })
  .input(z.object({ organizationId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const docs = await ctx.db.document.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true, title: true, createdAt: true },
    })
    return buildCsv(docs)
  })
```

```tsx
<FeatureGate resource="bulkExport">
  <Button onClick={() => exportCsv.mutate({ organizationId })}>Export all (.csv)</Button>
</FeatureGate>
```

## Variation: a permission-only action

```ts
ownershipTransfer: {
  name: 'Ownership Transfer',
  description: 'Transfer organization ownership to another member',
  permissions: ['execute'],
}
```

```ts
transfer: protectedProcedure({
  requireRole: ['owner'],
  requirePermission: permissions.OWNERSHIP_TRANSFER_EXECUTE,
  audit: { entity: 'organization', action: 'transferOwnership' },
})
  .input(z.object({ organizationId: z.string(), newOwnerId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const target = await ctx.db.member.findFirst({
      where: { organizationId: input.organizationId, userId: input.newOwnerId },
    })
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Target is not a member' })
    if (target.role === 'owner') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Target is already owner' })
    }
    await ctx.db.member.updateMany({
      where: { organizationId: input.organizationId, role: 'owner' },
      data: { role: 'member' },
    })
    return ctx.db.member.update({
      where: { id: target.id },
      data: { role: 'owner' },
    })
  })
```

Both gates apply, and the audit row uses entity `organization` and action `transferOwnership` instead of the path-derived defaults.
