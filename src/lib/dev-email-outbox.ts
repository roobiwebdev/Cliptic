/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: recordDevEmail, takePendingDevEmail, DevEmailEntry
 *
 * WHAT:  A tiny in-memory outbox of "emails" that COULD NOT be sent because
 *        RESEND_API_KEY isn't configured. Stores the action link (verification /
 *        reset / invitation) so the dev UI can surface it in a toast instead of
 *        the link being lost.
 * WHY:   In local dev without an email provider, verification/reset links would
 *        otherwise only hit the server console. Recording them here lets a
 *        dev-only tRPC query hand the link back to the client. In-memory + best
 *        effort by design — this is a local-dev convenience, never a delivery
 *        mechanism (the endpoint that reads it is gated to development).
 * WHERE: Written by src/services/email.service.ts when a send is skipped; read
 *        (and cleared) by src/trpc/routers/dev.ts (getPendingEmail).
 */

export interface DevEmailEntry {
  to: string
  subject: string
  link: string
  createdAt: number
}

/* Small ring buffer so a long-running dev server can't leak memory. */
const MAX_ENTRIES = 50
const outbox: DevEmailEntry[] = []

/**
 * SOURCE OF TRUTH KEYWORDS: recordDevEmail
 *
 * WHAT:  Appends a would-be email (with its action link) to the outbox.
 * WHERE: Called by the email service when a send is skipped (no API key).
 */
export function recordDevEmail(entry: { to: string; subject: string; link: string }): void {
  outbox.push({ ...entry, createdAt: Date.now() })
  if (outbox.length > MAX_ENTRIES) outbox.splice(0, outbox.length - MAX_ENTRIES)
}

/**
 * SOURCE OF TRUTH KEYWORDS: takePendingDevEmail
 *
 * WHAT:  Returns and REMOVES the most recent pending entry for an email
 *        address (case-insensitive), or null.
 * WHY:   Consuming (removing) on read keeps the toast one-shot and avoids
 *        re-surfacing stale links.
 * WHERE: Called by the dev-only getPendingEmail query.
 */
export function takePendingDevEmail(to: string): DevEmailEntry | null {
  const target = to.toLowerCase().trim()
  for (let i = outbox.length - 1; i >= 0; i--) {
    if (outbox[i]?.to.toLowerCase().trim() === target) {
      const [entry] = outbox.splice(i, 1)
      return entry ?? null
    }
  }
  return null
}
