/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: devRouter, getPendingEmail
 *
 * WHAT:  Local-dev helper — hands the client the action link (verification /
 *        reset) for an email that COULD NOT be sent because RESEND_API_KEY is
 *        unset, so the UI can show it in a toast.
 * WHY:   Without an email provider the verification/reset link would be lost to
 *        the server console. This surfaces it — but ONLY in development AND only
 *        while Resend is unconfigured. In production (or once a key is set) it
 *        returns null, so reset/verification links are never exposed over the
 *        wire. This must never be relied on in production.
 * WHERE: Mounted as `dev` in src/trpc/routers/_app; consumed by
 *        useDevEmailToast (sign-up + forgot-password forms). Reads the outbox
 *        in src/lib/dev-email-outbox.ts.
 */

import { z } from 'zod'

import { createTRPCRouter } from '../init'
import { baseProcedure } from '../procedures'
import { isDevEmailFallbackActive } from '@/lib/config/resend'
import { takePendingDevEmail } from '@/lib/dev-email-outbox'

export const devRouter = createTRPCRouter({
  getPendingEmail: baseProcedure
    .input(z.object({ email: z.string().min(1) }))
    .query(({ input }) => {
      /* The link leaves the server only in this exact state: development with no
       * email provider configured (isDevEmailFallbackActive). Anything else → null. */
      if (!isDevEmailFallbackActive()) return null
      const entry = takePendingDevEmail(input.email)
      return entry ? { subject: entry.subject, link: entry.link } : null
    }),
})
