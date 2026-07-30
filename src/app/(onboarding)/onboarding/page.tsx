/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: OnboardingPage
 *
 * WHAT:  /onboarding route — server-guarded entry to the org-creation wizard.
 *        Sends anonymous users to sign-in and portal owners to /portal;
 *        otherwise renders the client OnboardingFlow. Reachable both as the
 *        forced destination for a user with no org AND intentionally via the
 *        org switcher's "Create organization" (an existing user creating an
 *        additional org) — so it does NOT redirect users who already have an
 *        org away, which would make that action flash back to the dashboard.
 * WHERE: Redirect target of the dashboard layout / ONBOARDING_INCOMPLETE
 *        handler, and of the team-switcher "Create organization". Reads
 *        getCachedSession; routes via AUTH_ROUTES / PORTAL_PATH.
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getCachedSession } from '@/lib/better-auth/auth'
import { AUTH_ROUTES, PORTAL_PATH, isPortalOwnerEmail } from '@/lib/config'
import { OnboardingFlow } from './_components/onboarding-flow'

export const metadata: Metadata = {
  title: 'Get started',
}

export default async function OnboardingPage() {
  const session = await getCachedSession()
  if (!session) redirect(AUTH_ROUTES.signIn)

  /* Platform-admin owner shouldn't create a tenant org — send them to /portal,
   * which bootstraps their portal workspace. */
  if (isPortalOwnerEmail(session.user.email)) redirect(PORTAL_PATH)

  return <OnboardingFlow />
}
