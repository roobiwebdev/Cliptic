/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: userSafeError, worker error, safe failure message
 *
 * WHAT:  Collapse any thrown value into a short, user-safe message stored on a
 *        job/edit row and shown in the dashboard.
 * WHY:   Never leak raw internals (stack traces, provider errors) to tenants,
 *        and cap the length so one bad error can't bloat the row. Shared by every
 *        worker processor (clip pipeline + editor render) so they truncate alike.
 * WHERE: src/worker/processors/*.ts.
 */
export function userSafeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.length > 300 ? `${msg.slice(0, 297)}…` : msg
}
