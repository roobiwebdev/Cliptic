/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: signInSchema, signUpSchema, SignInValues,
 *   SignUpValues, AuthFormMode, AUTH_PASSWORD_MIN_LENGTH, authSchemaFor
 *
 * WHAT:  Zod schemas + inferred value types for the email+password auth
 *        flows, plus the `AuthFormMode` discriminator and a tiny
 *        `authSchemaFor(mode)` lookup so the form can pick a schema by mode.
 * WHY:   Forms, server validators, and future server actions all need the
 *        same input contract — keeping the schemas in `lib/types` (the
 *        type source-of-truth folder per CLAUDE.md) means every caller
 *        infers from the SAME zod object and drift is impossible.
 * WHERE: Imported by src/components/global/auth/auth-form.tsx today; any
 *        future server-side auth router/route handler MUST `safeParse`
 *        against these schemas so the client and server agree byte-for-byte.
 */

import { z } from 'zod'

/* Server (auth.ts) does not impose a max; Better Auth's own bcrypt path
 * caps at 72 bytes, but most users will not see that. The 8-character
 * minimum matches the `minLength={8}` hint we surface in the UI. */
export const AUTH_PASSWORD_MIN_LENGTH = 8

/**
 * SOURCE OF TRUTH KEYWORDS: signInSchema, SignInValues
 *
 * WHAT:  Sign-in payload schema — trimmed email + non-empty password.
 * WHY:   Password length is NOT re-validated here because old accounts may
 *        predate the current 8-char minimum; we only block empty input.
 * WHERE: Used by AuthForm in sign-in mode.
 */
export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
})

export type SignInValues = z.infer<typeof signInSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: signUpSchema, SignUpValues
 *
 * WHAT:  Sign-up payload schema — name + email + password (>= 8 chars).
 * WHY:   `name` is required by Better Auth's email/password sign-up; we
 *        enforce >= 8 here so the user gets a clear validation error before
 *        the round-trip instead of a generic server reject.
 * WHERE: Used by AuthForm in sign-up mode.
 */
export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120, 'Name is too long.'),
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email.'),
  password: z
    .string()
    .min(AUTH_PASSWORD_MIN_LENGTH, `At least ${AUTH_PASSWORD_MIN_LENGTH} characters.`),
})

export type SignUpValues = z.infer<typeof signUpSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: AuthFormMode
 *
 * WHAT:  Discriminator for which auth flow the global AuthForm runs.
 * WHY:   Lives next to the schemas so adding a future mode (magic-link,
 *        password-reset) means adding a schema + extending this union and
 *        the lookup below — one file, one diff.
 * WHERE: Consumed by AuthForm and the (auth) route pages.
 */
export type AuthFormMode = 'sign-in' | 'sign-up'

/**
 * SOURCE OF TRUTH KEYWORDS: AuthValuesByMode
 *
 * WHAT:  Type-level mapping mode → inferred values, so the form's generic
 *        `useForm<AuthValuesByMode[Mode]>()` lights up the right field set.
 * WHY:   Avoids per-mode prop overloads on AuthForm and keeps `field.name`
 *        typed against the exact schema being used.
 * WHERE: Consumed by AuthForm via generic constraint.
 */
export interface AuthValuesByMode {
  'sign-in': SignInValues
  'sign-up': SignUpValues
}

/**
 * SOURCE OF TRUTH KEYWORDS: authSchemaFor
 *
 * WHAT:  Runtime lookup: `mode` → its zod schema.
 * WHY:   Lets the form pass the right resolver without a switch at every
 *        call-site; the `as` narrowing is safe because both keys are
 *        exhaustively present.
 * WHERE: Used by AuthForm to build the zodResolver.
 */
export const authSchemaFor = {
  'sign-in': signInSchema,
  'sign-up': signUpSchema,
} as const satisfies Record<AuthFormMode, z.ZodType>

/**
 * SOURCE OF TRUTH KEYWORDS: forgotPasswordSchema, ForgotPasswordValues
 *
 * WHAT:  Forgot-password request payload — just the email.
 * WHERE: Used by the forgot-password form.
 */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email.'),
})

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: resetPasswordSchema, ResetPasswordValues
 *
 * WHAT:  Reset-password payload — new password + confirmation (must match).
 * WHERE: Used by the reset-password form.
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(AUTH_PASSWORD_MIN_LENGTH, `At least ${AUTH_PASSWORD_MIN_LENGTH} characters.`),
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
