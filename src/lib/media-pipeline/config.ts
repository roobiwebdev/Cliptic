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

import os from 'node:os'
import { z } from 'zod'

const env = process.env

export type LlmProviderName = 'openai' | 'anthropic' | 'ollama'
export type TranscriberName = 'openai' | 'whisper-cpp'

/* Normalize a raw env value: trim, then strip ONE pair of matching surrounding
 * quotes. Hosting UIs (Vercel/Railway) keep the quotes when you paste
 * `KEY="value"`, so `process.env.KEY` becomes the literal `"value"` (or `""`).
 * Cleaning here makes every parser treat those as the plain value / unset. */
function cleanEnv(value: string | undefined): string {
  if (value === undefined) return ''
  const v = value.trim()
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1).trim()
  }
  return v
}

function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  varName: string
): T {
  const v = cleanEnv(value)
  if (v === '') return fallback
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`Invalid ${varName}="${value}". Allowed: ${allowed.join(', ')}.`)
  }
  return v as T
}

function num(value: string | undefined, fallback: number, varName: string): number {
  const v = cleanEnv(value)
  if (v === '') return fallback
  const n = Number(v)
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
  download: {
    /** yt-dlp binary (point at a fresh build via YTDLP_BIN). */
    ytdlpBin: string
    /** 'auto' uses aria2c when present (bypasses YouTube throttling), else native. */
    downloader: 'auto' | 'aria2c' | 'native'
    /** Optional yt-dlp player_client override (e.g. 'tv,ios') to dodge throttled formats. */
    playerClient: string | undefined
    /** Raw Netscape cookies.txt contents (YTDLP_COOKIES). Written to a temp file
     *  and passed as --cookies. The reliable fix for datacenter-IP bot-blocking
     *  / HTTP 429 (YouTube trusts a signed-in session). Undefined = no cookies. */
    cookies: string | undefined
    /** Optional outbound proxy (YTDLP_PROXY) e.g. a residential proxy URL. The
     *  guaranteed fix when YouTube hard-blocks the host IP. Undefined = direct. */
    proxy: string | undefined
    /** bgutil PO-token provider base URL (BGUTIL_POT_BASE_URL). Set in the worker
     *  image to the in-container provider; unset locally. When set, yt-dlp fetches
     *  PO tokens from it (via the bgutil plugin) to pass YouTube's bot checks. */
    potBaseUrl: string | undefined
    /** Cap source resolution to keep the single download small (720 default). */
    maxHeight: number
  }
  encode: {
    /** libx264 preset for clip encoding (veryfast default; ultrafast = fastest). */
    preset: string
  }
  cut: {
    /** How many clips to encode concurrently (bounded by CPU on small hosts). */
    concurrency: number
  }
  transcribe: {
    /** Concurrent Whisper requests for long (chunked) audio. */
    concurrency: number
  }
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
  download: {
    ytdlpBin: env['YTDLP_BIN'] ?? 'yt-dlp',
    downloader: pickEnum(
      env['YTDLP_DOWNLOADER'],
      ['auto', 'aria2c', 'native'] as const,
      'auto',
      'YTDLP_DOWNLOADER'
    ),
    playerClient:
      env['YTDLP_PLAYER_CLIENT'] && env['YTDLP_PLAYER_CLIENT'].trim() !== ''
        ? env['YTDLP_PLAYER_CLIENT'].trim()
        : undefined,
    cookies: env['YTDLP_COOKIES'] && env['YTDLP_COOKIES'].trim() !== '' ? env['YTDLP_COOKIES'] : undefined,
    proxy: env['YTDLP_PROXY'] && env['YTDLP_PROXY'].trim() !== '' ? env['YTDLP_PROXY'].trim() : undefined,
    potBaseUrl:
      env['BGUTIL_POT_BASE_URL'] && env['BGUTIL_POT_BASE_URL'].trim() !== ''
        ? env['BGUTIL_POT_BASE_URL'].trim()
        : undefined,
    maxHeight: num(env['CLIP_SOURCE_MAX_HEIGHT'], 720, 'CLIP_SOURCE_MAX_HEIGHT'),
  },
  encode: {
    preset: env['CLIP_ENCODE_PRESET'] ?? 'veryfast',
  },
  cut: {
    concurrency: num(env['CLIP_CUT_CONCURRENCY'], Math.min(os.cpus().length, 4), 'CLIP_CUT_CONCURRENCY'),
  },
  transcribe: {
    concurrency: num(env['TRANSCRIBE_CONCURRENCY'], 4, 'TRANSCRIBE_CONCURRENCY'),
  },
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
