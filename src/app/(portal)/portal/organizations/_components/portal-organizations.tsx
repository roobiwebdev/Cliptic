/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: PortalOrganizations
 *
 * WHAT:  Paginated list of every organization on the platform (name, plan,
 *        members, created), for the portal admin.
 * WHERE: Rendered by /portal/organizations. Reads trpc.portal.listOrganizations.
 */

import * as React from 'react'

import { trpc } from '@/trpc/react-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/* Mirrors PORTAL_PAGE_SIZE in src/trpc/routers/portal.ts. */
const PAGE_SIZE = 25

export function PortalOrganizations() {
  const [page, setPage] = React.useState(1)
  const { data, isLoading } = trpc.portal.listOrganizations.useQuery({ page })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No organizations yet.
        </CardContent>
      </Card>
    )
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {data.items.map((org) => (
            <div key={org.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{org.name}</span>
                  {org.isPortalOrganization ? <Badge variant="secondary">Portal</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  /{org.slug} · {org.memberCount} member{org.memberCount === 1 ? '' : 's'} ·{' '}
                  {new Date(org.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="outline" className="capitalize shrink-0">
                {org.plan ?? 'free'}
                {org.subscriptionStatus ? ` · ${org.subscriptionStatus}` : ''}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {data.total} total · page {page} of {totalPages}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
