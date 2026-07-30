/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ChangePlanDialog, ChangePlanDialogProps
 *
 * WHAT:  Dialog to switch plan / billing interval — plan picker + interval
 *        toggle + a switch button that calls billing.upgradeOrganization
 *        (proration handled server-side; the webhook syncs the row).
 * WHY:   Reusable plan-change surface opened by the billing tab's "Change Plan"
 *        button. Uses the shared PlanSelector / BillingIntervalToggle.
 * WHERE: settings/billing BillingTab.
 */

import * as React from 'react'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { PLANS, type PlanKey, type BillingInterval } from '@/lib/config'
import { PlanSelector, BillingIntervalToggle } from './plan-selector'
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
}

export function ChangePlanDialog({ organizationId, open, onOpenChange }: ChangePlanDialogProps) {
  const utils = trpc.useUtils()
  const upgrade = trpc.billing.upgradeOrganization.useMutation()
  const [plan, setPlan] = React.useState<Exclude<PlanKey, 'free' | 'portal'>>('pro')
  const [interval, setInterval] = React.useState<BillingInterval>('monthly')
  const [error, setError] = React.useState<string | null>(null)

  const handlePlanChange = (next: PlanKey) => {
    if (next !== 'free' && next !== 'portal') setPlan(next)
  }

  async function handleSwitch() {
    setError(null)
    try {
      await upgrade.mutateAsync({ organizationId, planKey: plan, billingInterval: interval })
      await Promise.all([
        utils.billing.getSubscription.invalidate({ organizationId }),
        utils.usage.getFeatureGates.invalidate({ organizationId }),
      ])
      toast.success(`Switched to ${PLANS[plan].name}`)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the plan.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Switch your plan or billing interval. Proration applies automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <BillingIntervalToggle interval={interval} onIntervalChange={setInterval} />
          <PlanSelector selectedPlan={plan} onPlanChange={handlePlanChange} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upgrade.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSwitch} disabled={upgrade.isPending}>
            {upgrade.isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
            Switch to {PLANS[plan].name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
