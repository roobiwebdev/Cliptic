/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PortalLayout
 *
 * WHAT:  Server layout for the platform-admin portal — the single gate for
 *        /portal. Requires a session, requires the portal be enabled,
 *        auto-provisions the owner org on first visit, and admits only platform
 *        admins; everyone else is bounced to the dashboard. Renders the portal
 *        sidebar shell.
 * WHY:   Portal is operator-only and spans all tenants, so its gate is separate
 *        from the tenant dashboard layout. Auto-provisioning here means the
 *        configured owner email becomes an admin on first access with no manual
 *        seeding.
 * WHERE: Wraps src/app/(portal)/portal/**. Uses portal.service + config/portal.
 */

import { redirect, notFound } from 'next/navigation'

import { HydrationBoundary, dehydrate } from '@tanstack/react-query'

import { getCachedSession } from '@/lib/better-auth/auth'
import { getQueryClient, trpc } from '@/trpc/server'
import { AUTH_ROUTES, ROUTES, isPortalEnabled } from '@/lib/config'
import {
  ensurePortalOwnerOrganization,
  resolvePortalAdmin,
} from '@/services/portal.service'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { PortalSidebar } from '@/components/global/portal/portal-sidebar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!isPortalEnabled()) notFound()

  const session = await getCachedSession()
  if (!session) redirect(AUTH_ROUTES.signIn)

  const user = { id: session.user.id, email: session.user.email, name: session.user.name }

  /* Bootstrap the owner on first access, then gate. */
  await ensurePortalOwnerOrganization(user)
  const isAdmin = await resolvePortalAdmin(user)
  if (!isAdmin) redirect(ROUTES.dashboard)

  /* Prefetch + hydrate the profile the portal sidebar's user menu reads. */
  const queryClient = getQueryClient()
  await queryClient.prefetchQuery(trpc.user.getProfile.queryOptions())

  return (
    <SidebarProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PortalSidebar />
        <SidebarInset>{children}</SidebarInset>
      </HydrationBoundary>
    </SidebarProvider>
  )
}
