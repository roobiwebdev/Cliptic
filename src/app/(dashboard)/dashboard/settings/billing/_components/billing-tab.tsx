/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: BillingTab, BillingSkeleton
 *
 * WHAT:  Billing settings body — a Subscription section (plan, status, renewal
 *        date, change/cancel/reactivate) and a Payment Methods section (list +
 *        add / set-default / remove). Matches the funnelmods settings design.
 * WHY:   Reads from billing.getSubscription / billing.getPaymentMethods and
 *        drives the mutations; the DB row updates arrive via the Stripe webhook,
 *        so after each action we invalidate to re-read. Actions are UX-gated by
 *        the same billing permissions the server enforces. Reuses the global
 *        SettingsSection / PaymentMethodRow / AddPaymentMethodDialog /
 *        ChangePlanDialog components.
 * WHERE: Rendered by settings/billing page.
 */

import * as React from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Calendar,
  CreditCard,
  Loader2Icon,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { SettingsSection } from '@/components/global/settings-section'
import {
  PaymentMethodRow,
  AddPaymentMethodDialog,
  ChangePlanDialog,
} from '@/components/global/billing'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

export function BillingTab() {
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id
  const orgId = organizationId ?? ''
  const enabled = organizationId !== undefined

  const utils = trpc.useUtils()
  const subscriptionQuery = trpc.billing.getSubscription.useQuery({ organizationId: orgId }, { enabled })
  const paymentMethodsQuery = trpc.billing.getPaymentMethods.useQuery({ organizationId: orgId }, { enabled })

  const canManage = hasPermission(permissions.BILLING_UPDATE)
  const canAdd = hasPermission(permissions.BILLING_CREATE)

  const [addOpen, setAddOpen] = React.useState(false)
  const [changePlanOpen, setChangePlanOpen] = React.useState(false)

  async function refresh() {
    await Promise.all([
      utils.billing.getSubscription.invalidate({ organizationId: orgId }),
      utils.billing.getPaymentMethods.invalidate({ organizationId: orgId }),
      utils.usage.getFeatureGates.invalidate({ organizationId: orgId }),
    ])
  }

  const cancel = trpc.billing.cancelSubscription.useMutation({
    onSuccess: async () => {
      toast.success('Subscription canceled')
      await refresh()
    },
    onError: (e) => toast.error(e.message || 'Failed to cancel subscription'),
  })
  const reactivate = trpc.billing.reactivateSubscription.useMutation({
    onSuccess: async () => {
      toast.success('Subscription reactivated')
      await refresh()
    },
    onError: (e) => toast.error(e.message || 'Failed to reactivate subscription'),
  })
  const setDefault = trpc.billing.setDefaultPaymentMethod.useMutation({
    onSuccess: async () => {
      toast.success('Default payment method updated')
      await utils.billing.getPaymentMethods.invalidate({ organizationId: orgId })
    },
    onError: () => toast.error('Failed to set default payment method'),
  })
  const remove = trpc.billing.deletePaymentMethod.useMutation({
    onSuccess: async () => {
      toast.success('Payment method removed')
      await utils.billing.getPaymentMethods.invalidate({ organizationId: orgId })
    },
    onError: () => toast.error('Failed to remove payment method'),
  })

  if (isLoadingOrg && !activeOrganization) return <BillingSkeleton />
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">
          No active organization found. Please complete onboarding first.
        </p>
      </div>
    )
  }
  if (
    (subscriptionQuery.isLoading && !subscriptionQuery.data) ||
    (paymentMethodsQuery.isLoading && !paymentMethodsQuery.data)
  ) {
    return <BillingSkeleton />
  }

  const data = subscriptionQuery.data
  const subscription = data?.subscription ?? null
  const isCanceled = subscription?.cancelAtPeriodEnd ?? false
  const periodEnd = subscription?.periodEnd ?? null
  const methods = paymentMethodsQuery.data ?? []

  function handleCancel() {
    if (!organizationId) return
    if (!window.confirm('Cancel your subscription? It stays active until the period ends.')) return
    cancel.mutate({ organizationId })
  }
  function handleRemove(paymentMethodId: string) {
    if (!organizationId) return
    const target = methods.find((m) => m.id === paymentMethodId)
    if (target?.isDefault) {
      toast.error('Set another card as default before removing this one.')
      return
    }
    if (!window.confirm('Remove this payment method?')) return
    remove.mutate({ organizationId, paymentMethodId })
  }

  return (
    <>
      <div className="space-y-8">
        {subscription ? (
          <SettingsSection
            title="Subscription"
            description="Manage your subscription plan and billing cycle"
            label="Current Plan"
            labelDescription="Your active subscription details"
          >
            <div className="space-y-6">
              {isCanceled && periodEnd ? (
                <Alert className="border-destructive bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <AlertTitle className="text-destructive">Subscription canceled</AlertTitle>
                  <AlertDescription className="space-y-3 text-sm">
                    <p>
                      Your subscription will end on{' '}
                      <strong>{format(new Date(periodEnd), 'MMMM d, yyyy')}</strong>.
                    </p>
                    <Button
                      onClick={() => organizationId && reactivate.mutate({ organizationId })}
                      disabled={reactivate.isPending}
                      size="lg"
                      className="w-full gap-2"
                    >
                      {reactivate.isPending ? (
                        <>
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                          Reactivating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Reactivate subscription
                        </>
                      )}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Plan</Label>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{data?.planName}</p>
                      {data?.isOnTrial ? (
                        <Badge variant="secondary" className="text-xs">
                          Trial
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <Label>Billing</Label>
                    <p className="text-sm font-medium capitalize">{data?.billingInterval ?? 'N/A'}</p>
                  </div>
                </div>

                {periodEnd ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {isCanceled ? 'Ends' : 'Renews'} on {format(new Date(periodEnd), 'MMMM d, yyyy')}
                    </span>
                  </div>
                ) : null}

                {!isCanceled && canManage ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => setChangePlanOpen(true)} size="sm" className="gap-2">
                      <Sparkles className="h-4 w-4" />
                      Change plan
                    </Button>
                    <Button
                      onClick={handleCancel}
                      disabled={cancel.isPending}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      {cancel.isPending ? (
                        <>
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                          Canceling...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4" />
                          Cancel subscription
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </SettingsSection>
        ) : null}

        <SettingsSection
          title="Payment Methods"
          description="Manage your saved payment methods"
          label="Saved Cards"
          labelDescription="Payment methods for your subscription."
        >
          {methods.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
              <CreditCard className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">No payment methods on file</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a payment method to manage your subscription
              </p>
              {canAdd ? (
                <Button onClick={() => setAddOpen(true)} variant="outline" size="sm" className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Add payment method
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Always keep a second card on file.</p>
              {methods.map((method) => (
                <PaymentMethodRow
                  key={method.id}
                  method={method}
                  canManage={canManage}
                  onSetDefault={(id) => organizationId && setDefault.mutate({ organizationId, paymentMethodId: id })}
                  onDelete={handleRemove}
                  settingDefault={setDefault.isPending && setDefault.variables?.paymentMethodId === method.id}
                  deleting={remove.isPending && remove.variables?.paymentMethodId === method.id}
                />
              ))}
              {canAdd ? (
                <Button onClick={() => setAddOpen(true)} variant="outline" size="sm" className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add new payment method
                </Button>
              ) : null}
            </div>
          )}
        </SettingsSection>
      </div>

      {organizationId ? (
        <>
          <AddPaymentMethodDialog organizationId={organizationId} open={addOpen} onOpenChange={setAddOpen} />
          <ChangePlanDialog
            organizationId={organizationId}
            open={changePlanOpen}
            onOpenChange={setChangePlanOpen}
          />
        </>
      ) : null}
    </>
  )
}

/* Mirrors the two-section layout so the swap-in is flicker-free. */
function BillingSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((section) => (
        <div key={section} className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Separator />
          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="max-w-md space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
