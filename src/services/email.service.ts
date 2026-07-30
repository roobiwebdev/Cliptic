/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: sendVerificationEmail, sendPasswordResetEmail,
 *   sendOrganizationInvitationEmail, EmailSendResult, renderAndSend
 *
 * WHAT:  The single transactional-email abstraction — renders a React Email
 *        template to HTML and sends it through Resend.
 * WHY:   Services only do one job; this one owns "turn a template + props into
 *        a delivered email". It fail-soft no-ops when Resend isn't configured
 *        (warns + returns a skipped result) so local dev runs without a key —
 *        Better Auth additionally logs the verification/reset URL in that case.
 * WHERE: Called by src/lib/better-auth/auth.ts (verification + reset hooks) and
 *        by the invitation router (src/trpc/routers/invitation.ts). Renders
 *        templates from src/lib/email-templates; sends via Resend
 *        (src/lib/config/resend.ts).
 */

import * as React from 'react'
import { render } from '@react-email/render'
import {
  getResendClient,
  RESEND_DEFAULT_FROM,
  isResendConfigured,
} from '@/lib/config/resend'
import {
  EmailVerificationEmail,
  PasswordResetEmail,
  TeamInvitationEmail,
} from '@/lib/email-templates'
import { recordDevEmail } from '@/lib/dev-email-outbox'

/**
 * SOURCE OF TRUTH KEYWORDS: EmailSendResult
 *
 * WHAT:  Uniform return shape for every send — success flag, optional message
 *        id, optional error, and a `skipped` flag when Resend is unconfigured.
 * WHY:   Callers can log/branch without try/catch; a skipped send is not an
 *        error (it's expected in local dev without a key).
 * WHERE: Returned by every sender below.
 */
export interface EmailSendResult {
  success: boolean
  skipped: boolean
  messageId?: string
  error?: string
}

const SKIPPED: EmailSendResult = { success: false, skipped: true }

/* Renders the template to HTML and sends via Resend. No-ops (warns) when the
 * API key is unset so the surrounding flow (sign-up, invite) still succeeds —
 * and records the action link to the dev outbox so the UI can surface it. */
async function renderAndSend(args: {
  to: string
  subject: string
  template: React.ReactElement
  /* The primary action URL in the email (verification / reset / invite link).
   * Recorded to the dev outbox when the send is skipped for lack of an API key. */
  devLink?: string
}): Promise<EmailSendResult> {
  if (!isResendConfigured()) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping "${args.subject}" to ${args.to}.`
    )
    if (args.devLink) {
      recordDevEmail({ to: args.to, subject: args.subject, link: args.devLink })
    }
    return SKIPPED
  }

  const client = getResendClient()
  if (!client) return SKIPPED

  try {
    const html = await render(args.template)
    const { data, error } = await client.emails.send({
      from: RESEND_DEFAULT_FROM,
      to: args.to,
      subject: args.subject,
      html,
    })
    if (error) {
      console.error('[email] Resend send failed:', error)
      return { success: false, skipped: false, error: error.message }
    }
    return { success: true, skipped: false, messageId: data?.id }
  } catch (err) {
    console.error('[email] render/send threw:', err)
    return {
      success: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: sendVerificationEmail
 *
 * WHAT:  Sends the email-verification message with the Better Auth link.
 * WHERE: Called by emailVerification.sendVerificationEmail in auth.ts.
 */
export function sendVerificationEmail(args: {
  to: string
  verificationLink: string
}): Promise<EmailSendResult> {
  return renderAndSend({
    to: args.to,
    subject: 'Verify your email',
    template: React.createElement(EmailVerificationEmail, {
      verificationLink: args.verificationLink,
    }),
    devLink: args.verificationLink,
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: sendPasswordResetEmail
 *
 * WHAT:  Sends the password-reset message with the Better Auth link.
 * WHERE: Called by emailAndPassword.sendResetPassword in auth.ts.
 */
export function sendPasswordResetEmail(args: {
  to: string
  resetLink: string
}): Promise<EmailSendResult> {
  return renderAndSend({
    to: args.to,
    subject: 'Reset your password',
    template: React.createElement(PasswordResetEmail, { resetLink: args.resetLink }),
    devLink: args.resetLink,
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: sendOrganizationInvitationEmail
 *
 * WHAT:  Sends the team-invitation message with the accept link.
 * WHERE: Called by the invitation.create / invitation.resend router handlers.
 */
export function sendOrganizationInvitationEmail(args: {
  to: string
  inviterName: string
  organizationName: string
  invitationLink: string
  role?: string
}): Promise<EmailSendResult> {
  return renderAndSend({
    to: args.to,
    subject: `You're invited to join ${args.organizationName}`,
    template: React.createElement(TeamInvitationEmail, {
      inviterName: args.inviterName,
      organizationName: args.organizationName,
      invitationLink: args.invitationLink,
      ...(args.role !== undefined ? { role: args.role } : {}),
    }),
    devLink: args.invitationLink,
  })
}
