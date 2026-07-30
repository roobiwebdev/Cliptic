/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: auth, Session, User, getCachedSession
 *
 * WHAT:  Server-side Better Auth instance, inferred Session/User types, and a
 *        request-scoped session cache for use in server components and tRPC.
 * WHY:   Plugin order is load-bearing (admin before organization, nextCookies
 *        last) and session reads must be deduped per request to avoid Prisma
 *        pool exhaustion (P2024).
 * WHERE: Imported by src/proxy.ts, tRPC context (src/trpc/init.ts), every
 *        server component needing the user, and mirrored client-side by
 *        src/lib/better-auth/auth-client.ts.
 */

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import {
  organization,
  twoFactor,
  admin,
  lastLoginMethod,
} from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { cache } from 'react'
import { headers } from 'next/headers'

import { prisma } from '@/lib/config'
import { ac, roles } from '@/lib/better-auth/permissions'
import { APP_URL, APP_NAME, APP_DOMAIN } from '@/lib/config/branding'
import { REGISTRATION_OPEN } from '@/lib/config/registration'
import { isDevEmailFallbackActive } from '@/lib/config/resend'
import {
  sendVerificationEmail as sendVerificationEmailService,
  sendPasswordResetEmail as sendPasswordResetEmailService,
} from '@/services/email.service'

function resolveAuthSecret(): string {
  const secret = process.env['BETTER_AUTH_SECRET']
  if (secret && secret.length > 0) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[auth] BETTER_AUTH_SECRET is required in production. ' +
        'Generate one with: openssl rand -base64 32'
    )
  }

  console.warn(
    '[auth] BETTER_AUTH_SECRET is not set. Falling back to an INSECURE ' +
      'development-only key. DO NOT deploy without setting BETTER_AUTH_SECRET.'
  )
  return 'dev-only-secret-change-me'
}

function resolveGoogleProvider():
  | {
      socialProviders: {
        google: {
          clientId: string
          clientSecret: string
          disableImplicitSignUp: true
        }
      }
    }
  | Record<string, never> {
  const clientId = process.env['NEXT_PUBLIC_GOOGLE_CLIENT_ID']
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET']

  if (clientId && clientSecret) {
    return {
      socialProviders: {
        google: {
          clientId,
          clientSecret,
          disableImplicitSignUp: true,
        },
      },
    }
  }

  if (clientId && !clientSecret) {
    console.warn(
      '[auth] NEXT_PUBLIC_GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET ' +
        'is missing. Google OAuth is DISABLED until both are configured.'
    )
  } else if (!clientId && clientSecret) {
    console.warn(
      '[auth] GOOGLE_CLIENT_SECRET is set but NEXT_PUBLIC_GOOGLE_CLIENT_ID ' +
        'is missing. Google OAuth is DISABLED until both are configured.'
    )
  }

  return {}
}

const APP_DOMAIN_CONFIGURED =
  typeof process.env['NEXT_PUBLIC_APP_DOMAIN'] === 'string' &&
  process.env['NEXT_PUBLIC_APP_DOMAIN'].length > 0

/* Cross-subdomain mode + the matching trustedOrigins wildcard are both
 * gated on NEXT_PUBLIC_APP_DOMAIN — advertising cross-subdomain trust without
 * the env to back it up is a footgun. */
const crossSubDomainCookies = APP_DOMAIN_CONFIGURED
  ? { enabled: true as const, domain: `.${APP_DOMAIN}` }
  : { enabled: false as const }

/**
 * SOURCE OF TRUTH KEYWORDS: auth
 *
 * WHAT:  The configured Better Auth server instance.
 * WHY:   Plugin order is load-bearing — admin BEFORE organization (org hooks
 *        read admin role context); nextCookies() LAST — captures Set-Cookie
 *        from every upstream plugin.
 * WHERE: Consumed everywhere a server-side session or auth.api call is needed.
 */
