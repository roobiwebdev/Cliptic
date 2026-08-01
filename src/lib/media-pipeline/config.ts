/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: mediaConfig, MediaConfig, LlmProviderName,
 *   TranscriberName, requireOpenAIKey, requireAnthropicKey, clip tuning
 *
 * WHAT:  Typed, validated configuration for the media pipeline (provider
 *        selection, provider secrets/models, clip-length tuning), read from the
 *        worker's environment.
 * WHY:   Provider SELECTION + clip numerics are validated eagerly (a typo in
 *        LLM_PROVIDER fails loudly at worker startup); provider SECRETS are
 *        validated lazily by requireOpenAIKey/requireAnthropicKey so a run that
 *        doesn't touch a provider needs no key for it. Env only — no secrets in
 *        code. Co-located with the pipeline (this engine owns its own config).
 * WHERE: Read by providers + stages under src/lib/media-pipeline/*. The worker
 *        entry (src/worker/index.ts) loads .env before this module is imported.
 */

import { z } from 'zod'

const env = process.env

export type LlmProviderName = 'openai' | 'anthropic' | 'ollama'
export type TranscriberName = 'openai' | 'whisper-cpp'

function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  varName: string
): T {
  if (value === undefined || value.trim() === '') return fallback
  const v = value.trim()
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`Invalid ${varName}="${value}". Allowed: ${allowed.join(', ')}.`)
  }
  return v as T
}

function num(value: string | undefined, fallback: number, varName: string): number {
  if (value === undefined || value.trim() === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`${varName} must be a number, got "${value}".`)
  return n
}

const clipsSchema = z
  .object({
    count: z.number().int().positive(),
    targetMin: z.number().positive(),
    targetMax: z.number().positive(),
    hardMin: z.number().positive(),
    hardMax: z.number().positive(),
  })
  .refine((c) => c.hardMin <= c.targetMin, {
    message: 'CLIP_HARD_MIN_SEC must be <= CLIP_TARGET_MIN_SEC',
  })
  .refine((c) => c.targetMin <= c.targetMax, {
    message: 'CLIP_TARGET_MIN_SEC must be <= CLIP_TARGET_MAX_SEC',
  })
  .refine((c) => c.targetMax <= c.hardMax, {
    message: 'CLIP_TARGET_MAX_SEC must be <= CLIP_HARD_MAX_SEC',
  })

const clips = clipsSchema.parse({
  count: num(env['CLIP_COUNT'], 8, 'CLIP_COUNT'),
  targetMin: num(env['CLIP_TARGET_MIN_SEC'], 20, 'CLIP_TARGET_MIN_SEC'),
  targetMax: num(env['CLIP_TARGET_MAX_SEC'], 60, 'CLIP_TARGET_MAX_SEC'),
  hardMin: num(env['CLIP_HARD_MIN_SEC'], 15, 'CLIP_HARD_MIN_SEC'),
  hardMax: num(env['CLIP_HARD_MAX_SEC'], 90, 'CLIP_HARD_MAX_SEC'),
})

export interface MediaConfig {
  llmProvider: LlmProviderName
  transcriber: TranscriberName
  openai: {
    apiKey: string
    chatModel: string
    transcribeModel: string
    baseURL: string | undefined
    transcribeMaxUploadMb: number
  }
  anthropic: { apiKey: string; model: string }
  ollama: { host: string; model: string }
  whisperCpp: { binPath: string; modelPath: string }
  clips: z.infer<typeof clipsSchema>
  sectionPaddingSec: number
}

export const mediaConfig: MediaConfig = {
  llmProvider: pickEnum(env['LLM_PROVIDER'], ['openai', 'anthropic', 'ollama'] as const, 'openai', 'LLM_PROVIDER'),
  transcriber: pickEnum(env['TRANSCRIBER'], ['openai', 'whisper-cpp'] as const, 'openai', 'TRANSCRIBER'),
  openai: {
    apiKey: env['OPENAI_API_KEY'] ?? '',
    chatModel: env['OPENAI_CHAT_MODEL'] ?? 'gpt-4o',
    transcribeModel: env['OPENAI_TRANSCRIBE_MODEL'] ?? 'whisper-1',
    baseURL: env['OPENAI_BASE_URL'] && env['OPENAI_BASE_URL'].trim() !== '' ? env['OPENAI_BASE_URL'] : undefined,
    transcribeMaxUploadMb: num(env['OPENAI_TRANSCRIBE_MAX_UPLOAD_MB'], 24, 'OPENAI_TRANSCRIBE_MAX_UPLOAD_MB'),
  },
  anthropic: {
    apiKey: env['ANTHROPIC_API_KEY'] ?? '',
    model: env['ANTHROPIC_MODEL'] ?? 'claude-opus-4-8',
  },
  ollama: {
    host: env['OLLAMA_HOST'] ?? 'http://localhost:11434',
    model: env['OLLAMA_MODEL'] ?? 'llama3.1:8b',
  },
  whisperCpp: {
    binPath: env['WHISPER_CPP_BIN'] ?? 'whisper-cli',
    modelPath: env['WHISPER_CPP_MODEL'] ?? '',
  },
  clips,
  sectionPaddingSec: num(env['SECTION_PADDING_SEC'], 1.5, 'SECTION_PADDING_SEC'),
}

/** Fail loudly when a stage actually needs the OpenAI key. */
export function requireOpenAIKey(): string {
  if (!mediaConfig.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not set.')
  }
  return mediaConfig.openai.apiKey
}

/** Fail loudly when a stage actually needs the Anthropic key. */
export function requireAnthropicKey(): string {
  if (!mediaConfig.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.')
  }
  return mediaConfig.anthropic.apiKey
}
