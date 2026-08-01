/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: createLogger
 *
 * WHAT:  Minimal per-stage logger: `[stage] message`, emitted to the worker log.
 * WHERE: media-pipeline stages + providers.
 */
export function createLogger(stage: string) {
  return (message: string): void => console.log(`[${stage}] ${message}`)
}
