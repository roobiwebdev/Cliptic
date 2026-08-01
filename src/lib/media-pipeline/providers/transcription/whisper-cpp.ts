/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: WhisperCppTranscriber
 *
 * WHAT:  Local transcription via whisper.cpp (free, no API, no upload limit).
 *        DOCUMENTED STUB — not implemented yet. To enable: build whisper.cpp,
 *        set WHISPER_CPP_BIN + WHISPER_CPP_MODEL, then run the binary with full
 *        JSON output and map it into our Transcript shape:
 *          whisper-cli -m $WHISPER_CPP_MODEL -f <audio.wav> -oj -of <out> -l en
 * WHERE: Selected by the transcription factory when TRANSCRIBER=whisper-cpp.
 */
import { mediaConfig } from '../../config'
import type { Transcriber } from './types'
import type { Transcript } from '../../types'

export class WhisperCppTranscriber implements Transcriber {
  readonly name = 'whisper-cpp'

  async transcribe(_audioPath: string): Promise<Transcript> {
    void _audioPath
    throw new Error(
      `whisper-cpp transcriber is not implemented yet. ` +
        `Set TRANSCRIBER=openai, or implement this provider. ` +
        `Configured bin="${mediaConfig.whisperCpp.binPath}", model="${mediaConfig.whisperCpp.modelPath || '(unset)'}".`
    )
  }
}
