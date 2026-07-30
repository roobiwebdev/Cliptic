/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: PasswordResetEmail, PasswordResetEmailProps
 *
 * WHAT:  React Email template for the "reset your password" message.
 * WHY:   Better Auth's emailAndPassword.sendResetPassword passes the reset URL;
 *        this renders the branded CTA around it.
 * WHERE: Rendered by sendPasswordResetEmail in src/services/email.service.ts.
 */

import * as React from 'react'
import { Text } from '@react-email/components'
import { BaseLayout, EmailButton, emailStyles } from '../base-layout'

export interface PasswordResetEmailProps {
  resetLink: string
}

export function PasswordResetEmail({ resetLink }: PasswordResetEmailProps) {
  return (
    <BaseLayout preview="Reset your password">
      <Text style={emailStyles.title}>Reset your password</Text>
      <Text style={emailStyles.paragraph}>
        We received a request to reset your password. Click below to choose a new one. This
        link expires shortly.
      </Text>
      <EmailButton href={resetLink}>Reset password</EmailButton>
      <Text style={emailStyles.note}>
        Didn’t request this? You can safely ignore this email — your password won’t change.
      </Text>
    </BaseLayout>
  )
}

export default PasswordResetEmail
