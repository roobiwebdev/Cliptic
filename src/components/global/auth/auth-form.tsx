/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: AuthForm, AuthFormProps, GOOGLE_OAUTH_ENABLED,
 *   authClient, signInSchema, signUpSchema, GoogleGlyph
 *
 * WHAT:  Reusable email+password+Google auth surface. `AuthForm` is a thin
 *        dispatcher that mounts a concrete RHF form per mode (sign-in or
 *        sign-up). The layout is a bare centered column (no card): centered
 *        heading, the form, a "Or continue with" Google button below the
 *        primary action, then a cross-link footer.
 * WHY:   CLAUDE.md mandates zod + react-hook-form for every input surface, so
 *        both forms resolve against the shared schemas in src/lib/types. Two
 *        concrete forms (not one generic) give exact RHF `Path<>` inference
 *        without `any`.
 * WHERE: Mounted by src/app/(auth)/sign-in|sign-up/page.tsx inside AuthShell;
 *        talks to authClient (src/lib/better-auth/auth-client.ts); schemas live
 *        in src/lib/types/auth.ts.
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2Icon, MailCheckIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/better-auth/auth-client'
import { AUTH_ROUTES } from '@/lib/config'
import { useDevEmailToast } from '@/hooks/use-dev-email-toast'
import {
  signInSchema,
  signUpSchema,
  type AuthFormMode,
  type SignInValues,
  type SignUpValues,
} from '@/lib/types'

/**
 * SOURCE OF TRUTH KEYWORDS: AuthFormProps
 *
 * WHAT:  Props for AuthForm — mode + optional post-success callback URL
 *        (defaults to "/").
 * WHERE: Used by the (auth) route pages.
 */
export interface AuthFormProps {
  mode: AuthFormMode
  callbackURL?: string
}

/* Mirrors auth.ts: Google is only wired when the public client ID is set. */
const GOOGLE_OAUTH_ENABLED = Boolean(process.env['NEXT_PUBLIC_GOOGLE_CLIENT_ID'])

/**
 * SOURCE OF TRUTH KEYWORDS: AuthForm
 *
 * WHAT:  Selects the concrete form by `mode`.
 * WHERE: Rendered by sign-in/page.tsx and sign-up/page.tsx.
 */
export function AuthForm({ mode, callbackURL = '/' }: AuthFormProps) {
  return mode === 'sign-in' ? (
    <SignInForm callbackURL={callbackURL} />
  ) : (
    <SignUpForm callbackURL={callbackURL} />
  )
}

/* ---------- Sign-in ---------- */

function SignInForm({ callbackURL }: { callbackURL: string }) {
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  })
  const { error, setError, google } = useAuthEffects()
  const isSubmitting = form.formState.isSubmitting
  const isBusy = isSubmitting || google.isPending

  async function onSubmit(values: SignInValues) {
    setError(null)
    const { error: authError } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    })
    if (authError) {
      setError(authError.message ?? 'Could not sign in. Check your details and try again.')
      return
    }
    window.location.assign(callbackURL)
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        title="Login to your account"
        description="Enter your email below to login to your account"
      />
      <AuthError error={error} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    disabled={isBusy}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href={AUTH_ROUTES.forgotPassword}
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    disabled={isBusy}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <AuthSubmit label="Login" isSubmitting={isSubmitting} isBusy={isBusy} />
          <GoogleButton
            label="Login with Google"
            onClick={() => google.run(callbackURL, setError)}
            isPending={google.isPending}
            isBusy={isBusy}
          />
        </form>
      </Form>
      <AuthFooter
        prompt="Don't have an account?"
        ctaLabel="Sign up"
        ctaHref={AUTH_ROUTES.signUp}
      />
    </div>
  )
}

/* ---------- Sign-up ---------- */

