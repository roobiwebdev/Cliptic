/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: Source, Word, TranscriptSegment, Transcript,
 *   ClipRange, ClipResult, MediaSourceType, Media Pipeline
 *
 * WHAT:  The typed "pipe" every media-pipeline stage communicates through —
 *        ported from the Clipper CLI. This module is the single source of truth
 *        for the pipeline's DOMAIN types (kept co-located, deliberately, so the
 *        pipeline stays a self-contained, portable engine).
 * WHY:   Stages depend on these shapes, never on each other's internals, so a
 *        provider/stage can be swapped without ripple.
 * WHERE: Consumed across src/lib/media-pipeline/*; app-layer contracts (job
 *        payload, input schemas) instead live in src/lib/types/clips.ts.
 */

export type MediaSourceType = 'youtube' | 'upload'

/** Resolved input: hides YouTube-vs-upload behind one shape. */
export interface Source {
  /** Stable id (yt-dlp video id, or a content hash for uploads). */
  videoId: string
  sourceType: MediaSourceType
  /** true ⇒ cut from a local file (uploads); false ⇒ section-download (YouTube). */
  isLocal: boolean
  /** What the cut stage cuts from: a URL (section-download) or a local file path. */
  videoSource: string
  /** 16 kHz mono WAV extracted for transcription (local scratch path). */
  audioPath: string
  /** Per-job scratch directory the worker owns and cleans up. */
  scratchDir: string
}

/** A single word with its timestamps — backbone of silence-snapping and captions. */
export interface Word {
  text: string
  start: number // seconds
  end: number // seconds
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface Transcript {
  text: string
  words: Word[]
  segments?: TranscriptSegment[]
  duration: number // seconds
  language?: string
}

/** A clip the LLM chose, in source-time seconds, with its rationale. */
export interface ClipRange {
  start: number
  end: number
  reason: string
  title?: string
  score?: number // 0-100 virality guess, optional
}

/** A rendered clip on local scratch disk, before upload to R2. */
export interface ClipResult {
  index: number
  path: string
  thumbnailPath?: string
  sizeBytes?: number
  range: ClipRange
}
