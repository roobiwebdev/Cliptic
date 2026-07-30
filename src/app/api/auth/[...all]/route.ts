/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: GET, POST
 *
 * WHAT:  Better Auth's catch-all Next.js route handler with an IP-keyed
 *        rate-limit wrapper on POST.
 * WHY:   POSTs cover every credential-bearing flow — wrapping with authLimiter
 *        blocks brute-force/stuffing before the handler runs; GET stays raw.
 * WHERE: Mounts Better Auth from src/lib/better-auth/auth; rate limiter and
 *        helpers come from src/lib/rate-limit.
 */

import { auth } from '@/lib/better-auth/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import {
  authLimiter,
  buildRateLimitHeaders,
  checkRateLimit,
  getClientIp,
} from '@/lib/rate-limit'

const handlers = toNextJsHandler(auth)

export const GET = handlers.GET

// POSTs cover every credential-bearing flow (sign-in, sign-up, password reset,
// 2FA, OAuth start) — IP-keyed limit blocks brute-force and stuffing.
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request.headers)
  const identifier = ip ?? 'auth:anonymous'

  const result = await checkRateLimit(authLimiter, identifier)
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many authentication attempts. Please try again shortly.',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...buildRateLimitHeaders(result),
        },
      }
    )
  }

  return handlers.POST(request)
}
