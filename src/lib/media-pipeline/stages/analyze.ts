/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: analyze, buildPrompt, sentence-anchored selection,
 *   hookQuote, quality floor, virality rulebook, fitSpanToLength, providerOverrideFor
 *
 * WHAT:  STAGE 3 — transcript → ClipRange[] (each with start/end/reason). The
 *        LLM never sees the video; it reasons over SENTENCE-anchored transcript
 *        lines and returns sentence indices (never raw seconds), which we map
 *        back to precise word timestamps.
 * WHY:   This stage owns the whole domain contract — prompt (virality rulebook +
 *        knowledge packs), JSON validation, and constraint enforcement (count,
 *        hard/target length, non-overlap, quality floor). Sentence anchoring
 *        makes mid-thought cuts impossible by construction and is language-
 *        agnostic (Amharic and any script work like English). Providers stay
 *        dumb; all clip logic lives here (single source of truth).
 * WHERE: Called by the clip worker processor.
 */
import { z } from 'zod'
import { mediaConfig, type LlmProviderName } from '../config'
import { createLogger } from '../lib/log'
import { extractJson } from '../lib/json'
import { assembleSentences, renderSentences } from '../lib/sentences'
import { getAnalysisKnowledge } from '../knowledge'
import { getLLMProvider } from '../providers/llm'
import type { Transcript, ClipRange, Sentence, Word } from '../types'

const log = createLogger('analyze')

/** Breathing room added around the anchored sentences (bounded by neighbors). */
const PRE_ROLL_SEC = 0.2
const POST_ROLL_SEC = 0.35
/** Clips scoring below this are filler — dropped rather than shipped. */
const MIN_CLIP_SCORE = 55
/** Ask for ~1 clip per this many seconds of source (capped by CLIP_COUNT). */
const ASK_SEC_PER_CLIP = 240

const llmClipSchema = z.object({
  startSentence: z.number().int().min(0),
  endSentence: z.number().int().min(0),
  hookQuote: z.string().catch(''),
  payoff: z.string().catch(''),
  title: z.string().catch(''),
  reason: z.string().catch(''),
  score: z.number().catch(0),
  format: z.string().nullable().catch(null),
})
/* One malformed clip must not kill the batch — bad items parse to null and are dropped. */
const lenientClipSchema = llmClipSchema.nullable().catch(null)
const llmResponseSchema = z.object({ clips: z.array(lenientClipSchema) })
type LlmClip = z.infer<typeof llmClipSchema>

/** True when the transcript language is missing/English — no provider override. */
function isEnglish(language: string | undefined): boolean {
  const lang = language?.trim() ?? ''
  return lang === '' || /^(en|eng|english)$/i.test(lang)
}

/**
 * SOURCE OF TRUTH KEYWORDS: providerOverrideFor, non-English provider
 *
 * WHAT:  The provider override for a transcript language — LLM_PROVIDER_NON_ENGLISH
 *        when the content is not English, else undefined (default provider).
 * WHY:   Non-English (e.g. Amharic) selection quality can be routed to the
 *        strongest configured model with one env var, without forking any logic.
 */
function providerOverrideFor(language: string | undefined): LlmProviderName | undefined {
  return isEnglish(language) ? undefined : mediaConfig.llmProviderNonEnglish
}

