/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: mapWithConcurrency
 *
 * WHAT:  Runs an async mapper over items with a bounded number of workers,
 *        preserving input order in the returned array.
 * WHY:   Lets long-audio transcription fan out chunk requests concurrently
 *        (bounded to respect provider rate limits) without an external dep.
 * WHERE: providers/transcription/openai.ts.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      const item = items[i]
      if (item === undefined) continue
      results[i] = await fn(item, i)
    }
  }

  const workers = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
