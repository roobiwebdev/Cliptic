/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: DashboardLayout
 *
 * WHAT:  Server layout for every authenticated dashboard route — the single
 *        auth + onboarding gate, then the sidebar shell (SidebarProvider +
 *        AppSidebar + SidebarInset).
 * WHY:   Doing auth ONCE in the layout (not per page) keeps the redirect logic
 *        in one place: anonymous → sign-in, no-org → onboarding. It also
 *        PREFETCHES the queries the sidebar + user menu depend on
 *        (active org, memberships, feature gates, profile) and hydrates them,
 *        so the sidebar renders its items immediately from cache instead of
 *        popping in after client fetches (no flicker).
 * WHERE: Wraps src/app/(dashboard)/**. Renders the sidebar from
 *        src/components/global/sidebar.
 */

import { redirect } from 'next/navigation'
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'

import { getCachedSession } from '@/lib/better-auth/auth'
import { createTRPCContext } from '@/trpc/init'
import { getQueryClient, trpc } from '@/trpc/server'
import { AUTH_ROUTES, ROUTES, PORTAL_PATH, isPortalOwnerEmail } from '@/lib/config'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/global/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getCachedSession()
  if (!session) redirect(AUTH_ROUTES.signIn)

  const ctx = await createTRPCContext()
  await ctx.resolveAuth()
  const activeOrganization = await ctx.getActiveOrganization()
  if (!activeOrganization) {
    /* A fresh platform-admin owner (no org yet) belongs in /portal, which
     * bootstraps their portal org — not the tenant onboarding flow. */
    if (isPortalOwnerEmail(session.user.email)) redirect(PORTAL_PATH)
    redirect(ROUTES.onboarding)
  }

  /* Prefetch everything the sidebar/user-menu read, then hydrate — the client
   * components resolve from cache on first paint (no flicker). */
  const queryClient = getQueryClient()
  await Promise.all([
    queryClient.prefetchQuery(trpc.organization.getActiveOrganization.queryOptions()),
    queryClient.prefetchQuery(trpc.organization.getUserOrganizations.queryOptions()),
    queryClient.prefetchQuery(
      trpc.usage.getFeatureGates.queryOptions({ organizationId: activeOrganization.id })
    ),
    queryClient.prefetchQuery(trpc.user.getProfile.queryOptions()),
  ])

  return (
    <SidebarProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <AppSidebar />
        <SidebarInset>{children}</SidebarInset>
      </HydrationBoundary>
    </SidebarProvider>
  )
}
