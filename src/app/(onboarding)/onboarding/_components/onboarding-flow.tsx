/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: OnboardingFlow
 *
 * WHAT:  Client onboarding wizard — name the organization → pick a plan →
 *        (paid) enter a card. Free finishes immediately; paid creates the org
 *        then attaches a subscription via the custom Elements flow.
 * WHY:   The org is always created locally first (free tier), so there's no
 *        dependency on the webhook to provision it; a paid plan then calls
 *        billing.createSubscription and the webhook upgrades the tier. RHF +
 *        zod on the name input per CLAUDE.md.
 * WHERE: Rendered by the onboarding page. Talks to
 *        trpc.organization.createOrganization, trpc.billing.createSubscription,
 *        and authClient.organization.setActive.
 */

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import { ROUTES, isPaidPlan, PLANS, type PlanKey, type BillingInterval } from '@/lib/config'
import { createOrganizationSchema, type CreateOrganizationValues } from '@/lib/types'
import { PlatformLogo } from '@/components/global/platform-logo'
import {
  StripeElementsProvider,
  PaymentCardForm,
  PlanSelector,
  BillingIntervalToggle,
} from '@/components/global/billing'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

type Step = 'details' | 'plan' | 'payment'
interface CreatedOrg {
  organizationId: string
  slug: string
}

export function OnboardingFlow() {
  const [step, setStep] = React.useState<Step>('details')
  const [name, setName] = React.useState('')
  const [selectedPlan, setSelectedPlan] = React.useState<PlanKey>('free')
  const [interval, setInterval] = React.useState<BillingInterval>('monthly')
  const [createdOrg, setCreatedOrg] = React.useState<CreatedOrg | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const createOrganization = trpc.organization.createOrganization.useMutation()
  const createSubscription = trpc.billing.createSubscription.useMutation()

  const form = useForm<CreateOrganizationValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '' },
    mode: 'onTouched',
  })

  const stepNumber = step === 'details' ? 1 : step === 'plan' ? 2 : 3
  const totalSteps = isPaidPlan(selectedPlan) ? 3 : 2

  /* Creates the org once; reused if the user steps back and forth. */
  async function ensureOrg(): Promise<CreatedOrg> {
    if (createdOrg) return createdOrg
    const result = await createOrganization.mutateAsync({ name })
    setCreatedOrg(result)
    return result
  }

  async function finish(org: CreatedOrg) {
    await authClient.organization.setActive({
      organizationId: org.organizationId,
      organizationSlug: org.slug,
    })
    window.location.assign(ROUTES.dashboard)
  }

  function onDetailsSubmit(values: CreateOrganizationValues) {
    setName(values.name)
    setError(null)
    setStep('plan')
  }

  async function onPlanContinue() {
    setError(null)
    setBusy(true)
    try {
      const org = await ensureOrg()
      if (isPaidPlan(selectedPlan)) {
        setBusy(false)
        setStep('payment')
        return
      }
      await finish(org)
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Could not create your organization.')
    }
  }

  async function onPaymentMethod(paymentMethodId: string) {
    setError(null)
    if (selectedPlan === 'free' || selectedPlan === 'portal') return
    try {
      const org = await ensureOrg()
      await createSubscription.mutateAsync({
        organizationId: org.organizationId,
        planKey: selectedPlan,
        billingInterval: interval,
        paymentMethodId,
        expectTrial: PLANS[selectedPlan].trialDays > 0,
      })
      await finish(org)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your subscription.')
    }
  }

  return (
    <div className="min-h-svh bg-background p-4 md:p-8">
      <div className="mx-auto w-full max-w-md space-y-8 pt-8 md:pt-16">
        <div className="flex justify-center">
          <PlatformLogo href="/" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Step {stepNumber} of {totalSteps}
        </p>

        {step === 'details' ? (
          <div className="space-y-6">
            <StepHeading
              title="Create your organization"
              description="This is your workspace. You can rename it or invite teammates later."
            />
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onDetailsSubmit)} className="space-y-6" noValidate>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization name</FormLabel>
                      <FormControl>
                        <Input type="text" autoComplete="organization" placeholder="Acme Inc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" className="w-full sm:w-auto">
                    Continue
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        ) : null}

        {step === 'plan' ? (
          <div className="space-y-6">
            <StepHeading
              title="Choose your plan"
              description="Start free or pick a paid plan — you can change it anytime."
            />
            <BillingIntervalToggle interval={interval} onIntervalChange={setInterval} />
            <PlanSelector selectedPlan={selectedPlan} onPlanChange={setSelectedPlan} includeFree />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('details')} disabled={busy}>
                Back
              </Button>
              <Button className="w-full sm:w-auto" onClick={onPlanContinue} disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {isPaidPlan(selectedPlan) ? 'Continue to payment' : 'Get started free'}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'payment' ? (
          <div className="space-y-6">
            <StepHeading
              title="Payment details"
              description="Enter your card to start your subscription."
            />
            <StripeElementsProvider>
              <PaymentCardForm
                submitLabel="Start subscription"
                processing={createSubscription.isPending || createOrganization.isPending}
                onPaymentMethod={onPaymentMethod}
              />
            </StripeElementsProvider>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-start">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep('plan')} disabled={createSubscription.isPending}>
                Back
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
