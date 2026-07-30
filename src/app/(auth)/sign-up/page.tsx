/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: SignUpPage
 *
 * WHAT:  /sign-up route — renders AuthShell + AuthForm in sign-up mode.
 *        Hidden behind the proxy.ts redirect when REGISTRATION_OPEN=false,
 *        so reaching this file implies registration is open.
 * WHY:   Mirrors sign-in/page.tsx; keeps every page in (auth) cookie-cutter.
 * WHERE: Bounced to /sign-in by src/proxy.ts when REGISTRATION_OPEN=false.
 */

import type { Metadata } from 'next'

import { AuthForm, AuthShell } from '@/components/global/auth'

export const metadata: Metadata = {
  title: 'Create account',
}

export default function SignUpPage() {
  return (
    <AuthShell>
      <AuthForm mode="sign-up" />
    </AuthShell>
  )
}
