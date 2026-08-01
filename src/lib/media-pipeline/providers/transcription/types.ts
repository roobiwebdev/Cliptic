/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: Transcriber
 *
 * WHAT:  The transcription provider interface. A Transcriber takes a 16 kHz mono
 *        WAV and returns a Transcript with word-level timestamps; how it does
 *        that (single-shot, chunked, local) is its own concern.
 */
import type { Transcript } from '../../types'

export interface Transcriber {
  readonly name: string
  transcribe(audioPath: string): Promise<Transcript>
}
