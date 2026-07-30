/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PlatformLogo, PlatformLogoProps
 *
 * WHAT:  The app's wordmark — a small square icon (primary token) + APP_NAME.
 * WHY:   One reusable brand mark for the auth screens (and anywhere else the
 *        logo is needed). Swap the SVG path here to rebrand. Uses theme tokens
 *        only (bg-primary / text-primary-foreground).
 * WHERE: Rendered by src/components/global/auth/auth-shell.tsx.
 */

import Link from 'next/link'

import { APP_NAME } from '@/lib/config/branding'
import { cn } from '@/lib/utils'

export interface PlatformLogoProps {
  href?: string
  className?: string
  showName?: boolean
}

export function PlatformLogo({ href = '/', className, showName = true }: PlatformLogoProps) {
  const content = (
    <div className={cn('flex items-center gap-2 font-medium', className)}>
      <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden="true"
        >
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      </div>
      {showName ? <span>{APP_NAME}</span> : null}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {content}
      </Link>
    )
  }
  return content
}
