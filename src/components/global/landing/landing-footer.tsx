/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingFooter
 *
 * WHAT:  Final call-to-action panel + the marketing footer.
 * WHERE: Rendered by the landing page.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { PlatformLogo } from '@/components/global/platform-logo'
import { buttonVariants } from '@/components/ui/button'
import { AUTH_ROUTES } from '@/lib/config'
import { APP_NAME } from '@/lib/config/branding'
import { cn } from '@/lib/utils'

export function LandingFooter() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 pb-24">
        <div className="glass-strong glow-primary rounded-3xl px-6 py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your next viral clip is one link away
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-md text-balance">
            Paste a link, watch it get clipped, and download — free to start.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href={AUTH_ROUTES.signUp}
              className={cn(buttonVariants({ size: 'lg' }), 'rounded-full')}
            >
              Start clipping free
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-border/50 border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <PlatformLogo size={20} className="text-sm" />
          <nav className="text-muted-foreground flex items-center gap-5 text-sm">
            <Link href="#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </Link>
            <Link href={AUTH_ROUTES.signIn} className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </nav>
          <p className="text-muted-foreground text-xs">© 2026 {APP_NAME}. All rights reserved.</p>
        </div>
      </footer>
    </>
  )
}
