/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingPricing
 *
 * WHAT:  Landing pricing grid — one card per purchasable plan, with the monthly
 *        video quota + length/concurrency caps pulled from the SAME registry the
 *        app enforces (RESOURCES.clips + clip-limits), so marketing never drifts
 *        from reality.
 * WHY:   Display prices are indicative (real billing is Polar, Phase 6); the
 *        limits are the source of truth.
 * WHERE: Rendered by the landing page.
 */

import Link from 'next/link'
import { Check } from 'lucide-react'

import { PLANS, PLAN_ORDER, type PlanKey } from '@/lib/config'
import { getClipPlanLimits } from '@/lib/config/clip-limits'
import { getResourceLimitForPlan } from '@/lib/resources'
import { AUTH_ROUTES } from '@/lib/config'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* Indicative display pricing — edit freely; real amounts are set on Polar. */
const PRICE_DISPLAY: Record<PlanKey, { amount: string; period?: string; cta: string }> = {
  free: { amount: 'Free', cta: 'Start free' },
  starter: { amount: '$19', period: '/mo', cta: 'Start clipping' },
  pro: { amount: '$49', period: '/mo', cta: 'Go Pro' },
  enterprise: { amount: 'Custom', cta: 'Contact us' },
  portal: { amount: '—', cta: '' },
}

function quotaLabel(plan: PlanKey): string {
  const limit = getResourceLimitForPlan('clips', plan)
  return Number.isFinite(limit) ? `${limit} videos / month` : 'Unlimited videos'
}

function lengthLabel(plan: PlanKey): string {
  const { maxVideoMinutes } = getClipPlanLimits(plan)
  if (!Number.isFinite(maxVideoMinutes)) return 'Any video length'
  if (maxVideoMinutes >= 60) return `Up to ${(maxVideoMinutes / 60).toFixed(0)} hr videos`
  return `Up to ${maxVideoMinutes} min videos`
}

function planBullets(plan: PlanKey): string[] {
  const { maxConcurrentJobs } = getClipPlanLimits(plan)
  return [
    quotaLabel(plan),
    lengthLabel(plan),
    `${maxConcurrentJobs} clip job${maxConcurrentJobs === 1 ? '' : 's'} at a time`,
    'AI moment selection',
    'Link + direct upload',
  ]
}

export function LandingPricing() {
  const plans = PLAN_ORDER.filter((plan) => PLANS[plan].showPlan)

  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
      <div className="text-center">
        <span className="glass text-muted-foreground inline-block rounded-full px-3 py-1 text-xs">
          Pricing
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Simple, per-workspace pricing
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-balance">
          Start free. Upgrade when you need more videos, longer sources, or more clips at once.
        </p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const price = PRICE_DISPLAY[plan]
          const popular = plan === 'pro'
          return (
            <div
              key={plan}
              className={cn(
                'flex flex-col rounded-2xl p-6',
                popular ? 'glass-strong glow-primary ring-1 ring-foreground/15' : 'glass'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{PLANS[plan].name}</span>
                {popular ? (
                  <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                    Most popular
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{price.amount}</span>
                {price.period ? (
                  <span className="text-muted-foreground text-sm">{price.period}</span>
                ) : null}
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {planBullets(plan).map((bullet) => (
                  <li key={bullet} className="text-muted-foreground flex items-start gap-2 text-sm">
                    <Check className="text-foreground mt-0.5 size-4 shrink-0" />
                    {bullet}
                  </li>
                ))}
              </ul>

              <Link
                href={AUTH_ROUTES.signUp}
                className={cn(
                  buttonVariants({ variant: popular ? 'default' : 'outline' }),
                  'mt-6 w-full rounded-full'
                )}
              >
                {price.cta}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