function buildPrompt(
  sentences: Sentence[],
  askCount: number
): { system: string; user: string } {
  const { targetMin, targetMax, hardMin, hardMax } = mediaConfig.clips

  const system = [
    `You are "The Clipper" — a senior short-form editor and virality strategist who has cut clips earning hundreds of millions of views on TikTok, Reels, and Shorts, across every niche and MANY LANGUAGES. You work only from a timestamped transcript; you never see the video. Two things are non-negotiable:`,
    `1. You pick moments that stop a stranger's scroll — not moments merely interesting in context.`,
    `2. Your cuts feel human: a clip starts EXACTLY on a hook sentence and ends EXACTLY where that thought resolves. You return fewer clips rather than one broken one.`,
    `First understand the idea a passage expresses, THEN decide where it truly begins and ends. The clip must make full sense to someone with zero context who gives you 2 seconds.`,
    ``,
    `## VIRALITY RULEBOOK`,
    `### The first 2 seconds are 80% of the outcome`,
    `The clip's FIRST sentence must work with zero context. Strong hook types: bold/contrarian claim; specific outcome + path ("how I went from X to Y"); curiosity gap; stakes/warning; in-media-res story; numbers/lists; direct call-out; raw emotional peak. These patterns exist in every language — judge them in the transcript's own language.`,
    `NEVER start on: filler ("yeah, so…"), a continuation ("and another thing…"), a pronoun with no antecedent, the tail of a previous idea, or a rambling multi-part question.`,
    `### Retention: keep the hook's promise`,
    `The hook opens a loop; every following sentence must move toward closing it — no greetings, throat-clearing, tangents, or inside references. END on the sentence that closes the loop: a punchline, a landed lesson, a completed story beat, a mic-drop line. Ending one sentence too late (into the next idea's setup) kills the clip.`,
    `### Standalone test`,
    `A stranger must be able to answer: who cares? what's the point? If the clip depends on anything outside its boundaries, widen it to include the missing setup ONLY if the hook survives; otherwise kill it.`,
    `### Niche adaptation`,
    `Business/finance: specificity wins (real numbers, named mistakes, frameworks). Motivation: end on the crescendo line, never after it. Comedy/banter: the setup+punchline unit is sacred. Interviews: start on the answer's hook line; include the question only if it is short and itself a hook. Education/how-to: complete, actionable value.`,
    ``,
    getAnalysisKnowledge(),
    ``,
    `## SCORING (be harsh — most of any video is filler)`,
    `score = hook (0-30) + retention/payoff (0-25) + emotion (0-15) + shareability (0-15) + standalone clarity (0-15).`,
    `85+ exceptional (a few per hour of good content), 70-84 strong, 55-69 usable, below 55 DO NOT return it. Fewer, better clips is correct — padding to a quota is failure.`,
  ].join('\n')

  const user = [
    `The transcript below is split into numbered sentences:`,
    `  s<index> [<start seconds>] <text>`,
    `⏸ marks a long spoken pause — a natural cut point.`,
    ``,
    `Select up to ${askCount} non-overlapping clips. Target ${targetMin}-${targetMax} seconds; never under ${hardMin}s or over ${hardMax}s (estimate length from sentence start times). If a great moment runs long, end at an earlier sentence that still resolves the thought — never just stop at the limit.`,
    ``,
    `Boundary laws (non-negotiable):`,
    `- startSentence MUST be the hook — the strongest standalone opening line of the moment.`,
    `- endSentence MUST complete the thought. Check the sentence after your chosen end: if it still resolves THIS idea, include it; if it starts a new idea, stop.`,
    `- Reject any clip you cannot make clean. Quality over quota.`,
    ``,
    `Write hookQuote, payoff, title, and reason in the SAME LANGUAGE as the transcript (e.g. Amharic transcript → Amharic outputs).`,
    ``,
    `Return ONLY JSON in exactly this shape (no markdown, no prose):`,
    `{"clips":[{"startSentence":int,"endSentence":int,"hookQuote":"verbatim first sentence of the clip","payoff":"what the viewer has gained by the end","title":"hook-style title, max 8 words","reason":"why a stranger stops scrolling AND why the ending lands","score":0-100,"format":"story format name or null"}]}`,
    ``,
    `Transcript:`,
    renderSentences(sentences),
  ].join('\n')

  return { system, user }
}

