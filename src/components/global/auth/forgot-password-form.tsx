/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ForgotPasswordForm
 *
 * WHAT:  Requests a password-reset email. On success shows a
 *        "check your email" screen (shown regardless of whether the address
 *        exists — prevents email enumeration).
 * WHY:   Better Auth emails the reset link via the sendResetPassword hook in
 *        auth.ts; the link lands on AUTH_ROUTES.resetPassword with a token.
 * WHERE: Rendered by src/app/(auth)/forgot-password/page.tsx inside AuthShell.
 */

import * as React from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, MailCheckIcon } from 'lucide-react'

import { authClient } from '@/lib/better-auth/auth-client'
import { AUTH_ROUTES } from '@/lib/config'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/types'
import { useDevEmailToast } from '@/hooks/use-dev-email-toast'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

export function ForgotPasswordForm() {
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  const notifyDevEmail = useDevEmailToast()
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
    mode: 'onTouched',
  })

  async function onSubmit(values: ForgotPasswordValues) {
    setError(null)
    const { error: authError } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: AUTH_ROUTES.resetPassword,
    })
    if (authError) {
      setError(authError.message ?? 'Something went wrong. Please try again.')
      return
    }
    setSent(true)
    /* Dev-only: surface the reset link in a toast when Resend isn't configured. */
    void notifyDevEmail(values.email)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <MailCheckIcon className="size-8 text-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-balance text-sm text-muted-foreground">
            If an account exists with that email address, we&apos;ve sent a link to reset your
            password. Check your inbox and spam folder.
          </p>
        </div>
        <Link href={AUTH_ROUTES.signIn} className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    )
  }

  const isBusy = form.formState.isSubmitting

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Forgot your password?</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="m@example.com" disabled={isBusy} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isBusy}>
            {isBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
      </Form>
      <div className="text-center text-sm">
        Remember your password?{' '}
        <Link href={AUTH_ROUTES.signIn} className="underline underline-offset-4">
          Sign in
        </Link>
      </div>
    </div>
  )
}