/* PLUGIN ORDER (load-bearing — do not reorder):
 *   admin BEFORE organization (org hooks read admin role context).
 *   nextCookies() LAST — captures Set-Cookie from every upstream plugin. */
export const auth = betterAuth({
  databaseHooks: {
    user: {
      create: {
        /* Closed-registration gate — last line of defense even if UI is bypassed. */
        before: async () => {
          if (!REGISTRATION_OPEN) {
            throw new Error(
              'Registration is currently closed. This platform is invitation-only.'
            )
          }
        },
      },
    },
  },

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  /* requireEmailVerification closes the account-linking takeover where an
   * attacker pre-registers victim@gmail.com and Better Auth later merges it
   * with the real victim's Google sign-in. It relaxes ONLY under the dev email
   * fallback (local dev + no RESEND_API_KEY), where sign-up would otherwise
   * dead-end because no verification mail can be delivered. Setting the key —
   * or any non-development NODE_ENV — restores enforcement automatically. */
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !isDevEmailFallbackActive(),
    async sendResetPassword({ user, url }: { user: { email: string }; url: string }) {
      /* Dev convenience: log the link too so local flows work without Resend
       * (sendPasswordResetEmailService no-ops when RESEND_API_KEY is unset). */
      console.info(`[auth] password reset for ${user.email}: ${url}`)
      await sendPasswordResetEmailService({ to: user.email, resetLink: url })
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
      console.info(`[auth] email verification for ${user.email}: ${url}`)
      await sendVerificationEmailService({ to: user.email, verificationLink: url })
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  plugins: [
    admin({
      impersonationSessionDuration: 60 * 60,
    }),
    organization({
      ac,
      roles,
      creatorRole: 'owner',
      allowUserToCreateOrganization: true,
      dynamicAccessControl: { enabled: true },
      async sendInvitationEmail() {},
    }),
    twoFactor({ issuer: APP_NAME }),
    lastLoginMethod(),
    nextCookies(),
  ],

  ...resolveGoogleProvider(),

  advanced: {
    crossSubDomainCookies,
    useSecureCookies:
      process.env.NODE_ENV === 'production' &&
      !process.env['NEXT_PUBLIC_APP_URL']?.startsWith('http://'),
  },

  secret: resolveAuthSecret(),

  baseURL: process.env['BETTER_AUTH_URL'] || APP_URL,

  trustedOrigins:
    process.env.NODE_ENV === 'development'
      ? ['*']
      : APP_DOMAIN_CONFIGURED
        ? [APP_URL, `https://*.${APP_DOMAIN}`]
        : [APP_URL],
})

/**
 * SOURCE OF TRUTH KEYWORDS: Session, User
 *
 * WHAT:  Inferred session and user types straight from Better Auth.
 * WHY:   Always prefer these over hand-rolled User/Session interfaces — the
 *        Better Auth schema is the source of truth (see RULE 1 in CLAUDE.md).
 * WHERE: Consumed by tRPC context and any server code typing the session.
 */
export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

/**
 * SOURCE OF TRUTH KEYWORDS: getCachedSession
 *
 * WHAT:  React-cache wrapped auth.api.getSession() — one call per request.
 * WHY:   Without this, the protected layout + tRPC context + every server
 *        component each fire their own query and the Prisma pool runs out
 *        (P2024); never cache sessions in Redis here — revocations must
 *        reflect immediately.
 * WHERE: Used by tRPC init, server components, and route handlers.
 */
/* Request-scoped session cache — one auth.api.getSession() per request,
 * regardless of how many callers ask. Without this, the protected layout +
 * tRPC context + every server component each fire their own query and the
 * Prisma pool runs out (P2024). Never cache sessions in Redis here —
 * revocations must reflect immediately. */
export const getCachedSession = cache(async () => {
  const requestHeaders = await headers()
  return auth.api.getSession({ headers: requestHeaders })
})
