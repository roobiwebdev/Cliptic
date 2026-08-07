/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: analyze, buildPrompt, sentence-anchored selection,
 *   hookQuote, quality floor, virality rulebook, fitSpanToLength, providerOverrideFor,
 *   judge pass, judgeCandidates, CandidateSpan, two-pass selection
 *
 * WHAT:  STAGE 3 — transcript → ClipRange[] (each with start/end/reason). The
 *        LLM never sees the video; it reasons over SENTENCE-anchored transcript
 *        lines and returns sentence indices (never raw seconds), which we map
 *        back to precise word timestamps. TWO-PASS: pass 1 shortlists candidates
 *        from the whole transcript (recall), pass 2 — ONE judge call — re-reads
 *        each candidate's full text, kills the weak, and finalizes boundaries
 *        (precision). CLIP_JUDGE_PASS=off restores single-call selection.
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
import { getLLMProvider, type LLMProvider } from '../providers/llm'
import type { Transcript, ClipRange, Sentence, Word } from '../types'

const log = createLogger('analyze')

/** Breathing room added around the anchored sentences (bounded by neighbors). */
const PRE_ROLL_SEC = 0.2
const POST_ROLL_SEC = 0.35
/** Clips scoring below this are filler — dropped rather than shipped. */
const MIN_CLIP_SCORE = 55
/** Ask for ~1 clip per this many seconds of source (capped by CLIP_COUNT). */
const ASK_SEC_PER_CLIP = 240
/** Judge pass tuning: pass 1 keeps recall high (low floor, 2x ask, capped),
 *  the judge restores precision and may move boundaries ±context sentences. */
const JUDGE_CANDIDATE_FLOOR = 40
const JUDGE_MAX_CANDIDATES = 14
const JUDGE_CONTEXT_SENTENCES = 2

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

const judgeVerdictSchema = z.object({
  id: z.number().int().min(0),
  keep: z.boolean().catch(false),
  startSentence: z.number().int().min(0),
  endSentence: z.number().int().min(0),
  score: z.number().catch(0),
  reason: z.string().catch(''),
})
const lenientVerdictSchema = judgeVerdictSchema.nullable().catch(null)
const judgeResponseSchema = z.object({ verdicts: z.array(lenientVerdictSchema) })

/**
 * SOURCE OF TRUTH KEYWORDS: CandidateSpan, candidate clip
 *
 * WHAT:  A pass-1 candidate still in SENTENCE space (indices, not seconds) so
 *        the judge can move its boundaries before anything becomes a timestamp.
 */
interface CandidateSpan {
  startIdx: number
  endIdx: number
  title: string
  reason: string
  payoff: string
  hookQuote: string
  score: number
}

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
 *        model cannot claim a hook it did not start on. Exported for unit tests.
 */
