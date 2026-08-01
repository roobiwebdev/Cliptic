/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PlatformLogo, PlatformLogoProps, brand logo
 *
 * WHAT:  The Cliptic wordmark — the brand mark image + APP_NAME. The mark swaps
 *        white/black with the theme via CSS `dark:` variants (no JS, no flash).
 * WHY:   One reusable brand mark for the landing nav, auth screens, and anywhere
 *        else. Files live in /public (cliptic_whitelogo / cliptic_blacklogo).
 * WHERE: Rendered by auth-shell, the landing nav/footer.
 */

import Image from 'next/image'
import Link from 'next/link'

import { APP_NAME } from '@/lib/config/branding'
import { cn } from '@/lib/utils'

export interface PlatformLogoProps {
  href?: string
  className?: string
  showName?: boolean
  size?: number
}

export function PlatformLogo({
  href = '/',
  className,
  showName = true,
  size = 28,
}: PlatformLogoProps) {
  const mark = (
    <>
      {/* White mark on dark theme, black mark on light theme. */}
      <Image
        src="/cliptic_whitelogo.png"
        alt={`${APP_NAME} logo`}
        width={size}
        height={size}
        priority
        className="hidden rounded-lg object-contain dark:block"
      />
      <Image
        src="/cliptic_blacklogo.png"
        alt={`${APP_NAME} logo`}
        width={size}
        height={size}
        priority
        className="block rounded-lg object-contain dark:hidden"
      />
    </>
  )

  const content = (
    <div className={cn('flex items-center gap-2 text-lg font-semibold tracking-tight', className)}>
      {mark}
      {showName ? <span>{APP_NAME}</span> : null}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center">
        {content}
      </Link>
    )
  }
  return content
}
