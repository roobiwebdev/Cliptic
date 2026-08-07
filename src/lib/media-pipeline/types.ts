/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: Source, Word, TranscriptSegment, Transcript,
 *   ClipRange, ClipResult, MediaSourceType, Sentence, AnalysisKnowledgeBlock,
 *   Media Pipeline
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

/**
 * SOURCE OF TRUTH KEYWORDS: Sentence, sentence anchor, sentence boundary
 *
 * WHAT:  One spoken sentence rebuilt from word timestamps — the unit the clip
 *        AI anchors to (it returns sentence indices, never raw seconds).
 * WHY:   Cutting on sentence boundaries makes mid-thought cuts impossible by
 *        construction, and word-gap timing is language-agnostic (works for
 *        Amharic and any script, not just punctuated English).
 * WHERE: lib/sentences.ts builds these; stages/analyze.ts renders + maps them.
 */
export interface Sentence {
  /** 0-based index — the id the LLM references (s0, s1, …). */
  index: number
  /** Start of the sentence's first word (seconds). */
  start: number
  /** End of the sentence's last word (seconds). */
  end: number
  text: string
}

/**
 * SOURCE OF TRUTH KEYWORDS: AnalysisKnowledgeBlock, knowledge pack, virality knowledge
 *
 * WHAT:  One reusable block of expert knowledge injected into the clip-selection
 *        system prompt (id + title + distilled prompt text).
 * WHY:   Knowledge (story formats, future niche/platform rulebooks) plugs into
 *        the analyze prompt as data, not hardcoded prose — add a block, nothing
 *        else changes. Distilled at build time to keep per-job token cost low.
 * WHERE: knowledge/* defines blocks; stages/analyze.ts injects them.
 */
export interface AnalysisKnowledgeBlock {
  id: string
  title: string
  promptText: string
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
