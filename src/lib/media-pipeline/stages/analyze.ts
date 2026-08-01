/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: analyze, buildPrompt, normalizeClip
 *
 * WHAT:  STAGE 3 — transcript → ClipRange[] (each with start/end/reason). The
 *        LLM never sees the video; it reasons over the timestamped transcript.
 * WHY:   This stage owns the whole domain contract — prompt, JSON validation,
 *        and constraint enforcement (count, hard/target length, non-overlap).
 *        Providers stay dumb; all clip logic lives here (single source of truth).
 *        This is the clean seam future captions/editor features build on.
 * WHERE: Called by the clip worker processor.
 */
import { z } from 'zod'
import { mediaConfig } from '../config'
import { createLogger } from '../lib/log'
import { extractJson } from '../lib/json'
import { getLLMProvider } from '../providers/llm'
import type { Transcript, ClipRange, TranscriptSegment } from '../types'

const log = createLogger('analyze')

const llmClipSchema = z.object({
  start: z.number(),
  end: z.number(),
  reason: z.string(),
  title: z.string().optional(),
  score: z.number().optional(),
})
const llmResponseSchema = z.object({ clips: z.array(llmClipSchema) })

/** Compact, timestamped transcript lines for the prompt (one per segment). */
function renderTranscript(transcript: Transcript): string {
  const segments: TranscriptSegment[] =
    transcript.segments && transcript.segments.length > 0
      ? transcript.segments
      : [{ start: 0, end: transcript.duration, text: transcript.text }]
  return segments.map((s) => `[${s.start.toFixed(1)}] ${s.text.trim()}`).join('\n')
}

function buildPrompt(transcript: Transcript): { system: string; user: string } {
  const { count, targetMin, targetMax, hardMin, hardMax } = mediaConfig.clips
  const system =
    'You are an expert short-form video editor who finds the most viral, ' +
    'high-retention moments in long podcasts and interviews. You never see the ' +
    'video — you work only from the timestamped transcript.'

  const user = [
    `From the transcript below, select the ${count} best standalone clips for short-form (TikTok/Reels/Shorts).`,
    ``,
    `What makes a great clip:`,
    `- A strong hook in the first seconds, then a payoff.`,
    `- A complete thought — it must make sense on its own, not start or end mid-sentence.`,
    `- Emotional spikes, surprising claims, strong opinions, stories, or actionable insight.`,
    ``,
    `Hard rules:`,
    `- Prefer clips ${targetMin}-${targetMax} seconds long. Never shorter than ${hardMin}s or longer than ${hardMax}s.`,
    `- start and end are timestamps in SECONDS (decimals allowed) taken from the transcript.`,
    `- Clips must not overlap. Order them best-first.`,
    ``,
    `Return ONLY JSON in exactly this shape (no markdown, no prose):`,
    `{"clips":[{"start":number,"end":number,"title":"short catchy title","reason":"why this clip works","score":0-100}]}`,
    ``,
    `Transcript ([seconds] text):`,
    renderTranscript(transcript),
  ].join('\n')

  return { system, user }
}

/** Clamp/validate a raw LLM clip into an acceptable ClipRange, or null to drop it. */
function normalizeClip(raw: z.infer<typeof llmClipSchema>, duration: number): ClipRange | null {
  const { hardMin, hardMax, targetMax } = mediaConfig.clips

  const start = Math.max(0, Math.min(raw.start, duration))
  let end = Math.max(0, Math.min(raw.end, duration))
  if (end <= start) return null

  let length = end - start
  if (length < hardMin) return null
  if (length > hardMax) {
    end = Math.min(duration, start + targetMax)
    length = end - start
    if (length < hardMin) return null
  }

  const clip: ClipRange = { start, end, reason: raw.reason }
  if (raw.title !== undefined) clip.title = raw.title
  if (raw.score !== undefined) clip.score = raw.score
  return clip
}

export async function analyze(transcript: Transcript): Promise<ClipRange[]> {
  const provider = getLLMProvider()
  log(`selecting clips with "${provider.name}" (${mediaConfig.clips.count} target)`)
  const { system, user } = buildPrompt(transcript)
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

  // Normalize + rank, then greedily keep the best non-overlapping clips.
  const ranked = parsed.clips
    .map((c) => normalizeClip(c, transcript.duration))
    .filter((c): c is ClipRange => c !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  const clips: ClipRange[] = []
  for (const candidate of ranked) {
    if (clips.length >= mediaConfig.clips.count) break
    const overlaps = clips.some((k) => candidate.start < k.end && k.start < candidate.end)
    if (!overlaps) clips.push(candidate)
  }

  if (clips.length === 0) {
    throw new Error('No usable clips were selected from the transcript.')
  }

  log(`selected ${clips.length} clip ranges`)
  return clips
}
