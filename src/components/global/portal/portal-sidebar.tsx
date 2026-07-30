/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: PortalSidebar, PORTAL_NAV
 *
 * WHAT:  Sidebar for the platform-admin (/portal) console — a small fixed nav
 *        (Overview, Organizations, Users, Audit logs) plus a "Back to app" link
 *        and the shared user menu.
 * WHY:   Portal nav is operator-level and small/fixed, so it's a static list
 *        here (not derived from RESOURCES, which describes tenant features).
 * WHERE: Mounted by src/app/(portal)/portal/layout.tsx inside <SidebarProvider>.
 */

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { PORTAL_PATH, ROUTES } from '@/lib/config'
import { NavUser } from '@/components/global/sidebar'

const PORTAL_NAV = [
  { label: 'Overview', href: PORTAL_PATH, icon: LayoutDashboard, exact: true },
  { label: 'Organizations', href: `${PORTAL_PATH}/organizations`, icon: Building2, exact: false },
  { label: 'Users', href: `${PORTAL_PATH}/users`, icon: Users, exact: false },
  { label: 'Audit logs', href: `${PORTAL_PATH}/audit-logs`, icon: ScrollText, exact: false },
] as const

export function PortalSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Platform</span>
                <span className="truncate text-xs text-muted-foreground">Admin console</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {PORTAL_NAV.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} isActive={isActive} tooltip={item.label}>
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href={ROUTES.dashboard} />} tooltip="Back to app">
                <ArrowLeft />
                <span>Back to app</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
