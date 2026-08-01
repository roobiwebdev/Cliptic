/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: createBullConnection, getProducerConnection,
 *   isQueueConfigured, Job Engine, BullMQ, ioredis, REDIS_URL
 *
 * WHAT:  ioredis connections for BullMQ — a memoised one for the web producer
 *        and a factory for the worker (which wants its own connection).
 * WHY:   BullMQ needs a REAL TCP Redis (not the Upstash REST client used for
 *        rate limiting), and requires `maxRetriesPerRequest: null` on blocking
 *        connections. Fail-soft: when REDIS_URL is unset the connection is null
 *        and enqueue throws a clear error instead of hanging.
 * WHERE: getProducerConnection → src/lib/queue/index.ts (enqueue);
 *        createBullConnection → src/worker/index.ts (Worker instances).
 */

import IORedis, { type Redis } from 'ioredis'

/* BullMQ blocking commands require these exact options. */
const BULL_REDIS_OPTIONS = { maxRetriesPerRequest: null, enableReadyCheck: false } as const

const GLOBAL_PRODUCER_KEY = Symbol.for('app.bull.producer')

type GlobalWithProducer = typeof globalThis & {
  [GLOBAL_PRODUCER_KEY]?: Redis | null
}

/**
 * SOURCE OF TRUTH KEYWORDS: isQueueConfigured
 *
 * WHAT:  True when REDIS_URL is set (BullMQ can run).
 * WHERE: Setup checklist / enqueue guard.
 */
export function isQueueConfigured(): boolean {
  const url = process.env['REDIS_URL']
  return typeof url === 'string' && url.trim().length > 0
}

/**
 * SOURCE OF TRUTH KEYWORDS: createBullConnection
 *
 * WHAT:  A fresh ioredis connection configured for BullMQ, or null if unset.
 * WHY:   Workers should own their connection rather than share the producer's.
 * WHERE: src/worker/index.ts.
 */
export function createBullConnection(): Redis | null {
  const url = process.env['REDIS_URL']
  if (!url || url.trim().length === 0) return null
  return new IORedis(url.trim(), BULL_REDIS_OPTIONS)
}

/**
 * SOURCE OF TRUTH KEYWORDS: getProducerConnection
 *
 * WHAT:  Memoised ioredis connection for enqueuing from the web app.
 * WHY:   One shared producer connection avoids exhausting Redis under HMR / many
 *        requests, mirroring the prisma/redis singleton pattern.
 * WHERE: src/lib/queue/index.ts.
 */
export function getProducerConnection(): Redis | null {
  const globalWithProducer = globalThis as GlobalWithProducer
  if (GLOBAL_PRODUCER_KEY in globalWithProducer) {
    return globalWithProducer[GLOBAL_PRODUCER_KEY] ?? null
  }
  const connection = createBullConnection()
  globalWithProducer[GLOBAL_PRODUCER_KEY] = connection
  return connection
}
