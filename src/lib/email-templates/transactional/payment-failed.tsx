/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PaymentFailedEmail, PaymentFailedEmailProps, dunning
 *
 * WHAT:  React Email template warning that a subscription payment failed.
 * WHY:   The dunning flow — Stripe retries the charge automatically (Smart
 *        Retries), so the message reassures access is kept for now and points
 *        at the billing page to update the card / retry. Sent on EVERY
 *        invoice.payment_failed attempt per product decision.
 * WHERE: Rendered by sendPaymentFailedEmail in src/services/email.service.ts,
 *        triggered from the Stripe webhook route.
 */

import * as React from 'react'
import { Text } from '@react-email/components'
import { BaseLayout, EmailButton, emailStyles } from '../base-layout'

export interface PaymentFailedEmailProps {
  organizationName: string
  billingLink: string
}

export function PaymentFailedEmail({
  organizationName,
  billingLink,
}: PaymentFailedEmailProps) {
  return (
    <BaseLayout preview={`Payment failed for ${organizationName}`}>
      <Text style={emailStyles.title}>Payment failed</Text>
      <Text style={emailStyles.paragraph}>
        We couldn&apos;t process the latest subscription payment for{' '}
        <strong>{organizationName}</strong>. Your access is unaffected for now —
        we&apos;ll retry the charge automatically over the next few days.
      </Text>
      <Text style={emailStyles.paragraph}>
        To avoid any interruption, update your payment method or retry the
        payment from your billing settings.
      </Text>
      <EmailButton href={billingLink}>Fix payment</EmailButton>
      <Text style={emailStyles.note}>
        Or paste this link into your browser: {billingLink}
      </Text>
    </BaseLayout>
  )
}

export default PaymentFailedEmail
