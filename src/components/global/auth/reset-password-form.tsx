/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ResetPasswordForm
 *
 * WHAT:  Sets a new password using the token from the reset-link email. Reads
 *        the token from the URL (Better Auth appends ?token=...). Handles the
 *        missing-token case with an "invalid link" screen and confirms success.
 * WHY:   Calls Better Auth resetPassword with the token; the shared
 *        resetPasswordSchema enforces the length + confirm-match rule.
 * WHERE: Rendered by src/app/(auth)/reset-password/page.tsx (inside Suspense,
 *        since it reads searchParams) within AuthShell.
 */

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, CheckCircle2Icon } from 'lucide-react'

import { authClient } from '@/lib/better-auth/auth-client'
import { AUTH_ROUTES } from '@/lib/config'
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/types'
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

export function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onTouched',
  })

  async function onSubmit(values: ResetPasswordValues) {
    if (!token) return
    setError(null)
    const { error: authError } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    })
    if (authError) {
      setError(authError.message ?? 'Could not reset your password. The link may have expired.')
      return
    }
    setDone(true)
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-bold">Invalid reset link</h1>
        <p className="text-balance text-sm text-muted-foreground">
          This password reset link is invalid or has expired. Request a new one.
        </p>
        <Link href={AUTH_ROUTES.forgotPassword} className="text-sm underline underline-offset-4">
          Request a new link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2Icon className="size-8 text-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Password reset</h1>
          <p className="text-balance text-sm text-muted-foreground">
            Your password has been updated. Sign in with your new password.
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
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter a new password for your account.
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Enter your new password"
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
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm your new password"
                    disabled={isBusy}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isBusy}>
            {isBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Reset password
          </Button>
        </form>
      </Form>
      <div className="text-center text-sm">
        <Link href={AUTH_ROUTES.signIn} className="underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
