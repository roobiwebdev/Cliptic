/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: transcribe
 *
 * WHAT:  STAGE 2 — audio.wav → Transcript (word-level timestamps) via the
 *        configured transcription provider.
 * WHY:   Pure orchestration: delegate to the provider, fail loudly on empty
 *        output. Caching/checkpointing is the worker's job (it persists the
 *        transcript to R2 and skips this stage on retry).
 * WHERE: Called by the clip worker processor.
 */
import { createLogger } from '../lib/log'
import { getTranscriber } from '../providers/transcription'
import type { Source, Transcript } from '../types'

const log = createLogger('transcribe')

export async function transcribe(source: Source): Promise<Transcript> {
  const transcriber = getTranscriber()
  log(`transcribing with "${transcriber.name}"`)
  const transcript = await transcriber.transcribe(source.audioPath)

  if (!transcript.words.length) {
    throw new Error('Transcription returned no words — cannot select clips from an empty transcript.')
  }

  log(`done: ${transcript.words.length} words, ${Math.round(transcript.duration)}s`)
  return transcript
}
