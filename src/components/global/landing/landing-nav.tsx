/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: LandingNav
 *
 * WHAT:  Floating glass pill navigation for the marketing landing page.
 * WHY:   Sticky, frosted, centered — the modern SaaS landing pattern; shows a
 *        Dashboard CTA when signed in, Sign in / Get started otherwise.
 * WHERE: Rendered by the landing page (src/app/page.tsx).
 */

import Link from 'next/link'

import { PlatformLogo } from '@/components/global/platform-logo'
import { ThemeToggle } from '@/components/global/theme-toggle'
import { buttonVariants } from '@/components/ui/button'
import { AUTH_ROUTES, ROUTES } from '@/lib/config'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export function LandingNav({ authed }: { authed: boolean }) {
  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav className="glass-strong flex w-full max-w-3xl items-center justify-between gap-3 rounded-full p-2 pl-4 shadow-xl">
        <PlatformLogo size={22} className="text-base" />

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground rounded-full px-3 py-1.5 text-sm transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle className="rounded-full" />
          {authed ? (
            <Link href={ROUTES.dashboard} className={cn(buttonVariants({ size: 'sm' }), 'rounded-full')}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href={AUTH_ROUTES.signIn}
                className="text-muted-foreground hover:text-foreground hidden rounded-full px-3 py-1.5 text-sm sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href={AUTH_ROUTES.signUp}
                className={cn(buttonVariants({ size: 'sm' }), 'rounded-full')}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