export function realignToHookQuote(
  clip: Pick<LlmClip, 'hookQuote' | 'startSentence' | 'endSentence'>,
  sentences: Sentence[]
): number {
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
 *        never chopped mid-thought at an arbitrary second. Returns the fitted
 *        end index alongside the seconds. Exported for unit tests.
 */
export function fitSpanToLength(
  sentences: Sentence[],
  startIdx: number,
  endIdx: number,
  duration: number
): { endIdx: number; start: number; end: number } | null {
  const { hardMin, hardMax, targetMax } = mediaConfig.clips
  let fittedEnd = endIdx
  let bounds = boundsForSpan(sentences, startIdx, endIdx, duration)
  if (!bounds) return null

  if (bounds.end - bounds.start > hardMax) {
    for (let e = endIdx - 1; e > startIdx; e--) {
      const candidate = boundsForSpan(sentences, startIdx, e, duration)
      if (candidate && candidate.end - candidate.start <= targetMax) {
        bounds = candidate
        fittedEnd = e
        break
      }
    }
    if (bounds.end - bounds.start > hardMax) return null
  }

  if (bounds.end - bounds.start < hardMin) return null
  return { endIdx: fittedEnd, start: bounds.start, end: bounds.end }
}

/** Validate one raw pass-1 clip into a sentence-space candidate, or null to drop it. */
function candidateFromLlm(raw: LlmClip, sentences: Sentence[]): CandidateSpan | null {
  const maxIdx = sentences.length - 1
  if (raw.startSentence > maxIdx || raw.endSentence > maxIdx) return null
  if (raw.endSentence < raw.startSentence) return null
  return {
    startIdx: realignToHookQuote(raw, sentences),
    endIdx: raw.endSentence,
    title: raw.title,
    reason: raw.reason,
    payoff: raw.payoff,
    hookQuote: raw.hookQuote,
    score: Math.max(0, Math.min(100, raw.score)),
  }
}

/** Candidate (sentence space) → final ClipRange (seconds), or null if it can't fit. */
function rangeFromCandidate(c: CandidateSpan, sentences: Sentence[], duration: number): ClipRange | null {
  const fitted = fitSpanToLength(sentences, c.startIdx, c.endIdx, duration)
  if (!fitted) return null
  const reason = c.payoff ? `${c.reason} Payoff: ${c.payoff}` : c.reason
  const clip: ClipRange = { start: fitted.start, end: fitted.end, reason }
  if (c.title) clip.title = c.title
  clip.score = c.score
  return clip
}

function buildJudgePrompt(candidates: CandidateSpan[], sentences: Sentence[]): { system: string; user: string } {
  const system = [
    `You are a ruthless senior short-form editor doing the FINAL review of candidate clips another editor shortlisted from a long video. You see each candidate's full transcript text — judge what is actually THERE, in the transcript's own language. A weak published clip costs more than a missing one.`,
    `For each candidate:`,
    `1. HOOK: the clip's FIRST sentence must stop a stranger's scroll with zero context. If a stronger opening sentence exists inside the candidate, move startSentence to it.`,
    `2. RESOLUTION: the LAST sentence must complete the thought — punchline landed, lesson stated, story beat closed. Move endSentence to the sentence that truly resolves; never end on the setup of the next idea.`,
    `3. STANDALONE: if the clip depends on anything outside its own text, keep=false.`,
    `4. Re-score strictly: hook 0-30 + retention/payoff 0-25 + emotion 0-15 + shareability 0-15 + standalone clarity 0-15. Below 55 = keep=false. 85+ is rare.`,
    `Boundaries may only move within the lines shown for that candidate (lines starting with ~ are surrounding context you may extend into).`,
  ].join('\n')

  const blocks = candidates.map((c, id) => {
    const from = Math.max(0, c.startIdx - JUDGE_CONTEXT_SENTENCES)
    const to = Math.min(sentences.length - 1, c.endIdx + JUDGE_CONTEXT_SENTENCES)
    const lines: string[] = []
    for (let i = from; i <= to; i++) {
      const s = sentences[i]
      if (!s) continue
      const context = i < c.startIdx || i > c.endIdx ? '~' : ''
      lines.push(`${context}s${s.index} [${s.start.toFixed(1)}] ${s.text}`)
    }
    return [
      `CANDIDATE ${id} (proposed s${c.startIdx}-s${c.endIdx}, pass-1 score ${Math.round(c.score)}): ${c.title || '(untitled)'}`,
      ...lines,
    ].join('\n')
  })

  const user = [
    `Review the ${candidates.length} candidates below. Sentence lines are \`s<index> [<start seconds>] <text>\`; lines starting with ~ are context beyond the proposed span (you may move boundaries into them).`,
    ``,
    blocks.join('\n\n'),
    ``,
    `Return ONLY JSON in exactly this shape (one verdict per candidate, same id order):`,
    `{"verdicts":[{"id":int,"keep":true|false,"startSentence":int,"endSentence":int,"score":0-100,"reason":"one sentence in the transcript's language"}]}`,
  ].join('\n')

  return { system, user }
}

/**
 * SOURCE OF TRUTH KEYWORDS: judgeCandidates, judge pass, two-pass selection
 *
 * WHAT:  Pass 2 — ONE LLM call re-reads every candidate in full (with ±context
 *        sentences), kills the weak, moves boundaries onto the true hook /
 *        resolution, and re-scores. Returns surviving candidates in sentence
 *        space, or null on any failure (callers fall back to pass-1 results —
 *        a judge hiccup must never fail the job).
 * WHY:   Pass 1 reads the WHOLE transcript (attention diluted); the judge sees
 *        only candidate text, so precision costs one focused call (~3-5k tokens)
 *        instead of per-candidate calls.
 */
async function judgeCandidates(
  provider: LLMProvider,
  candidates: CandidateSpan[],
  sentences: Sentence[]
): Promise<CandidateSpan[] | null> {
  const { system, user } = buildJudgePrompt(candidates, sentences)
  try {
    const rawText = await provider.complete({ system, user, json: true, maxTokens: 2048 })
    const parsed = judgeResponseSchema.parse(JSON.parse(extractJson(rawText)))
    const maxIdx = sentences.length - 1

    const survivors: CandidateSpan[] = []
    for (const verdict of parsed.verdicts) {
      if (!verdict || !verdict.keep) continue
      const original = candidates[verdict.id]
      if (!original) continue
      /* The judge may only move boundaries within the context window it saw. */
      const lo = Math.max(0, original.startIdx - JUDGE_CONTEXT_SENTENCES)
      const hi = Math.min(maxIdx, original.endIdx + JUDGE_CONTEXT_SENTENCES)
      const startIdx = Math.min(Math.max(verdict.startSentence, lo), hi)
      const endIdx = Math.min(Math.max(verdict.endSentence, startIdx), hi)
      survivors.push({
        ...original,
        startIdx,
        endIdx,
        score: Math.max(0, Math.min(100, verdict.score)),
        reason: verdict.reason || original.reason,
      })
    }
    log(`judge: ${survivors.length}/${candidates.length} candidates survived`)
    return survivors
  } catch (err) {
    log(`judge pass failed (falling back to pass-1): ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
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
  /* With the judge on, pass 1 over-generates (recall) and the judge trims back
   * to quality (precision); off = classic single-call selection. */
  const judgeOn = mediaConfig.clipJudgePass
  const passOneAsk = judgeOn ? Math.min(JUDGE_MAX_CANDIDATES, askCount * 2) : askCount

  const provider = getLLMProvider(providerOverrideFor(transcript.language))
  log(
    `selecting clips with "${provider.name}" (${passOneAsk} asked, judge=${judgeOn ? 'on' : 'off'}, ${sentences.length} sentences, lang=${transcript.language ?? 'unknown'})`
  )
  const { system, user } = buildPrompt(sentences, passOneAsk)
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
    .map((c) => candidateFromLlm(c, sentences))
    .filter((c): c is CandidateSpan => c !== null)
    .sort((a, b) => b.score - a.score)

  /* ── Pass 2: the judge (one call) — kill weak candidates, finalize boundaries ── */
  let selected: CandidateSpan[] = candidates
  if (judgeOn && candidates.length > 0) {
    const shortlist = candidates
      .filter((c) => c.score >= JUDGE_CANDIDATE_FLOOR)
      .slice(0, JUDGE_MAX_CANDIDATES)
    if (shortlist.length > 0) {
      selected = (await judgeCandidates(provider, shortlist, sentences)) ?? candidates
    }
  }

  const finals = selected
    .map((c) => rangeFromCandidate(c, sentences, transcript.duration))
    .filter((c): c is ClipRange => c !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  /* Quality floor: filler is dropped — but if the floor (or the judge) empties
   * a non-empty batch, keep the single best pass-1 candidate so the job still
   * delivers something. */
  let ranked = finals.filter((c) => (c.score ?? 0) >= MIN_CLIP_SCORE)
  if (ranked.length === 0 && candidates.length > 0) {
    const fallback = candidates
      .map((c) => rangeFromCandidate(c, sentences, transcript.duration))
      .filter((c): c is ClipRange => c !== null)
    ranked = fallback.slice(0, 1)
    log(`nothing survived the quality floor ${MIN_CLIP_SCORE} — keeping the single best candidate`)
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
