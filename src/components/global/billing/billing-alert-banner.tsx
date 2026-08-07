/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: BillingAlertBanner, dunning, SubscriptionStateSummary
 *
 * WHAT:  Layout-level billing alert — renders ONE banner (highest severity
 *        wins) when the org's subscription needs attention:
 *          past_due            → "Payment failed" (destructive) + Fix payment
 *          trial ends ≤ 3 days → "Trial ends in X days" + Manage plan
 *          cancelAtPeriodEnd   → "Subscription canceled" + Reactivate
 *        Renders nothing when the subscription is healthy, while loading, on
 *        the free tier, or on the billing page itself (which shows richer
 *        inline alerts).
 * WHY:   Dunning and lifecycle warnings must reach EVERY member on every
 *        dashboard page, not just billing admins who open settings. Reads the
 *        SubscriptionStateSummary shipped on usage.getFeatureGates (prefetched
 *        by the dashboard layout) so no extra query and no billing:read needed.
 * WHERE: Mounted once in src/app/(dashboard)/layout.tsx inside SidebarInset.
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, CalendarClock, Clock } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { FEATURE_GATES_QUERY_OPTIONS } from '@/components/feature-gate'
import { RESOURCES } from '@/lib/resources'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const DAY_MS = 24 * 60 * 60 * 1000

/** Trial banners only appear inside this window before conversion. */
const TRIAL_WARNING_DAYS = 3

type BannerContent = {
  variant: 'default' | 'destructive'
  icon: React.ReactNode
  title: string
  description: string
  actionLabel: string
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/* Highest severity wins — one banner at a time, never a stack. */
function deriveBanner(subscription: {
  status: string
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean | null
  trialEnd: Date | null
}): BannerContent | null {
  if (subscription.status === 'past_due') {
    return {
      variant: 'destructive',
      icon: <AlertTriangle />,
      title: 'Payment failed',
      description:
        "We couldn't charge your payment method. Your access continues while we retry — update your card or retry the payment to keep your plan.",
      actionLabel: 'Fix payment',
    }
  }

  if (subscription.status === 'trialing' && subscription.trialEnd) {
    const daysLeft = Math.ceil(
      (new Date(subscription.trialEnd).getTime() - Date.now()) / DAY_MS
    )
    if (daysLeft >= 0 && daysLeft <= TRIAL_WARNING_DAYS) {
      return {
        variant: 'default',
        icon: <Clock />,
        title:
          daysLeft === 0
            ? 'Your trial ends today'
            : `Your trial ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`,
        description:
          'Your paid subscription starts when the trial ends and your card on file will be charged. Change plans or cancel anytime before then.',
        actionLabel: 'Manage plan',
      }
    }
    return null
  }

  if (subscription.cancelAtPeriodEnd && subscription.periodEnd) {
    return {
      variant: 'default',
      icon: <CalendarClock />,
      title: 'Subscription canceled',
      description: `You keep full access until ${formatDate(subscription.periodEnd)}. Reactivate anytime before then to keep your plan.`,
      actionLabel: 'Reactivate',
    }
  }

  return null
}

export function BillingAlertBanner() {
  const organizationId = useActiveOrganizationId()
  const pathname = usePathname()

  const { data } = trpc.usage.getFeatureGates.useQuery(
    { organizationId: organizationId ?? '' },
    { enabled: Boolean(organizationId), ...FEATURE_GATES_QUERY_OPTIONS }
  )

  /* The billing page renders its own inline state alerts — no double banner. */
  const billingHref = RESOURCES.billing.nav.href
  if (pathname?.startsWith(billingHref)) return null

  const subscription = data?.subscription
  if (!organizationId || !subscription) return null

  const banner = deriveBanner(subscription)
  if (!banner) return null

  return (
    <div className="px-4 pt-4 md:px-6">
      <Alert variant={banner.variant}>
        {banner.icon}
        <AlertTitle>{banner.title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{banner.description}</span>
          <Link href={`${billingHref}?org=${organizationId}`} className="w-fit shrink-0">
            <Button
              size="sm"
              variant={banner.variant === 'destructive' ? 'destructive' : 'outline'}
            >
              {banner.actionLabel}
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default BillingAlertBanner
