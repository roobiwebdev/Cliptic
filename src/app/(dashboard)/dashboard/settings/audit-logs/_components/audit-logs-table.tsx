/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: AuditLogsTable
 *
 * WHAT:  Paginated audit-log list for the active org.
 * WHY:   `auditLogs` is a flag resource (pro+); the procedure factory blocks
 *        reads on lower plans, so this surfaces a clear upgrade message instead
 *        of a raw error. Pagination uses the router's page/pageSize input.
 * WHERE: Rendered by settings/audit-logs page.
 */

import * as React from 'react'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 20

export function AuditLogsTable() {
  const organizationId = useActiveOrganizationId()
  const [page, setPage] = React.useState(1)
  const enabled = organizationId !== undefined

  const query = trpc.auditLogs.list.useQuery(
    { organizationId: organizationId ?? '', page, pageSize: PAGE_SIZE },
    { enabled, retry: false }
  )

  if (!organizationId) return null

  if (query.error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Audit logs aren’t available on your current plan. Upgrade to view them.
        </CardContent>
      </Card>
    )
  }

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  const data = query.data
  if (!data || data.logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {data.logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {log.description ?? `${log.action} ${log.entity}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {log.user?.name ?? 'Someone'} · {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary">{log.entity}</Badge>
                <Badge variant="outline" className="capitalize">
                  {log.action}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Page {data.page} of {data.totalPages || 1}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
