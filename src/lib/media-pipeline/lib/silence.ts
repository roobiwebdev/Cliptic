/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: detectSilences, Silence
 *
 * WHAT:  Silence detection via ffmpeg's `silencedetect` filter — clean split
 *        points when chunking long audio for transcription.
 * WHY:   The cut stage snaps to word gaps from the transcript (richer timing);
 *        this coarser pass is only for keeping transcription chunks under the
 *        upload cap without cutting a word in half.
 * WHERE: providers/transcription/openai.ts.
 */

import { captureAll } from './exec'

export interface Silence {
  start: number
  end: number
}

/**
 * Return the silent intervals in an audio file.
 * @param noiseDb        threshold below which audio counts as silence (dBFS)
 * @param minDurationSec minimum silence length to report
 */
export async function detectSilences(
  audioPath: string,
  noiseDb = -30,
  minDurationSec = 0.4
): Promise<Silence[]> {
  const { stderr } = await captureAll('ffmpeg', [
    '-i',
    audioPath,
    '-af',
    `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
    '-f',
    'null',
    '-',
  ])

  const silences: Silence[] = []
  let pendingStart: number | null = null
  for (const line of stderr.split('\n')) {
    const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
    if (startMatch?.[1] !== undefined) {
      pendingStart = Number(startMatch[1])
      continue
    }
    const endMatch = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
    if (endMatch?.[1] !== undefined && pendingStart !== null) {
      silences.push({ start: pendingStart, end: Number(endMatch[1]) })
      pendingStart = null
    }
  }
  return silences
}
