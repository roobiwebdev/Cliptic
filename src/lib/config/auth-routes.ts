/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: AUTH_ROUTES
 *
 * WHAT:  Auth-flow UI route paths — every `/sign-*` URL the app links or
 *        redirects to. The ONE place these strings live.
 * WHY:   Routes are NOT branding. BRANDING is for visual / textual identity
 *        (name, description, copy); deciding "where does the sign-in page
 *        live" is auth-flow architecture. Centralizing here kills the
 *        dual-source-of-truth bug where proxy.ts and auth-form.tsx each
 *        carried their own `/sign-up` literal. Pages never import this to
 *        redirect — the AuthRedirectObserver in src/trpc/react-provider.tsx
 *        is the only consumer of `signIn` for redirect purposes (proxy.ts
 *        uses it for the sign-up bounce; auth-form.tsx uses both for the
 *        cross-link footers). Per-page `redirect(AUTH_ROUTES.signIn)`
 *        defeats the layout-driven model and is an anti-pattern.
 * WHERE: Imported by src/proxy.ts (sign-up → sign-in bounce when
 *        registration is closed), src/trpc/react-provider.tsx
 *        (AuthRedirectObserver — the global UNAUTHORIZED handler), and
 *        src/components/global/auth/auth-form.tsx (footer cross-links).
 */

export const AUTH_ROUTES = {
  signIn: '/sign-in',
  signUp: '/sign-up',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const

export type AuthRouteKey = keyof typeof AUTH_ROUTES
