/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: OpenAITranscriber, hybrid transcription, alignAccurateWords,
 *   isNonLatinDominant, Amharic transcription, gpt-4o-transcribe, timing grid
 *
 * WHAT:  OpenAI transcription with word-level timestamps. Handles the 25 MB
 *        upload cap by splitting audio on SILENCE and stitching per-chunk
 *        timestamps back into absolute time.
 * WHY:   whisper-1 is the ONLY OpenAI model with WORD-level timestamps, but it
 *        CANNOT transcribe some scripts (e.g. Amharic — OpenAI's whisper API
 *        rejects language='am' and auto-detect mislabels it, emitting garbage in
 *        the wrong script). gpt-4o-transcribe transcribes those accurately but
 *        exposes NO timestamps. So per chunk: run whisper (the timing grid); if
 *        its text is non-Latin/unsupported, run gpt-4o-transcribe for the ACCURATE
 *        words and map them onto whisper's real word-timing grid. Latin scripts
 *        (English/European) stay whisper-only — unchanged, precise, no extra cost.
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
      timeout: mediaConfig.transcribe.timeoutMs,
    })
    const duration = await probeDuration(audioPath)
    const { size } = await stat(audioPath)

    const maxBytes = mediaConfig.openai.transcribeMaxUploadMb * 1024 * 1024
    const durationCap = mediaConfig.transcribe.maxChunkSec
    /* Single request ONLY when the audio fits BOTH the upload cap AND the
     * duration cap. A long podcast can be small enough to upload in one piece
     * (low-bitrate audio) yet far too long to transcribe within the request
     * timeout — that combination is exactly what produced "Request timed out".
     * Chunking by DURATION keeps every request fast and parallelizable. */
    if (size <= maxBytes && duration <= durationCap) {
      const chunk = await this.transcribeFile(client, audioPath, 0, duration)
      return this.assemble([chunk], duration)
    }

    /* Bytes-per-second from the ACTUAL file (codec-agnostic) so size-based chunk
     * sizing is correct whether the audio is WAV or compressed mp3. */
    const bytesPerSec = size / Math.max(1, duration)
    const sizeChunkSec = maxBytes / bytesPerSec - SNAP_WINDOW_SEC - 5
    /* Take the SMALLER of the size cap and the duration cap — duration is what
     * bounds request time (and thus timeouts) for long, low-bitrate audio. */
    const targetChunkSec = Math.max(SNAP_WINDOW_SEC * 2, Math.min(sizeChunkSec, durationCap))

    log(
      `audio is ${(size / 1024 / 1024).toFixed(1)} MB / ${Math.round(duration)}s — splitting on silence (~${Math.round(targetChunkSec)}s chunks), ${mediaConfig.transcribe.concurrency} concurrent`
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
          return this.transcribeFile(client, chunkPath, range.start, range.end - range.start)
        }
      )
      return this.assemble(chunks, duration)
    } finally {
      await rm(chunkDir, { recursive: true, force: true })
    }
  }

  /**
   * Transcribe one chunk and shift timestamps by `offset`. HYBRID: whisper gives
   * the word-timing grid; unless whisper is CONFIDENTLY English, fetch the
   * ACCURATE words from gpt-4o-transcribe (which handles Amharic + everything)
   * and map them onto whisper's grid — so no word is dropped, whatever the
   * language. `chunkDurationSec` bounds the fallback timeline when whisper found
   * no words at all (so a rescue still produces timed captions).
   */
  private async transcribeFile(
    client: OpenAI,
    filePath: string,
    offset: number,
    chunkDurationSec: number
  ): Promise<ChunkResult> {
    /* No language param unless forced — auto-detect keeps English on whisper and
     * lets the rescue below handle scripts whisper can't do. */
    const res = await client.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: mediaConfig.openai.transcribeModel,
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      ...(mediaConfig.transcribeLanguage ? { language: mediaConfig.transcribeLanguage } : {}),
    })

    const gridWords = res.words ?? []
    const whisperWords: Word[] = gridWords.map((w) => ({ text: w.word, start: w.start + offset, end: w.end + offset }))
    const whisperSegments: TranscriptSegment[] = (res.segments ?? []).map((s) => ({
      start: s.start + offset,
      end: s.end + offset,
      text: s.text,
    }))
    const whisperResult: ChunkResult = {
      words: whisperWords,
      segments: whisperSegments,
      text: res.text,
      language: res.language ?? '',
    }

    const mode = mediaConfig.transcribe.accurateText
    if (mode === 'off') return whisperResult
    /* DECISION on whisper's DETECTED LANGUAGE (not its text): whisper hallucinates
     * ENGLISH words for Amharic audio (detects "amharic"/"somali" yet emits Latin
     * gibberish), so a text-script check would wrongly skip the rescue. Rescue
     * unless whisper is confidently English. */
    const confidentlyEnglish =
      whisperWords.length > 0 && isEnglishLang(res.language) && !isNonLatinDominant(res.text)
    if (mode === 'auto' && confidentlyEnglish) return whisperResult

    /* Fetch the accurate transcript (Amharic + any interspersed English, nothing
     * dropped) and place it on the real speech timeline. */
    log(
      `rescuing text with ${mediaConfig.openai.transcribeTextModel} (whisper lang="${res.language}", words=${whisperWords.length})`
    )
    let accurate: string
    try {
      const t = await client.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: mediaConfig.openai.transcribeTextModel,
        response_format: 'json',
      })
      accurate = (t.text ?? '').trim()
    } catch (err) {
      log(`accurate-text model failed (${err instanceof Error ? err.message : String(err)}); keeping whisper output`)
      return whisperResult
    }
    if (!accurate) return whisperResult

    /* Map accurate words onto whisper's grid; if whisper found NO words (the
     * "no speech" case), spread them evenly across the chunk window instead. */
    const words =
      gridWords.length > 0
        ? alignAccurateWords(accurate, gridWords, offset)
        : distributeWordsEvenly(accurate, offset, offset + Math.max(0.5, chunkDurationSec))
    if (words.length === 0) return whisperResult
    const first = words[0]
    const last = words[words.length - 1]
    const segments: TranscriptSegment[] =
      first && last ? [{ start: first.start, end: last.end, text: accurate }] : []
    const language = isNonLatinDominant(accurate) ? scriptLanguage(accurate) : res.language || 'english'
    return { words, segments, text: accurate, language }
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

