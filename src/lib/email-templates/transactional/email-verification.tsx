/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: EmailVerificationEmail, EmailVerificationEmailProps
 *
 * WHAT:  React Email template for the "verify your email" message.
 * WHY:   Better Auth's emailVerification.sendVerificationEmail passes the
 *        verification URL; this renders the branded CTA around it.
 * WHERE: Rendered by sendVerificationEmail in src/services/email.service.ts.
 */

import * as React from 'react'
import { Text } from '@react-email/components'
import { BaseLayout, EmailButton, emailStyles } from '../base-layout'

export interface EmailVerificationEmailProps {
  verificationLink: string
}

export function EmailVerificationEmail({ verificationLink }: EmailVerificationEmailProps) {
  return (
    <BaseLayout preview="Verify your email address">
      <Text style={emailStyles.title}>Verify your email</Text>
      <Text style={emailStyles.paragraph}>
        Confirm this email address to finish setting up your account.
      </Text>
      <EmailButton href={verificationLink}>Verify email</EmailButton>
      <Text style={emailStyles.note}>
        Or paste this link into your browser: {verificationLink}
      </Text>
    </BaseLayout>
  )
}

export default EmailVerificationEmail
