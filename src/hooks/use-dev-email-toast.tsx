/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: useDevEmailToast
 *
 * WHAT:  Returns `notify(email)` — after an auth action, it asks the dev-only
 *        `dev.getPendingEmail` query for the link that would have been emailed
 *        (verification / reset) and, if present, shows a Sonner toast with the
 *        clickable link plus a "temporary, add your key for production" warning.
 * WHY:   With no RESEND_API_KEY in local dev, the verification/reset link would
 *        otherwise be lost. This surfaces it so the developer can proceed. The
 *        server query only returns a link in development while Resend is
 *        unconfigured, so nothing is exposed in production.
 * WHERE: Used by the sign-up form and the forgot-password form.
 */

import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'

/* Long enough to read + copy the link; the toast counts down and dismisses. */
const TOAST_DURATION_MS = 60_000

export function useDevEmailToast(): (email: string) => Promise<void> {
  const utils = trpc.useUtils()

  return async (email: string) => {
    try {
      const pending = await utils.dev.getPendingEmail.fetch({ email })
      if (!pending) return

      toast.warning('Email not sent — no provider configured', {
        duration: TOAST_DURATION_MS,
        description: (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-mono">RESEND_API_KEY</span> isn&apos;t set, so nothing was
              actually emailed. Email verification is not enforced while this is the case — here
              is the link the email would have contained:
            </p>
            <a
              href={pending.link}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-mono text-xs underline underline-offset-2"
            >
              {pending.link}
            </a>
            <p className="text-xs text-muted-foreground">
              Temporary for local dev only — add your Resend API key before production. This must
              not work this way in production.
            </p>
          </div>
        ),
        action: {
          label: 'Open',
          onClick: () => window.open(pending.link, '_blank', 'noopener,noreferrer'),
        },
      })
    } catch {
      /* Non-critical dev helper — never let it break the auth flow. */
    }
  }
}
