/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ForgotPasswordPage
 *
 * WHAT:  /forgot-password route — request a password-reset email.
 * WHERE: AUTH_ROUTES.forgotPassword; linked from the sign-in form.
 */

import type { Metadata } from 'next'

import { AuthShell, ForgotPasswordForm } from '@/components/global/auth'

export const metadata: Metadata = {
  title: 'Forgot password',
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  )
}
