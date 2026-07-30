/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: BaseLayout, emailStyles, EmailButton
 *
 * WHAT:  Shared chrome for every transactional email — Html/Head/Body/Container
 *        wrapper, brand header, footer, the `emailStyles` token object, and a
 *        small <EmailButton> CTA.
 * WHY:   One visual source so a rebrand (logo, colors, footer) happens here and
 *        flows to every template; tokens keep inline styles consistent across
 *        the verification, reset, and invitation emails.
 * WHERE: Imported by every template under src/lib/email-templates/transactional/*;
 *        templates are rendered to HTML in src/services/email.service.ts.
 */

import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import { APP_NAME } from '@/lib/config/branding'

/**
 * SOURCE OF TRUTH KEYWORDS: emailStyles
 *
 * WHAT:  Inline style tokens shared by all templates (email clients ignore
 *        external CSS, so styles must be inline).
 * WHY:   Single place to tune typography/colors; swap to brand colors here.
 * WHERE: Spread into <Text>/<Button> style props in the templates.
 */
export const emailStyles = {
  body: {
    backgroundColor: '#f5f5f5',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: '40px 0',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    margin: '0 auto',
    maxWidth: '520px',
    padding: '40px',
  },
  brand: {
    color: '#111111',
    fontSize: '20px',
    fontWeight: 700,
    margin: '0 0 24px',
  },
  title: {
    color: '#111111',
    fontSize: '22px',
    fontWeight: 600,
    margin: '0 0 16px',
  },
  paragraph: {
    color: '#444444',
    fontSize: '15px',
    lineHeight: '24px',
    margin: '0 0 16px',
  },
  ctaButton: {
    backgroundColor: '#111111',
    borderRadius: '8px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 600,
    padding: '12px 24px',
    textDecoration: 'none',
  },
  note: {
    color: '#888888',
    fontSize: '13px',
    lineHeight: '20px',
    margin: '16px 0 0',
  },
  hr: {
    borderColor: '#eaeaea',
    margin: '28px 0',
  },
  footer: {
    color: '#999999',
    fontSize: '12px',
    lineHeight: '18px',
    margin: 0,
  },
} as const

/**
 * SOURCE OF TRUTH KEYWORDS: EmailButton
 *
 * WHAT:  A styled CTA button wrapping @react-email Button.
 * WHY:   Keeps the CTA visual identical across templates.
 * WHERE: Used inside each template's body.
 */
export function EmailButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button href={href} style={emailStyles.ctaButton}>
      {children}
    </Button>
  )
}

/**
 * SOURCE OF TRUTH KEYWORDS: BaseLayout
 *
 * WHAT:  Outer wrapper rendering the brand header, the template body
 *        (children), and the footer.
 * WHY:   Every template renders inside this so layout/footer live in one place.
 * WHERE: Wraps the body of every transactional template.
 */
export function BaseLayout({
  preview,
  children,
}: {
  preview: string
  children: React.ReactNode
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.container}>
          <Text style={emailStyles.brand}>{APP_NAME}</Text>
          {children}
          <Hr style={emailStyles.hr} />
          <Text style={emailStyles.footer}>
            © {APP_NAME}. If you didn’t expect this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
