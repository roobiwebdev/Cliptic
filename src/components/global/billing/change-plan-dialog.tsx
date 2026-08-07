/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ChangePlanDialog, ChangePlanDialogProps,
 *   planChangeDirection, upgrade, downgrade
 *
 * WHAT:  The ONE plan-change surface — plan picker + interval toggle with
 *        direction-aware messaging (upgrade = prorated charge today,
 *        downgrade = immediate switch with credit), and a card step for
 *        free-tier orgs with no saved payment method (reuses PaymentCardForm →
 *        billing.createSubscription; orgs with a card or a subscription go
 *        through billing.upgradeOrganization).
 * WHY:   Downgrade policy is IMMEDIATE-WITH-CREDIT (proration_behavior
 *        always_invoice server-side): unused time becomes a credit on future
 *        invoices, and features beyond the new plan's limits gate right away.
 *        The dialog says so before the user commits — no silent surprises.
 * WHERE: settings/billing BillingTab (all states, including free).
 */

import * as React from 'react'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { PLANS, PLAN_ORDER, type PlanKey, type BillingInterval } from '@/lib/config'
import { PlanSelector, BillingIntervalToggle } from './plan-selector'
import { StripeElementsProvider } from './stripe-elements-provider'
import { PaymentCardForm } from './payment-card-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ChangePlanDialogProps {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The org's current tier — drives upgrade/downgrade messaging. */
  currentPlan?: PlanKey
  /** True when a Stripe subscription exists (change = update in place). */
  hasSubscription?: boolean
  /** True when a saved card exists (create can charge the default card). */
  hasPaymentMethod?: boolean
}

type Direction = 'upgrade' | 'downgrade' | 'interval' | 'new'

/* PLAN_ORDER index comparison — 'free' sits at index 0, so a free org always
 * reads as an upgrade. */
function planChangeDirection(current: PlanKey | undefined, next: PlanKey): Direction {
  if (!current || current === 'free' || current === 'portal') return 'new'
  if (current === next) return 'interval'
  return PLAN_ORDER.indexOf(next) > PLAN_ORDER.indexOf(current) ? 'upgrade' : 'downgrade'
}

function directionCopy(direction: Direction, nextPlanName: string): string {
  switch (direction) {
    case 'upgrade':
      return `Upgrading takes effect immediately — you'll be charged a prorated amount for the rest of the billing period.`
    case 'downgrade':
      return `Downgrading to ${nextPlanName} takes effect immediately. Unused time on your current plan is credited to future invoices, and features beyond the ${nextPlanName} limits become unavailable right away.`
    case 'interval':
      return 'Changing your billing interval applies immediately with proration.'
    case 'new':
      return 'Your subscription starts today.'
  }
}

export function ChangePlanDialog({
  organizationId,
  open,
  onOpenChange,
  currentPlan,
  hasSubscription = true,
  hasPaymentMethod = true,
}: ChangePlanDialogProps) {
  const utils = trpc.useUtils()
  const upgrade = trpc.billing.upgradeOrganization.useMutation()
  const createSubscription = trpc.billing.createSubscription.useMutation()
  const [plan, setPlan] = React.useState<Exclude<PlanKey, 'free' | 'portal'>>('pro')
  const [interval, setInterval] = React.useState<BillingInterval>('monthly')
  const [error, setError] = React.useState<string | null>(null)
  /* Free org without a saved card: collect one before creating. */
  const [cardStep, setCardStep] = React.useState(false)

  const direction = planChangeDirection(currentPlan, plan)
  const pending = upgrade.isPending || createSubscription.isPending

  const handlePlanChange = (next: PlanKey) => {
    if (next !== 'free' && next !== 'portal') setPlan(next)
  }

  function close(nextOpen: boolean) {
    if (!nextOpen) {
      setCardStep(false)
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  async function finish() {
    await Promise.all([
      utils.billing.getSubscription.invalidate({ organizationId }),
      utils.billing.getPaymentMethods.invalidate({ organizationId }),
      utils.usage.getFeatureGates.invalidate({ organizationId }),
    ])
    toast.success(`Switched to ${PLANS[plan].name}`)
    close(false)
  }

  async function handleSwitch() {
    setError(null)
    /* No subscription AND no card → collect the card first, then create. */
    if (!hasSubscription && !hasPaymentMethod) {
      setCardStep(true)
      return
    }
    try {
      await upgrade.mutateAsync({ organizationId, planKey: plan, billingInterval: interval })
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the plan.')
    }
  }

  async function handleCard(paymentMethodId: string) {
    setError(null)
    try {
      await createSubscription.mutateAsync({
        organizationId,
        planKey: plan,
        billingInterval: interval,
        paymentMethodId,
      })
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the subscription.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{cardStep ? 'Payment details' : 'Change plan'}</DialogTitle>
          <DialogDescription>
            {cardStep
              ? `Enter your card to start ${PLANS[plan].name} (${interval}).`
              : directionCopy(direction, PLANS[plan].name)}
          </DialogDescription>
        </DialogHeader>

        {cardStep ? (
          <div className="space-y-4">
            <StripeElementsProvider>
              <PaymentCardForm
                submitLabel={`Start ${PLANS[plan].name}`}
                processing={createSubscription.isPending}
                onPaymentMethod={handleCard}
              />
            </StripeElementsProvider>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCardStep(false)}
              disabled={createSubscription.isPending}
            >
              Back
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <BillingIntervalToggle interval={interval} onIntervalChange={setInterval} />
              {/* DISCOUNT SEAM: the promo-code input mounts here once discounts
                  launch — validate via discountCodeSchema, resolve through
                  discount.service.resolveDiscount, and pass `discountCode` to
                  the mutations below (both schemas already accept it). */}
              <PlanSelector selectedPlan={plan} onPlanChange={handlePlanChange} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={handleSwitch} disabled={pending}>
                {pending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                Switch to {PLANS[plan].name}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
