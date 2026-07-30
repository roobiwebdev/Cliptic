/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: apiLimiter, authLimiter, getResourceLimiter,
 *   checkRateLimit, buildRateLimitHeaders, getClientIp, RateLimitResult
 *
 * WHAT:  Upstash-backed rate limiter factories, the global limiter checker,
 *        standard `RateLimit-*` header builder, and the trusted-edge client-IP
 *        resolver.
 * WHY:   Redis is OPTIONAL — when unconfigured every limiter is null and
 *        checkRateLimit fails open; rate limiting is a guardrail, not the only
 *        line of defense, and refusing all traffic on a Redis outage is almost
 *        always worse than letting more requests through.
 * WHERE: Consumed by src/proxy.ts (apiLimiter, authLimiter), procedure factory
 *        for per-resource overrides via RESOURCES[x].rateLimit, and
 *        src/lib/request-forensics.ts (getClientIp).
 */

/* Upstash-backed rate limiting. Redis is OPTIONAL — when unconfigured every
 * limiter is null and checkRateLimit fails open. Rate limiting is a guardrail,
 * not the only line of defense; refusing all traffic on a Redis outage is
 * almost always worse than letting more requests through. */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const GLOBAL_REDIS_KEY = Symbol.for('app.upstash.redis')

type GlobalWithRedis = typeof globalThis & {
  [GLOBAL_REDIS_KEY]?: Redis | null
}

function resolveRedisClient(): Redis | null {
  const globalWithRedis = globalThis as GlobalWithRedis
  if (GLOBAL_REDIS_KEY in globalWithRedis) {
    return globalWithRedis[GLOBAL_REDIS_KEY] ?? null
  }
  const url = process.env['UPSTASH_REDIS_REST_URL']
  const token = process.env['UPSTASH_REDIS_REST_TOKEN']
  if (!url || !token) {
    globalWithRedis[GLOBAL_REDIS_KEY] = null
    return null
  }
  globalWithRedis[GLOBAL_REDIS_KEY] = new Redis({ url, token })
  return globalWithRedis[GLOBAL_REDIS_KEY]
}

const redis: Redis | null = resolveRedisClient()

function buildLimiter(
  prefix: string,
  count: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
): Ratelimit | null {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(count, window),
    prefix,
    analytics: false,
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: apiLimiter
 *
 * WHAT:  Global API rate limiter (100 / 10s sliding window).
 * WHY:   Per-IP cap for general API traffic — broad guardrail, not a per-route
 *        check; per-resource overrides live on RESOURCES[x].rateLimit.
 * WHERE: Applied at src/proxy.ts ingress.
 */
export const apiLimiter = buildLimiter('rl:api', 100, '10 s')

/**
 * SOURCE OF TRUTH KEYWORDS: authLimiter
 *
 * WHAT:  Tight IP-keyed rate limiter (10 / 60s) for auth endpoints.
 * WHY:   Brute-force and credential-stuffing protection — far stricter than
 *        the general apiLimiter.
 * WHERE: Applied at src/proxy.ts for /api/auth/* routes.
 */
/* Tight, IP-keyed: brute-force / credential stuffing. */
export const authLimiter = buildLimiter('rl:auth', 10, '60 s')

const resourceLimiters = new Map<string, Ratelimit | null>()

/**
 * SOURCE OF TRUTH KEYWORDS: getResourceLimiter
 *
 * WHAT:  Lazily builds and memoises a per-resource/action sliding-window limiter.
 * WHY:   Allows RESOURCES[x].rateLimit overrides to materialise into distinct
 *        Upstash keys without eager construction at module load.
 * WHERE: Called by protectedProcedure when a RESOURCES rateLimit override matches.
 */
export function getResourceLimiter(
  resource: string,
  action: string,
  count: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
): Ratelimit | null {
  const key = `${resource}.${action}`
  if (resourceLimiters.has(key)) {
    return resourceLimiters.get(key) ?? null
  }
  const limiter = buildLimiter(`rl:res:${key}`, count, window)
  resourceLimiters.set(key, limiter)
  return limiter
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

/**
 * SOURCE OF TRUTH KEYWORDS: checkRateLimit, RateLimitResult
 *
 * WHAT:  Runs a limiter against an identifier, returning a structured result.
 * WHY:   Fails open on null limiter or Redis exception — rate limiting is a
 *        guardrail, not authentication; refusing traffic on Redis outage is
 *        almost always worse than letting it through.
 * WHERE: Used by src/proxy.ts and the per-procedure rate-limit path.
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) {
    return { allowed: true, limit: 0, remaining: 0, resetAt: 0 }
  }
  try {
    const result = await limiter.limit(identifier)
    return {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.reset,
    }
  } catch (error) {
    console.error('[rate-limit] Redis check failed, failing open:', error)
    return { allowed: true, limit: 0, remaining: 0, resetAt: 0 }
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildRateLimitHeaders
 *
 * WHAT:  Builds the IETF-draft `RateLimit-*` headers (plus `Retry-After` when
 *        the request was blocked).
 * WHY:   Centralises header naming so every gate (proxy, tRPC) emits the same
 *        wire format clients can rely on.
 * WHERE: Used by src/proxy.ts and the tRPC error path.
 */
export function buildRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : {
          'Retry-After': String(
            Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
          ),
        }),
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: getClientIp
 *
 * WHAT:  Resolves the best-available client IP from request headers.
 * WHY:   Platform headers (x-vercel-forwarded-for, cf-connecting-ip, x-real-ip)
 *        are trustworthy because the edge rewrites them on ingress; the XFF
 *        "last entry" fallback is only safe when the edge strips inbound
 *        client-supplied XFF — treat as a hint, never for auth decisions.
 * WHERE: Used by rate-limit identifiers and src/lib/request-forensics.ts.
 */
/* Client IP precedence: platform headers (Vercel, Cloudflare) are trustworthy
 * because the edge rewrites them on ingress. XFF "last entry" is only safe
 * when the edge strips inbound client-supplied XFF — treat as a hint, never
 * for auth decisions. */
export function getClientIp(headers: Headers): string | null {
  const vercel = headers.get('x-vercel-forwarded-for')
  if (vercel) {
    const ip = vercel.split(',')[0]?.trim()
    if (ip) return ip
  }

  const cloudflare = headers.get('cf-connecting-ip')
  if (cloudflare) {
    const ip = cloudflare.trim()
    if (ip) return ip
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) {
    const ip = realIp.trim()
    if (ip) return ip
  }

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded.split(',')
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i]?.trim()
      if (candidate) return candidate
    }
  }

  return null
}
