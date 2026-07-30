/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: PaymentCardForm
 *
 * WHAT:  Collects a card via Stripe CardElement, turns it into a
 *        paymentMethodId, and hands it to the parent's onPaymentMethod.
 * WHY:   This is the client half of the custom Elements billing flow — the
 *        card never touches our server, only the resulting payment-method id
 *        does (passed to billing.createSubscription / addPaymentMethod). The
 *        parent owns the server call and surfaces its own error.
 * WHERE: Used inside StripeElementsProvider in onboarding + billing settings.
 */

import * as React from 'react'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useTheme } from 'next-themes'
import { Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function PaymentCardForm({
  onPaymentMethod,
  submitLabel = 'Save card',
  processing = false,
}: {
  /* Receives the tokenized payment-method id; resolve when the parent's
   * server call finishes (errors surfaced by the parent). */
  onPaymentMethod: (paymentMethodId: string) => Promise<void>
  submitLabel?: string
  processing?: boolean
}) {
  const stripe = useStripe()
  const elements = useElements()
  const { resolvedTheme } = useTheme()
  const [cardError, setCardError] = React.useState<string | null>(null)
  const [tokenizing, setTokenizing] = React.useState(false)

  /* Stripe Elements renders in an iframe, so it CANNOT read our CSS variables /
   * Tailwind tokens — it only accepts literal color strings. These are the
   * sanctioned exception to the no-hardcoded-colors rule: derived per theme so
   * the card field still matches light/dark. (Pattern from funnelmods.) */
  const isDark = resolvedTheme !== 'light'
  const cardTextColor = isDark ? '#ffffff' : '#0f172a'
  const cardPlaceholderColor = '#71717a'
  const cardInvalidColor = '#dc2626'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!stripe || !elements) return
    const card = elements.getElement(CardElement)
    if (!card) return

    setCardError(null)
    setTokenizing(true)
    const result = await stripe.createPaymentMethod({ type: 'card', card })
    setTokenizing(false)

    if (result.error || !result.paymentMethod) {
      setCardError(result.error?.message ?? 'Could not validate your card.')
      return
    }
    await onPaymentMethod(result.paymentMethod.id)
  }

  const busy = tokenizing || processing || !stripe

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="rounded-md border px-3 py-3">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '15px',
                color: cardTextColor,
                '::placeholder': { color: cardPlaceholderColor },
              },
              invalid: { color: cardInvalidColor },
            },
          }}
          onChange={(e) => setCardError(e.error?.message ?? null)}
        />
      </div>
      {cardError ? <p className="text-sm text-destructive">{cardError}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  )
}
