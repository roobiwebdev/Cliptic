/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: TeamSwitcher
 *
 * WHAT:  Sidebar-header organization switcher — shows the active org and a
 *        dropdown of the user's other orgs; switching calls Better Auth's
 *        setActive and reloads.
 * WHY:   A hard reload after setActive is the simplest correct way to refresh
 *        every server-resolved org-scoped query (the active org is read from
 *        the session in the tRPC context). "Create organization" routes to
 *        onboarding so the same create flow is reused.
 * WHERE: Rendered by AppSidebar. Reads trpc.organization.getUserOrganizations
 *        + useActiveOrganization; mutates via authClient.organization.setActive.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, Plus, Check, GalleryVerticalEnd } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { ROUTES } from '@/lib/config'

export function TeamSwitcher() {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { activeOrganization } = useActiveOrganization()
  const { data: organizations } = trpc.organization.getUserOrganizations.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const [switchingId, setSwitchingId] = React.useState<string | null>(null)

  async function handleSwitch(org: { id: string; slug: string }) {
    if (org.id === activeOrganization?.id || switchingId) return
    setSwitchingId(org.id)
    await authClient.organization.setActive({
      organizationId: org.id,
      organizationSlug: org.slug,
    })
    /* Hard reload so every org-scoped server query re-resolves the new active
     * org from the refreshed session. */
    window.location.reload()
  }

  const label = activeOrganization?.name ?? 'Select organization'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{label}</span>
              {activeOrganization?.role ? (
                <span className="truncate text-xs capitalize text-muted-foreground">
                  {activeOrganization.role}
                </span>
              ) : null}
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Organizations
              </DropdownMenuLabel>
              {(organizations ?? []).map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSwitch(org)}
                  className="gap-2 p-2"
                >
                  <span className="truncate">{org.name}</span>
                  {org.id === activeOrganization?.id ? (
                    <Check className="ml-auto size-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onClick={() => router.push(ROUTES.onboarding)}>
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <Plus className="size-4" />
              </div>
              <span className="text-muted-foreground font-medium">Create organization</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
