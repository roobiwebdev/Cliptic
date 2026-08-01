/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LLMProvider, LLMCompleteOptions
 *
 * WHAT:  The LLM provider interface. Deliberately THIN: providers only turn a
 *        prompt into text. All domain logic (clip-selection prompt, JSON parse,
 *        constraint enforcement) lives in stages/analyze.ts — so swapping
 *        OpenAI ↔ Anthropic ↔ Ollama is a one-value config change.
 */
export interface LLMCompleteOptions {
  system?: string
  user: string
  json?: boolean
  maxTokens?: number
}

export interface LLMProvider {
  readonly name: string
  complete(opts: LLMCompleteOptions): Promise<string>
}
