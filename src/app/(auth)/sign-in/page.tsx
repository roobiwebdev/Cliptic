/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: SignInPage
 *
 * WHAT:  /sign-in route — renders the shared AuthShell + AuthForm in
 *        sign-in mode. This is the route AUTH_ROUTES.signIn points at, and
 *        the destination AuthRedirectObserver pushes unauthenticated users to.
 * WHY:   Stays a thin shell so all auth UI logic lives in one global form
 *        component; mode swap is the only difference from /sign-up.
 * WHERE: Linked from AUTH_ROUTES.signIn (src/lib/config/auth-routes.ts);
 *        proxy.ts bounces /sign-up here when registration is closed.
 */

import type { Metadata } from 'next'

import { AuthForm, AuthShell } from '@/components/global/auth'

export const metadata: Metadata = {
  title: 'Sign in',
}

export default function SignInPage() {
  return (
    <AuthShell>
      <AuthForm mode="sign-in" />
    </AuthShell>
  )
}
