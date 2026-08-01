/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingPage
 *
 * WHAT:  The public marketing landing at `/` — nav, hero, features, pricing,
 *        FAQ, and CTA/footer in the Cliptic glass-dark aesthetic.
 * WHY:   `/` is public (proxy.ts doesn't gate it; auth redirects live in the
 *        dashboard layout). The nav shows a Dashboard CTA when a session exists,
 *        otherwise Sign in / Get started.
 * WHERE: Sections in src/components/global/landing/*; session via getCachedSession.
 */

import { getCachedSession } from '@/lib/better-auth/auth'
import { LandingNav } from '@/components/global/landing/landing-nav'
import { LandingHero } from '@/components/global/landing/landing-hero'
import { LandingFeatures } from '@/components/global/landing/landing-features'
import { LandingPricing } from '@/components/global/landing/landing-pricing'
import { LandingFaq } from '@/components/global/landing/landing-faq'
import { LandingFooter } from '@/components/global/landing/landing-footer'

export default async function LandingPage() {
  const session = await getCachedSession()
  const authed = Boolean(session?.user)

  return (
    <main className="relative min-h-svh overflow-x-hidden">
      <LandingNav authed={authed} />
      <LandingHero />
      <LandingFeatures />
      <LandingPricing />
      <LandingFaq />
      <LandingFooter />
    </main>
  )
}
