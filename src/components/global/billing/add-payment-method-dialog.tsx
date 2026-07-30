/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: AddPaymentMethodDialog, AddPaymentMethodForm
 *
 * WHAT:  Dialog that collects a card via Stripe Elements and attaches it to the
 *        org's customer (optionally as default) through billing.addPaymentMethod.
 * WHY:   Reusable billing primitive. Separate from the onboarding PaymentCardForm
 *        because this one adds a card to an existing customer (with a
 *        "set as default" choice), whereas onboarding tokenizes a card for the
 *        first subscription. Stripe Elements colors are literal + theme-derived
 *        (the iframe can't read CSS tokens).
 * WHERE: settings/billing BillingTab.
 */

import * as React from 'react'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useTheme } from 'next-themes'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { StripeElementsProvider } from './stripe-elements-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface AddPaymentMethodDialogProps {
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPaymentMethodDialog({
  organizationId,
  open,
  onOpenChange,
}: AddPaymentMethodDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add payment method</DialogTitle>
          <DialogDescription>
            Add a new card to your organization. Your payment information is securely processed by
            Stripe.
          </DialogDescription>
        </DialogHeader>
        <StripeElementsProvider>
          <AddPaymentMethodForm
            organizationId={organizationId}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </StripeElementsProvider>
      </DialogContent>
    </Dialog>
  )
}

function AddPaymentMethodForm({
  organizationId,
  onSuccess,
  onCancel,
}: {
  organizationId: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const utils = trpc.useUtils()
  const { resolvedTheme } = useTheme()
  const addPaymentMethod = trpc.billing.addPaymentMethod.useMutation()

  const [setAsDefault, setSetAsDefault] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [cardReady, setCardReady] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  /* Stripe iframe can't read CSS tokens — literal, theme-derived colors. */
  const isDark = resolvedTheme !== 'light'
  const cardTextColor = isDark ? '#ffffff' : '#0f172a'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!stripe || !elements) return
    const card = elements.getElement(CardElement)
    if (!card) return

    setSubmitting(true)
    setError(null)
    const result = await stripe.createPaymentMethod({ type: 'card', card })
    if (result.error || !result.paymentMethod) {
      setError(result.error?.message ?? 'Could not validate your card.')
      setSubmitting(false)
      return
    }

    try {
      await addPaymentMethod.mutateAsync({
        organizationId,
        paymentMethodId: result.paymentMethod.id,
        makeDefault: setAsDefault,
      })
      await utils.billing.getPaymentMethods.invalidate({ organizationId })
      toast.success('Payment method added')
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the payment method.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Card details</Label>
        <div className="rounded-md border p-3">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: cardTextColor,
                  '::placeholder': { color: '#71717a' },
                },
                invalid: { color: '#dc2626' },
              },
              hidePostalCode: false,
            }}
            onChange={(e) => {
              setError(e.error?.message ?? null)
              setCardReady(e.complete)
            }}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">
          Your payment information is securely processed by Stripe. We do not store your card
          details.
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="set-as-default"
          checked={setAsDefault}
          onCheckedChange={(checked) => setSetAsDefault(checked === true)}
        />
        <label htmlFor="set-as-default" className="text-sm font-medium leading-none">
          Set as default payment method
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || submitting || !cardReady}>
          {submitting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Adding...' : 'Add payment method'}
        </Button>
      </div>
    </form>
  )
}
