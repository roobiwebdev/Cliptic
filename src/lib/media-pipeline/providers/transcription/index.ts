/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getTranscriber, Transcriber
 *
 * WHAT:  Transcriber factory — the ONE place config → concrete provider, so
 *        swapping transcription backends is a single env-var change.
 * WHERE: stages/transcribe.ts.
 */
import { mediaConfig } from '../../config'
import type { Transcriber } from './types'
import { OpenAITranscriber } from './openai'
import { WhisperCppTranscriber } from './whisper-cpp'

export function getTranscriber(): Transcriber {
  switch (mediaConfig.transcriber) {
    case 'openai':
      return new OpenAITranscriber()
    case 'whisper-cpp':
      return new WhisperCppTranscriber()
  }
}

export type { Transcriber }
