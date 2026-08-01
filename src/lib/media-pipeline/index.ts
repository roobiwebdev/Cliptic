/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: Media Pipeline, resolveSource, transcribe, analyze,
 *   cut, mediaConfig
 *
 * WHAT:  Public surface of the media pipeline — the four stage functions plus
 *        config and domain types. The worker orchestrates the stages (updating
 *        job progress between them); there is no single run-all so each stage
 *        can be checkpointed.
 * WHERE: Imported by src/worker/processors/clip.processor.ts.
 */

export { resolveSource } from './stages/source'
export type { ResolveSourceParams } from './stages/source'
export { transcribe } from './stages/transcribe'
export { analyze } from './stages/analyze'
export { cut } from './stages/cut'
export { mediaConfig } from './config'
export type {
  Source,
  Word,
  TranscriptSegment,
  Transcript,
  ClipRange,
  ClipResult,
  MediaSourceType,
} from './types'