/**
 * SOURCE OF TRUTH KEYWORDS: alignAccurateWords, timing grid, word alignment
 *
 * WHAT:  Map accurate words (from gpt-4o-transcribe, no timing) onto whisper's
 *        word-timing grid proportionally, so the exact text lands at the real
 *        times speech occurs. Timestamps are shifted by `offset` (absolute time).
 * WHY:   whisper's grid reflects actual speech activity even when its TEXT is
 *        wrong for the language — proportional placement follows speech density
 *        (pauses, fast/slow) far better than uniform spreading.
 */
export function alignAccurateWords(
  accurateText: string,
  grid: ReadonlyArray<{ start: number; end: number }>,
  offset: number
): Word[] {
  const tokens = accurateText.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || grid.length === 0) return []
  const G = grid.length
  const A = tokens.length
  const words: Word[] = []
  let prevEnd = -Infinity
  for (let i = 0; i < A; i++) {
    const g = grid[Math.min(G - 1, Math.floor((i * G) / A))]
    if (!g) continue
    let start = g.start + offset
    let end = g.end + offset
    /* Keep times monotonic when several accurate words map to one grid slot. */
    if (start < prevEnd) start = prevEnd
    if (end <= start) end = start + 0.05
    prevEnd = end
    const text = tokens[i]
    if (text) words.push({ text, start, end })
  }
  return words
}

/* Whisper's detected-language label for English (it returns names like "english"). */
export function isEnglishLang(language: string | null | undefined): boolean {
  const l = (language ?? '').trim().toLowerCase()
  return l === '' || l === 'english' || l === 'en' || l === 'eng'
}

/**
 * SOURCE OF TRUTH KEYWORDS: distributeWordsEvenly
 *
 * WHAT:  Spread accurate words evenly (char-length weighted) across [start,end]
 *        when there is NO whisper timing grid (whisper found no words).
 * WHY:   Guarantees a rescued chunk still yields TIMED captions instead of a
 *        "no speech" failure — the exact case that failed for some Amharic clips.
 */
export function distributeWordsEvenly(text: string, start: number, end: number): Word[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const totalChars = tokens.reduce((n, t) => n + t.length, 0) || 1
  const span = Math.max(0.1, end - start)
  const words: Word[] = []
  let cursor = start
  for (const token of tokens) {
    const dur = (token.length / totalChars) * span
    words.push({ text: token, start: cursor, end: cursor + dur })
    cursor += dur
  }
  const last = words[words.length - 1]
  if (last) last.end = end
  return words
}

/* Non-Latin letter ratio: is this text a script whisper likely can't handle? */
export function isNonLatinDominant(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  if (letters === 0) return false
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0
  return latin / letters < 0.5
}

/* Name the dominant non-Latin script's language (drives the analyze non-English
 * provider path + captions). Falls back to a generic non-English marker. */
export function scriptLanguage(text: string): string {
  const count = (re: RegExp): number => text.match(re)?.length ?? 0
  const scripts: Array<[string, number]> = [
    ['amharic', count(/\p{Script=Ethiopic}/gu)],
    ['arabic', count(/\p{Script=Arabic}/gu)],
    ['chinese', count(/\p{Script=Han}/gu)],
    ['korean', count(/\p{Script=Hangul}/gu)],
    ['japanese', count(/\p{Script=Hiragana}/gu) + count(/\p{Script=Katakana}/gu)],
    ['russian', count(/\p{Script=Cyrillic}/gu)],
    ['hindi', count(/\p{Script=Devanagari}/gu)],
    ['thai', count(/\p{Script=Thai}/gu)],
  ]
  let best = ''
  let bestCount = 0
  for (const [lang, n] of scripts) {
    if (n > bestCount) {
      best = lang
      bestCount = n
    }
  }
  return best || 'non-english'
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
