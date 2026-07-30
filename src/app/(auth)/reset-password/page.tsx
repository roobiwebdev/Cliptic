/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ResetPasswordPage
 *
 * WHAT:  /reset-password route — set a new password from the email link's token.
 * WHY:   The form reads `?token=` via useSearchParams, so it's wrapped in a
 *        Suspense boundary (Next.js requirement for static-generation compat).
 * WHERE: AUTH_ROUTES.resetPassword; the reset-link email lands here.
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'

import { AuthShell, ResetPasswordForm } from '@/components/global/auth'

export const metadata: Metadata = {
  title: 'Reset password',
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
