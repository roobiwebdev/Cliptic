/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: TrialEndingEmail, TrialEndingEmailProps, trial_will_end
 *
 * WHAT:  React Email template warning that a free trial ends soon.
 * WHY:   Stripe fires customer.subscription.trial_will_end ~3 days before the
 *        trial converts to a paid charge; the user deserves the heads-up and a
 *        link to manage (or cancel) before being billed.
 * WHERE: Rendered by sendTrialEndingEmail in src/services/email.service.ts,
 *        triggered from the Stripe webhook route.
 */

import * as React from 'react'
import { Text } from '@react-email/components'
import { BaseLayout, EmailButton, emailStyles } from '../base-layout'

export interface TrialEndingEmailProps {
  organizationName: string
  /** Human-readable trial end date (pre-formatted by the sender). */
  trialEndDate: string
  billingLink: string
}

export function TrialEndingEmail({
  organizationName,
  trialEndDate,
  billingLink,
}: TrialEndingEmailProps) {
  return (
    <BaseLayout preview={`Your trial for ${organizationName} ends soon`}>
      <Text style={emailStyles.title}>Your trial ends soon</Text>
      <Text style={emailStyles.paragraph}>
        The free trial for <strong>{organizationName}</strong> ends on{' '}
        <strong>{trialEndDate}</strong>. After that, your subscription starts
        and your payment method on file will be charged.
      </Text>
      <Text style={emailStyles.paragraph}>
        Want to change plans or cancel before then? You can manage everything
        from your billing settings.
      </Text>
      <EmailButton href={billingLink}>Manage subscription</EmailButton>
      <Text style={emailStyles.note}>
        Or paste this link into your browser: {billingLink}
      </Text>
    </BaseLayout>
  )
}

export default TrialEndingEmail
