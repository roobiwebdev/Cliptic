/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: StripeElementsProvider
 *
 * WHAT:  Wraps children in Stripe <Elements> using the cached publishable-key
 *        promise; renders a "not configured" notice when the key is absent.
 * WHY:   CardElement-based collection needs only the Stripe promise (no
 *        clientSecret), so this is a thin provider reusable by onboarding and
 *        the billing settings card forms.
 * WHERE: Wraps PaymentCardForm in the onboarding payment step and the billing
 *        add-card dialog.
 */

import * as React from 'react'
import { Elements } from '@stripe/react-stripe-js'

import { getStripePromise } from '@/lib/stripe/get-stripe-promise'

export function StripeElementsProvider({ children }: { children: React.ReactNode }) {
  const stripePromise = getStripePromise()

  if (!stripePromise) {
    return (
      <p className="text-sm text-muted-foreground">
        Payments aren’t configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to enable checkout.
      </p>
    )
  }

  return <Elements stripe={stripePromise}>{children}</Elements>
}
