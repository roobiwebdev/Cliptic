/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: metadata, RootLayout
 *
 * WHAT:  Root <html>/<body> layout, global metadata, and the mount point for
 *        TRPCReactProvider (which hosts the QueryClient, the optimistic
 *        feature-gate observer, and the AuthRedirectObserver).
 * WHY:   The tRPC provider has to wrap every page so `trpc.X.useQuery()`
 *        calls anywhere in the tree share one cache, and so the cache
 *        observers (auth-redirect, feature-gate) can see every query /
 *        mutation. Mounting it at the root layout is the single place that
 *        makes that true for all routes.
 * WHERE: Reads BRANDING from src/lib/config; wraps every route segment under
 *        src/app/; renders TRPCReactProvider from src/trpc/react-provider.
 */

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { BRANDING } from '@/lib/config'
import {
  hasMissingRequiredEnv,
  getEnvChecklist,
  getOptionalEnvChecklist,
} from '@/lib/config/required-env'
import { TRPCReactProvider } from '@/trpc/react-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { SetupChecklist } from '@/components/global/setup-checklist'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

/* Geist is the app-wide sans font (matches funnelmods). Its variable
 * (--font-geist-sans) is set on <html>, where globals.css's `html { @apply
 * font-sans }` + `--font-sans: var(--font-geist-sans)` resolve it. Geist Mono
 * backs --font-geist-mono / the `font-mono` utility. */
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: BRANDING.metadataBase,
  title: {
    default: BRANDING.appName,
    template: `%s — ${BRANDING.appName}`,
  },
  description: BRANDING.appDescription,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('h-full', geistSans.variable, geistMono.variable)}
    >
      <body className="min-h-full flex flex-col antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* Developer setup gate: until every REQUIRED env var is set, show the
              checklist instead of the app (optional integrations fail soft and
              are not gated). */}
          {hasMissingRequiredEnv() ? (
            <SetupChecklist items={getEnvChecklist()} optional={getOptionalEnvChecklist()} />
          ) : (
            <TRPCReactProvider>{children}</TRPCReactProvider>
          )}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
