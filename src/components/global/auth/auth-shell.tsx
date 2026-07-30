/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: AuthShell, AuthShellProps
 *
 * WHAT:  Centered full-viewport wrapper used by every (auth) route — logo +
 *        BRANDING.appName above an arbitrary child slot.
 * WHY:   Pulled out of the page files so future auth pages (forgot, reset,
 *        verify, 2fa) inherit the same chrome without duplicating layout
 *        markup, and so a branding redesign is a one-file change.
 * WHERE: Used by the (auth) route group pages under src/app/(auth)/.
 */

import * as React from 'react'

import { PlatformLogo } from '@/components/global/platform-logo'

export interface AuthShellProps {
  children: React.ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="self-center">
          <PlatformLogo href="/" />
        </div>
        {children}
      </div>
    </div>
  )
}
