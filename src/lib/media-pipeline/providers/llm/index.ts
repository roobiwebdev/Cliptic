/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getLLMProvider, LLMProvider, LLMCompleteOptions
 *
 * WHAT:  LLM provider factory — the ONE place config → concrete provider, so
 *        swapping the AI backend is a single env-var change.
 * WHERE: stages/analyze.ts.
 */
import { mediaConfig } from '../../config'
import type { LLMProvider } from './types'
import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'
import { OllamaProvider } from './ollama'

export function getLLMProvider(): LLMProvider {
  switch (mediaConfig.llmProvider) {
    case 'openai':
      return new OpenAIProvider()
    case 'anthropic':
      return new AnthropicProvider()
    case 'ollama':
      return new OllamaProvider()
  }
}

export type { LLMProvider, LLMCompleteOptions } from './types'
