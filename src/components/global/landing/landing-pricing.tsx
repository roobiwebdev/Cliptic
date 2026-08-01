/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingPricing
 *
 * WHAT:  Landing pricing — a giant gradient "Pricing" word with three dark cards
 *        overlapping its lower edge (Free / Pro=most-popular / Enterprise). Big
 *        number + inline unit, tagline, divider, checkmark bullets, full-width
 *        pill CTA.
 * WHY:   Plan names come from PLANS and the quota/length/concurrency bullets from
 *        the SAME registry the app enforces (RESOURCES.clips + clip-limits), so
 *        marketing never drifts from reality. Prices are indicative (Polar owns
 *        the real amounts, Phase 6).
 * WHERE: Rendered by the landing page.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'

import { PLANS, type PlanKey } from '@/lib/config'
import { getClipPlanLimits } from '@/lib/config/clip-limits'
import { getResourceLimitForPlan } from '@/lib/resources'
import { AUTH_ROUTES } from '@/lib/config'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* The three tiers shown, in order; the middle one is the highlighted card. */
const TIERS = ['free', 'pro', 'enterprise'] as const satisfies readonly PlanKey[]

interface TierUi {
  price: string
  unit?: string
  tagline: string
  cta: string
  perks: string[]
}

const TIER_UI: Record<'free' | 'pro' | 'enterprise', TierUi> = {
  free: {
    price: '$0',
    tagline: 'No card, no trial — free forever.',
    cta: 'Start clipping',
    perks: ['AI moment selection', 'Link + direct upload', 'Download every clip'],
  },
  pro: {
    price: '$49',
    unit: '/mo',
    tagline: 'Every clip, without counting the minutes.',
    cta: 'Go Pro',
    perks: ['Priority processing', 'Thumbnails + AI reasons', 'Download all clips'],
  },
  enterprise: {
    price: 'Custom',
    tagline: 'For teams and high-volume creators.',
    cta: 'Contact us',
    perks: ['Bring your own AI keys', 'Higher concurrency limits', 'Priority support'],
  },
}

function registryBullets(plan: PlanKey): string[] {
  const quota = getResourceLimitForPlan('clips', plan)
  const { maxVideoMinutes, maxConcurrentJobs } = getClipPlanLimits(plan)
  const quotaLine = Number.isFinite(quota) ? `${quota} videos every month` : 'Unlimited videos'
  const lengthLine = !Number.isFinite(maxVideoMinutes)
    ? 'Any video length'
    : maxVideoMinutes >= 60
      ? `Up to ${(maxVideoMinutes / 60).toFixed(0)} hr videos`
      : `Up to ${maxVideoMinutes} min per video`
  const concurrencyLine = `${maxConcurrentJobs} clip job${maxConcurrentJobs === 1 ? '' : 's'} at a time`
  return [quotaLine, lengthLine, concurrencyLine]
}

export function LandingPricing() {
  return (
    <section id="pricing" className="relative mx-auto max-w-6xl scroll-mt-24 overflow-hidden px-4 py-24">
      {/* Giant gradient display word — cards overlap its lower edge; a vertical
          fade mask dissolves the descenders into the canvas (no hard cut-off). */}
      <h2
        aria-hidden="true"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, black 42%, transparent 88%)',
          maskImage: 'linear-gradient(to bottom, black 42%, transparent 88%)',
        }}
        className="text-gradient pointer-events-none select-none text-center text-[26vw] leading-[0.78] font-bold tracking-tighter lg:text-[14rem]"
      >
        Pricing
      </h2>
      <span className="sr-only">Pricing</span>

      <div className="relative z-10 -mt-[2vw] grid gap-4 md:grid-cols-3 lg:-mt-6">
        {TIERS.map((plan) => {
          const ui = TIER_UI[plan]
          const popular = plan === 'pro'
          const bullets = [...registryBullets(plan), ...ui.perks]

          return (
            <div
              key={plan}
              className={cn(
                'relative flex flex-col rounded-3xl p-6 sm:p-8',
                popular
                  ? 'glass-strong glow-primary ring-1 ring-foreground/15'
                  : 'glass'
              )}
            >
              {popular ? (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap">
                  Most popular
                </span>
              ) : null}

              <span className="text-muted-foreground text-sm">{PLANS[plan].name}</span>

              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-5xl font-semibold tracking-tight">{ui.price}</span>
                {ui.unit ? <span className="text-muted-foreground text-lg">{ui.unit}</span> : null}
              </div>

              <p className="text-muted-foreground mt-3 text-sm">{ui.tagline}</p>

              <div className="border-border/60 my-7 border-t" />

              <ul className="flex flex-1 flex-col gap-4">
                {bullets.map((bullet) => (
                  <li key={bullet} className="flex items-center gap-3 text-sm">
                    <span className="bg-foreground/10 flex size-6 shrink-0 items-center justify-center rounded-full">
                      <Check className="size-3.5" />
                    </span>
                    {bullet}
                  </li>
                ))}
              </ul>

              <Link
                href={AUTH_ROUTES.signUp}
                className={cn(
                  buttonVariants({ variant: popular ? 'default' : 'outline', size: 'lg' }),
                  'mt-8 w-full rounded-full'
                )}
              >
                {ui.cta}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