/** Case/punctuation/whitespace-insensitive key for hook matching (any script). */
function matchKey(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * SOURCE OF TRUTH KEYWORDS: realignToHookQuote, hook-first enforcement
 *
 * WHAT:  Verifies the clip's first sentence IS the quoted hook; if the model
 *        buried the hook deeper in its span, moves startSentence to it.
 * WHY:   hookQuote is the enforcement contract for hook-first selection — the
 *        model cannot claim a hook it did not start on.
 */
function realignToHookQuote(clip: LlmClip, sentences: Sentence[]): number {
  const hook = matchKey(clip.hookQuote).slice(0, 24)
  if (hook.length < 4) return clip.startSentence
  for (let i = clip.startSentence; i <= clip.endSentence; i++) {
    const sentence = sentences[i]
    if (sentence && matchKey(sentence.text).startsWith(hook)) {
      if (i !== clip.startSentence) {
        log(`hook realigned: s${clip.startSentence} → s${i} ("${clip.hookQuote.slice(0, 40)}…")`)
      }
      return i
    }
  }
  return clip.startSentence // hook not found verbatim — trust the sentence anchor
}

/** Map a sentence span to precise seconds: word timing + breathing room, bounded by neighbors. */
function boundsForSpan(
  sentences: Sentence[],
  startIdx: number,
  endIdx: number,
  duration: number
): { start: number; end: number } | null {
  const first = sentences[startIdx]
  const last = sentences[endIdx]
  if (!first || !last) return null

  const prev = sentences[startIdx - 1]
  let start = first.start - PRE_ROLL_SEC
  if (prev) start = Math.max(start, prev.end + 0.05)
  start = Math.min(Math.max(0, start), first.start)

  const next = sentences[endIdx + 1]
  let end = last.end + POST_ROLL_SEC
  if (next) end = Math.min(end, next.start - 0.05)
  end = Math.min(Math.max(end, last.end), duration)

  return end > start ? { start, end } : null
}

/**
 * SOURCE OF TRUTH KEYWORDS: fitSpanToLength, sentence-aware truncation
 *
 * WHAT:  Length limits enforced on SENTENCE boundaries: an over-long span is
 *        walked back to the longest earlier sentence end that fits targetMax —
 *        never chopped mid-thought at an arbitrary second.
 */
function fitSpanToLength(
  sentences: Sentence[],
  startIdx: number,
  endIdx: number,
  duration: number
): { start: number; end: number } | null {
  const { hardMin, hardMax, targetMax } = mediaConfig.clips
  let bounds = boundsForSpan(sentences, startIdx, endIdx, duration)
  if (!bounds) return null

  if (bounds.end - bounds.start > hardMax) {
    for (let e = endIdx - 1; e > startIdx; e--) {
      const candidate = boundsForSpan(sentences, startIdx, e, duration)
      if (candidate && candidate.end - candidate.start <= targetMax) {
        bounds = candidate
        break
      }
    }
    if (bounds.end - bounds.start > hardMax) return null
  }

  return bounds.end - bounds.start < hardMin ? null : bounds
}

/** Clamp/verify one raw LLM clip into an acceptable ClipRange, or null to drop it. */
function toClipRange(raw: LlmClip, sentences: Sentence[], duration: number): ClipRange | null {
  const maxIdx = sentences.length - 1
  if (raw.startSentence > maxIdx || raw.endSentence > maxIdx) return null
  if (raw.endSentence < raw.startSentence) return null

  const startIdx = realignToHookQuote(raw, sentences)
  const bounds = fitSpanToLength(sentences, startIdx, raw.endSentence, duration)
  if (!bounds) return null

  const reason = raw.payoff ? `${raw.reason} Payoff: ${raw.payoff}` : raw.reason
  const clip: ClipRange = { start: bounds.start, end: bounds.end, reason }
  if (raw.title) clip.title = raw.title
  clip.score = Math.max(0, Math.min(100, raw.score))
  return clip
}

/**
 * SOURCE OF TRUTH KEYWORDS: sliceTranscriptWindow, transcript window, window text
 *
 * WHAT:  The words spoken within [startSec, endSec], joined into text.
 * WHY:   Feeds a focused title for a USER-picked manual clip window — reuse the
 *        already-transcribed words instead of re-processing.
 * WHERE: generateTitleForRange; the manual-clip worker path + clips.suggestManualTitle.
 */
export function sliceTranscriptWindow(transcript: Transcript, startSec: number, endSec: number): string {
  return transcript.words
    .filter((w) => w.start < endSec && w.end > startSec)
    .map((w) => w.text)
    .join(' ')
    .trim()
}

/**
 * SOURCE OF TRUTH KEYWORDS: sliceTranscriptWords, clip-relative words, caption words
 *
 * WHAT:  The words spoken within [startSec, endSec], shifted to CLIP-relative
 *        seconds (0 = the clip's start). Drops words fully outside the window.
 * WHY:   Captions burn against a clip whose timeline starts at 0; the render
 *        worker AND the editor's caption seed reuse this ONE window-slicer so the
 *        editable lines match exactly what gets rendered.
 * WHERE: clip-render processor (caption words) + clips.getEditorCaptions.
 */
export function sliceTranscriptWords(transcript: Transcript, startSec: number, endSec: number): Word[] {
  return transcript.words
    .filter((w) => w.start < endSec && w.end > startSec)
    .map((w) => ({
      text: w.text,
      start: Math.max(0, w.start - startSec),
      end: Math.max(0, w.end - startSec),
    }))
    .filter((w) => w.end > w.start)
}

/**
 * SOURCE OF TRUTH KEYWORDS: generateTitleForRange, manual clip title, catchy title
 *
 * WHAT:  A short, catchy title for a clip from its transcript text (one cheap LLM
 *        call), in the transcript's OWN language.
 * WHY:   Manual clips (and future renames) need an AI title WITHOUT the full analyze
 *        pass; extracted here so the worker and the API share one implementation and
 *        honor the same swappable LLM provider (incl. the non-English override).
 *        Empty text ⇒ empty title (caller falls back to a timestamp default).
 * WHERE: Manual-clip worker path; clips.suggestManualTitle.
 */
export async function generateTitleForRange(windowText: string, language?: string): Promise<string> {
  const text = windowText.trim()
  if (!text) return ''
  const provider = getLLMProvider(providerOverrideFor(language))
  const system = 'You write short, punchy titles for short-form video clips in any language.'
  const user = [
    'Write ONE short, catchy title (max ~8 words) for a short-form clip whose transcript is below.',
    'Write the title in the SAME language as the transcript.',
    'No quotes, no emojis, no hashtags. Return ONLY the title text.',
    '',
    'Transcript:',
    text.slice(0, 4000),
  ].join('\n')
  const raw = await provider.complete({ system, user, json: false, maxTokens: 40 })
  return raw.trim().replace(/^["']+|["']+$/g, '').slice(0, 120)
}

export async function analyze(transcript: Transcript): Promise<ClipRange[]> {
  const sentences = assembleSentences(transcript.words)
  if (sentences.length === 0) {
    throw new Error('Transcript has no words to build sentences from — cannot select clips.')
  }

  /* Ask proportionally to source length (a 10-min video does not hold 8 great
   * clips); the quality floor below can still return fewer. */
  const askCount = Math.min(
    mediaConfig.clips.count,
    Math.max(2, Math.round(transcript.duration / ASK_SEC_PER_CLIP))
  )

  const provider = getLLMProvider(providerOverrideFor(transcript.language))
  log(
    `selecting clips with "${provider.name}" (${askCount} asked, ${sentences.length} sentences, lang=${transcript.language ?? 'unknown'})`
  )
  const { system, user } = buildPrompt(sentences, askCount)
  const rawText = await provider.complete({ system, user, json: true, maxTokens: 4096 })

  let parsed: z.infer<typeof llmResponseSchema>
  try {
    parsed = llmResponseSchema.parse(JSON.parse(extractJson(rawText)))
  } catch (err) {
    throw new Error(
      `LLM did not return valid clip JSON: ${err instanceof Error ? err.message : String(err)}\n` +
        `Raw response:\n${rawText.slice(0, 500)}`
    )
  }

  const candidates = parsed.clips
    .filter((c): c is LlmClip => c !== null)
    .map((c) => toClipRange(c, sentences, transcript.duration))
    .filter((c): c is ClipRange => c !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  /* Quality floor: filler is dropped — but if the floor empties a non-empty
   * batch, keep the single best so the job still delivers something. */
  let ranked = candidates.filter((c) => (c.score ?? 0) >= MIN_CLIP_SCORE)
  if (ranked.length === 0 && candidates.length > 0) {
    ranked = candidates.slice(0, 1)
    log(`all clips under quality floor ${MIN_CLIP_SCORE} — keeping the single best`)
  }

  // Greedily keep the best non-overlapping clips.
  const clips: ClipRange[] = []
  for (const candidate of ranked) {
    if (clips.length >= askCount) break
    const overlaps = clips.some((k) => candidate.start < k.end && k.start < candidate.end)
    if (!overlaps) clips.push(candidate)
  }

  if (clips.length === 0) {
    throw new Error('No usable clips were selected from the transcript.')
  }

  log(`selected ${clips.length} clip ranges (${candidates.length} candidates)`)
  return clips
}
