/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ResendVerification
 *
 * WHAT:  "Didn't get the email?" resend control with a cooldown countdown so a
 *        user who missed the verification mail can request a fresh one without
 *        spamming the endpoint.
 * WHY:   Global (components/global/auth) so any verify-pending surface — the
 *        sign-up check-email screen today, a sign-in prompt tomorrow — reuses
 *        the exact same cooldown + Better Auth call.
 * WHERE: Rendered by the sign-up "check your email" screen (auth-form.tsx).
 */

import * as React from 'react'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { authClient } from '@/lib/better-auth/auth-client'
import { Button } from '@/components/ui/button'

const RESEND_COOLDOWN_SECONDS = 30

export interface ResendVerificationProps {
  email: string
  callbackURL?: string
}

export function ResendVerification({ email, callbackURL = '/' }: ResendVerificationProps) {
  /* Start on cooldown — an email was just sent on sign-up. */
  const [secondsLeft, setSecondsLeft] = React.useState(RESEND_COOLDOWN_SECONDS)
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setTimeout(() => setSecondsLeft((current) => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft])

  async function resend() {
    if (secondsLeft > 0 || sending) return
    setSending(true)
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL })
    setSending(false)
    if (error) {
      toast.error(error.message ?? 'Could not resend the email. Try again shortly.')
      return
    }
    toast.success('Verification email sent — check your inbox (and spam).')
    setSecondsLeft(RESEND_COOLDOWN_SECONDS)
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="text-muted-foreground text-sm">Didn&apos;t get the email?</p>
      <Button variant="outline" size="sm" onClick={resend} disabled={secondsLeft > 0 || sending}>
        {sending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend email'}
      </Button>
    </div>
  )
}