function SignUpForm({ callbackURL }: { callbackURL: string }) {
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null)
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onTouched',
  })
  const { error, setError, google } = useAuthEffects()
  const notifyDevEmail = useDevEmailToast()
  const router = useRouter()
  const isSubmitting = form.formState.isSubmitting
  const isBusy = isSubmitting || google.isPending

  async function onSubmit(values: SignUpValues) {
    setError(null)
    const { data, error: authError } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    })
    if (authError) {
      setError(authError.message ?? 'Could not create your account. Try again.')
      return
    }

    /* Dev-only: if Resend isn't configured, surface the verification link in a
     * toast (no-op otherwise). Awaited so the toast is mounted before we
     * navigate — a client-side push preserves it, a full reload would not. */
    await notifyDevEmail(values.email)

    /* A non-null token means Better Auth signed the user straight in, i.e.
     * requireEmailVerification is off (the dev email fallback). Go to the app
     * instead of dead-ending on a screen waiting for mail that can't arrive.
     * With verification enforced the token is null → check-your-email screen. */
    if (data?.token) {
      router.push(callbackURL)
      router.refresh()
      return
    }
    setSubmittedEmail(values.email)
  }

  if (submittedEmail) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <MailCheckIcon className="size-8 text-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-balance text-sm text-muted-foreground">
            We sent a verification link to{' '}
            <span className="font-medium text-foreground">{submittedEmail}</span>. Click it to
            finish creating your account.
          </p>
        </div>
        <Link href={AUTH_ROUTES.signIn} className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        title="Create an account"
        description="Enter your details below to create your account"
      />
      <AuthError error={error} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input type="text" autoComplete="name" placeholder="John Doe" disabled={isBusy} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    disabled={isBusy}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" disabled={isBusy} {...field} />
                </FormControl>
                <FormDescription>At least 8 characters.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <AuthSubmit label="Sign up" isSubmitting={isSubmitting} isBusy={isBusy} />
          <GoogleButton
            label="Sign up with Google"
            onClick={() => google.run(callbackURL, setError)}
            isPending={google.isPending}
            isBusy={isBusy}
          />
        </form>
      </Form>
      <AuthFooter
        prompt="Already have an account?"
        ctaLabel="Sign in"
        ctaHref={AUTH_ROUTES.signIn}
      />
    </div>
  )
}

/* ---------- Shared bits ---------- */

function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-balance text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function AuthError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {error}
    </div>
  )
}

function AuthSubmit({
  label,
  isSubmitting,
  isBusy,
}: {
  label: string
  isSubmitting: boolean
  isBusy: boolean
}) {
  return (
    <Button type="submit" className="w-full" disabled={isBusy}>
      {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {label}
    </Button>
  )
}

function GoogleButton({
  label,
  onClick,
  isPending,
  isBusy,
}: {
  label: string
  onClick: () => void
  isPending: boolean
  isBusy: boolean
}) {
  if (!GOOGLE_OAUTH_ENABLED) return null
  return (
    <>
      <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
        <span className="relative z-10 bg-background px-2 text-muted-foreground">Or continue with</span>
      </div>
      <Button variant="outline" type="button" className="w-full" onClick={onClick} disabled={isBusy}>
        {isPending ? <Loader2Icon className="size-4 animate-spin" /> : <GoogleGlyph />}
        {label}
      </Button>
    </>
  )
}

function AuthFooter({
  prompt,
  ctaLabel,
  ctaHref,
}: {
  prompt: string
  ctaLabel: string
  ctaHref: string
}) {
  return (
    <div className="text-center text-sm">
      {prompt}{' '}
      <Link href={ctaHref} className="underline underline-offset-4">
        {ctaLabel}
      </Link>
    </div>
  )
}

/* Shared error state + Google handler. */
function useAuthEffects() {
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  async function run(callbackURL: string, setErr: (v: string | null) => void) {
    if (isPending) return
    setErr(null)
    setIsPending(true)
    try {
      const { error: authError } = await authClient.signIn.social({ provider: 'google', callbackURL })
      if (authError) setErr(authError.message ?? 'Google sign-in failed. Try again.')
    } finally {
      setIsPending(false)
    }
  }

  return { error, setError, google: { isPending, run } }
}

/* Inline Google "G" mark. */
function GoogleGlyph() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
        fill="currentColor"
      />
    </svg>
  )
}
