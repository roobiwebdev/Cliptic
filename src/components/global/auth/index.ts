/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: AuthForm, AuthShell, ForgotPasswordForm,
 *   ResetPasswordForm, AuthFormProps, AuthShellProps
 *
 * WHAT:  Barrel export for the global auth UI primitives. Mode/schema types
 *        deliberately re-exported from @/lib/types (the type source of
 *        truth) — NOT from here.
 * WHY:   One import surface for UI; one separate surface for contracts.
 * WHERE: Imported by every page under src/app/(auth)/.
 */

export { AuthForm } from './auth-form'
export type { AuthFormProps } from './auth-form'
export { AuthShell } from './auth-shell'
export type { AuthShellProps } from './auth-shell'
export { ForgotPasswordForm } from './forgot-password-form'
export { ResetPasswordForm } from './reset-password-form'
