/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: worker entry, Worker, Job Engine, clip worker
 *
 * WHAT:  The Cliptic background worker process (a separate Railway service).
 *        Boots a BullMQ Worker for every registered processor and processes
 *        long-running clip jobs off Redis.
 * WHY:   Video work (yt-dlp + ffmpeg, minutes, big files) can't run in a
 *        serverless request. This process runs it. Run it with
 *        `--conditions=react-server` so `import 'server-only'` is a no-op here
 *        (see the worker scripts in package.json).
 * WHERE: Started by `pnpm worker` (prod) / `pnpm worker:dev` (local).
 */

import 'dotenv/config'
import { Worker, type Job } from 'bullmq'
import { createBullConnection, getRegisteredProcessors } from '@/lib/queue'

// Registering processors is a side effect of importing them.
import './processors/clip.processor'

function getConcurrency(): number {
  const parsed = Number(process.env['WORKER_CONCURRENCY'] ?? 2)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 2
}

function main(): void {
  const processors = getRegisteredProcessors()
  if (processors.size === 0) {
    console.error('[worker] no processors registered — nothing to do')
    process.exit(1)
  }
  if (!process.env['REDIS_URL']) {
    console.error('[worker] REDIS_URL is not set — cannot connect to the queue')
    process.exit(1)
  }

  const concurrency = getConcurrency()
  const workers: Worker[] = []

  for (const [name, processor] of processors) {
    const connection = createBullConnection()
    if (!connection) {
      console.error('[worker] failed to create Redis connection')
      process.exit(1)
    }
    const worker = new Worker(name, async (job: Job) => processor(job), { connection, concurrency })
    worker.on('completed', (job) => console.log(`[worker] completed ${name} job ${job.id}`))
    worker.on('failed', (job, err) =>
      console.error(`[worker] failed ${name} job ${job?.id}: ${err instanceof Error ? err.message : err}`)
    )
    worker.on('error', (err) => console.error(`[worker] ${name} error:`, err))
    workers.push(worker)
  }

  console.log(`[worker] started ${workers.length} processor(s), concurrency=${concurrency}`)

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received — closing workers`)
    await Promise.all(workers.map((w) => w.close()))
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main()
