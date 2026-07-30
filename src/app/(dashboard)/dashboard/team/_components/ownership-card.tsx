/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: OwnershipCard, memberInitials
 *
 * WHAT:  The organization-owner card — same row treatment as a member row with
 *        a static "Owner" badge.
 * WHERE: Right column of MemberManager.
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { OrganizationMember } from './member-types'

export function memberInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

export function OwnershipCard({ owner }: { owner: OrganizationMember | undefined }) {
  if (!owner) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No owner assigned</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-10 shrink-0">
          {owner.user.image ? <AvatarImage src={owner.user.image} alt={owner.user.name} /> : null}
          <AvatarFallback>{memberInitials(owner.user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{owner.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{owner.user.email}</p>
        </div>
      </div>
      <Badge variant="secondary" className="bg-muted">
        Owner
      </Badge>
    </div>
  )
}
