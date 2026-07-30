/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: PlanSelector, BillingIntervalToggle, PLAN_ICONS
 *
 * WHAT:  Plan picker (icon + name + trial/popular badges) and a monthly/yearly
 *        toggle, driven by PLANS / PLAN_ORDER.
 * WHY:   Reused by onboarding (with the free plan) and the billing upgrade UI
 *        (paid only). Concrete prices aren't hard-coded (they live in Stripe),
 *        so the template stays account-agnostic — the cards show identity +
 *        trial length, not amounts.
 * WHERE: Onboarding plan step + billing-tab upgrade section.
 */

import * as React from 'react'
import {
  CheckIcon,
  PackageIcon,
  RocketIcon,
  ZapIcon,
  Building2Icon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react'

import { PLANS, PLAN_ORDER, type PlanKey, type BillingInterval } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/* Maps PLANS[plan].icon strings to lucide components. */
const PLAN_ICONS: Record<string, LucideIcon> = {
  Package: PackageIcon,
  Rocket: RocketIcon,
  Zap: ZapIcon,
  Building: Building2Icon,
  ShieldCheck: ShieldCheckIcon,
}

export function BillingIntervalToggle({
  interval,
  onIntervalChange,
}: {
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(['monthly', 'yearly'] as const).map((value) => {
        const selected = interval === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => onIntervalChange(value)}
            className={cn(
              'rounded-lg border-2 border-muted p-3 text-sm font-semibold capitalize transition-all hover:bg-muted/50',
              selected && 'border-primary'
            )}
          >
            {value}
          </button>
        )
      })}
    </div>
  )
}

export function PlanSelector({
  selectedPlan,
  onPlanChange,
  includeFree = false,
}: {
  selectedPlan: PlanKey
  onPlanChange: (plan: PlanKey) => void
  includeFree?: boolean
}) {
  const plans = PLAN_ORDER.filter((plan) => PLANS[plan].showPlan && (includeFree || plan !== 'free'))

  return (
    <div className="flex flex-col gap-4">
      {plans.map((plan) => {
        const def = PLANS[plan]
        const isSelected = plan === selectedPlan
        const Icon = PLAN_ICONS[def.icon] ?? PackageIcon
        return (
          <button
            key={plan}
            type="button"
            onClick={() => onPlanChange(plan)}
            className={cn(
              'relative flex items-center gap-4 rounded-lg border-2 border-muted p-4 text-left transition-all hover:bg-muted/50',
              isSelected && 'border-border bg-muted'
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{def.name}</span>
                {def.trialDays > 0 ? (
                  <Badge variant="secondary" className="text-xs">
                    {def.trialDays}-day trial
                  </Badge>
                ) : plan === 'free' ? (
                  <Badge variant="secondary" className="text-xs">
                    No card required
                  </Badge>
                ) : null}
              </div>
            </div>
            {isSelected ? <CheckIcon className="size-5 shrink-0 text-primary" /> : null}
          </button>
        )
      })}
    </div>
  )
}
