/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: QUEUE_NAMES, QueueName, getQueue, enqueue,
 *   registerProcessor, getRegisteredProcessors, JobProcessor, Job Engine
 *
 * WHAT:  The generic Job Engine surface — queue names, a memoised producer
 *        `getQueue`, `enqueue`, and a processor registry the worker consumes.
 * WHY:   ONE reusable queueing seam. Clip processing is the first job type; new
 *        long-running jobs (exports, re-transcode, monthly resets) register a
 *        processor and enqueue without touching this file. Kept generic on
 *        purpose (root-cause placement, not bolted onto clips).
 * WHERE: enqueue → clips router; registerProcessor → worker processors;
 *        getRegisteredProcessors → src/worker/index.ts.
 */

import { Queue, type JobsOptions, type Job } from 'bullmq'
import { getProducerConnection, isQueueConfigured } from './connection'

/**
 * SOURCE OF TRUTH KEYWORDS: QUEUE_NAMES, QueueName
 *
 * WHAT:  Canonical queue names. Add a job type by adding a name here.
 */
export const QUEUE_NAMES = {
  clipProcessing: 'clip-processing',
  /* Editor exports — apply a ClipEdit's spec to a clip mp4 via ffmpeg. Its own
   * queue keeps render jobs isolated from the clip pipeline (own payload/status). */
  clipRender: 'clip-render',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

const queues = new Map<string, Queue>()

/**
 * SOURCE OF TRUTH KEYWORDS: getQueue
 *
 * WHAT:  Memoised BullMQ Queue for a name, or null when Redis isn't configured.
 * WHERE: enqueue below; can also read queue metrics.
 */
export function getQueue(name: QueueName): Queue | null {
  const connection = getProducerConnection()
  if (!connection) return null
  const existing = queues.get(name)
  if (existing) return existing
  const queue = new Queue(name, { connection })
  queues.set(name, queue)
  return queue
}

/**
 * SOURCE OF TRUTH KEYWORDS: enqueue
 *
 * WHAT:  Adds a job to a queue. `jobId` deduplicates (safe re-enqueue).
 * WHY:   Throws a clear error when Redis is unconfigured so a missing REDIS_URL
 *        surfaces immediately instead of silently dropping work.
 * WHERE: clips.create (jobId = ClipJob.id for idempotency).
 */
export async function enqueue<TData extends object>(
  name: QueueName,
  jobName: string,
  data: TData,
  opts?: JobsOptions
): Promise<void> {
  if (!isQueueConfigured()) {
    throw new Error(
      'Job queue (Redis) is not configured. Set REDIS_URL to a TCP Redis connection string.'
    )
  }
  const queue = getQueue(name)
  if (!queue) {
    throw new Error('Failed to obtain queue connection.')
  }
  await queue.add(jobName, data, {
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 7 * 24 * 3600 },
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    ...opts,
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: JobProcessor
 *
 * WHAT:  A worker handler for one queue name.
 */
export type JobProcessor = (job: Job) => Promise<void>

const processors = new Map<QueueName, JobProcessor>()

/**
 * SOURCE OF TRUTH KEYWORDS: registerProcessor
 *
 * WHAT:  Registers the handler for a queue name (called at module import).
 * WHERE: src/worker/processors/*.ts.
 */
export function registerProcessor(name: QueueName, processor: JobProcessor): void {
  processors.set(name, processor)
}

/**
 * SOURCE OF TRUTH KEYWORDS: getRegisteredProcessors
 *
 * WHAT:  All registered (name → handler) pairs for the worker to spin up.
 * WHERE: src/worker/index.ts.
 */
export function getRegisteredProcessors(): ReadonlyMap<QueueName, JobProcessor> {
  return processors
}

export { isQueueConfigured, createBullConnection } from './connection'
