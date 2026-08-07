/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: OpenAITranscriber
 *
 * WHAT:  OpenAI (whisper-1) transcription with word-level timestamps. Handles
 *        the 25 MB upload cap by splitting audio on SILENCE, transcribing each
 *        chunk, and stitching per-chunk timestamps back into absolute time.
 * WHERE: Selected by the transcription factory when TRANSCRIBER=openai.
 */
import OpenAI from 'openai'
import { createReadStream } from 'node:fs'
import { stat, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { mediaConfig, requireOpenAIKey } from '../../config'
import { run } from '../../lib/exec'
import { createLogger } from '../../lib/log'
import { probeDuration } from '../../lib/media'
import { detectSilences, type Silence } from '../../lib/silence'
import { mapWithConcurrency } from '../../lib/concurrency'
import type { Transcriber } from './types'
import type { Transcript, Word, TranscriptSegment } from '../../types'

const log = createLogger('transcribe:openai')

const SNAP_WINDOW_SEC = 30 // search this far around a boundary for silence

interface ChunkResult {
  words: Word[]
  segments: TranscriptSegment[]
  text: string
  /** Whisper's detected (or forced) language for this chunk, e.g. "english", "amharic". */
  language: string
}

export class OpenAITranscriber implements Transcriber {
  readonly name = 'openai'

  async transcribe(audioPath: string): Promise<Transcript> {
    const client = new OpenAI({
      apiKey: requireOpenAIKey(),
      baseURL: mediaConfig.openai.baseURL,
      maxRetries: 4,
      timeout: 180_000,
    })
    const duration = await probeDuration(audioPath)
    const { size } = await stat(audioPath)

    const maxBytes = mediaConfig.openai.transcribeMaxUploadMb * 1024 * 1024
    if (size <= maxBytes) {
      const chunk = await this.transcribeFile(client, audioPath, 0)
      return this.assemble([chunk], duration)
    }

    /* Bytes-per-second from the ACTUAL file (codec-agnostic) so chunk sizing is
     * correct whether the audio is WAV or compressed mp3. */
    const bytesPerSec = size / Math.max(1, duration)
    const maxChunkSec = maxBytes / bytesPerSec
    const targetChunkSec = Math.max(SNAP_WINDOW_SEC * 2, maxChunkSec - SNAP_WINDOW_SEC - 5)

    log(
      `audio is ${(size / 1024 / 1024).toFixed(1)} MB — splitting on silence (~${Math.round(targetChunkSec)}s chunks), ${mediaConfig.transcribe.concurrency} concurrent`
    )
    const ranges = await this.planChunks(audioPath, duration, targetChunkSec)
    const chunkDir = path.join(path.dirname(audioPath), 'chunks')
    await mkdir(chunkDir, { recursive: true })
    /* Chunk container must match the input codec so `-c copy` stays valid. */
    const ext = path.extname(audioPath) || '.mp3'

    try {
      const chunks = await mapWithConcurrency(
        ranges,
        mediaConfig.transcribe.concurrency,
        async (range, i) => {
          const chunkPath = path.join(chunkDir, `chunk-${i}${ext}`)
          await run('ffmpeg', [
            '-y',
            '-i',
            audioPath,
            '-ss',
            String(range.start),
            '-to',
            String(range.end),
            '-c',
            'copy',
            chunkPath,
          ])
          log(`chunk ${i + 1}/${ranges.length} [${range.start.toFixed(1)}–${range.end.toFixed(1)}s]`)
          return this.transcribeFile(client, chunkPath, range.start)
        }
      )
      return this.assemble(chunks, duration)
    } finally {
      await rm(chunkDir, { recursive: true, force: true })
    }
  }

  /** Transcribe one file and shift its timestamps by `offset` seconds. */
  private async transcribeFile(client: OpenAI, filePath: string, offset: number): Promise<ChunkResult> {
    /* No language param unless forced — Whisper AUTO-DETECTS, which is what
     * makes non-English (e.g. Amharic) transcripts come back in their own
     * language instead of being squeezed through English. */
    const res = await client.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: mediaConfig.openai.transcribeModel,
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      ...(mediaConfig.transcribeLanguage ? { language: mediaConfig.transcribeLanguage } : {}),
    })

    const words: Word[] = (res.words ?? []).map((w) => ({
      text: w.word,
      start: w.start + offset,
      end: w.end + offset,
    }))
    const segments: TranscriptSegment[] = (res.segments ?? []).map((s) => ({
      start: s.start + offset,
      end: s.end + offset,
      text: s.text,
    }))
    return { words, segments, text: res.text, language: res.language ?? '' }
  }

  /** Merge chunk results into a single, time-ordered Transcript. */
  private assemble(chunks: ChunkResult[], duration: number): Transcript {
    const words = chunks.flatMap((c) => c.words).sort((a, b) => a.start - b.start)
    const segments = chunks.flatMap((c) => c.segments).sort((a, b) => a.start - b.start)
    const text = chunks
      .map((c) => c.text.trim())
      .filter(Boolean)
      .join(' ')
    const language = majorityLanguage(chunks)
    return { text, words, segments, duration, ...(language ? { language } : {}) }
  }

  /** Split [0, duration] into sub-ranges, snapping boundaries to nearby silence. */
  private async planChunks(
    audioPath: string,
    duration: number,
    targetChunkSec: number
  ): Promise<Array<{ start: number; end: number }>> {
    const silences = await detectSilences(audioPath)
    const cuts: number[] = []
    let last = 0
    let target = targetChunkSec
    while (target < duration - SNAP_WINDOW_SEC) {
      const snapped = nearestSilenceMidpoint(silences, target, SNAP_WINDOW_SEC, last)
      const cut = snapped ?? target
      cuts.push(cut)
      last = cut
      target = cut + targetChunkSec
    }

    const bounds = [0, ...cuts, duration]
    const ranges: Array<{ start: number; end: number }> = []
    for (let i = 0; i < bounds.length - 1; i++) {
      const start = bounds[i]
      const end = bounds[i + 1]
      if (start === undefined || end === undefined) continue
      ranges.push({ start, end })
    }
    return ranges
  }
}

/** Most common detected language across chunks (chunks can disagree on noisy audio). */
function majorityLanguage(chunks: ChunkResult[]): string {
  const counts = new Map<string, number>()
  for (const c of chunks) {
    const lang = c.language.trim().toLowerCase()
    if (!lang) continue
    counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  let best = ''
  let bestCount = 0
  for (const [lang, count] of counts) {
    if (count > bestCount) {
      best = lang
      bestCount = count
    }
  }
  return best
}

/** Midpoint of the silence closest to `target` (within `window`, after `after`), or null. */
function nearestSilenceMidpoint(
  silences: Silence[],
  target: number,
  window: number,
  after: number
): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const s of silences) {
    const mid = (s.start + s.end) / 2
    if (mid <= after) continue
    const dist = Math.abs(mid - target)
    if (dist <= window && dist < bestDist) {
      best = mid
      bestDist = dist
    }
  }
  return best
}
