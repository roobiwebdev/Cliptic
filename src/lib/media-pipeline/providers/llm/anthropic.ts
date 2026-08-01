/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: AnthropicProvider
 *
 * WHAT:  Anthropic Messages API LLM provider (default claude-opus-4-8).
 * WHY:   Opus 4.x rejects temperature/top_p/top_k and assistant prefill, so none
 *        are sent; JSON is requested via the prompt and extracted downstream.
 * WHERE: Selected by the LLM factory when LLM_PROVIDER=anthropic.
 */
import Anthropic from '@anthropic-ai/sdk'
import { mediaConfig, requireAnthropicKey } from '../../config'
import type { LLMProvider, LLMCompleteOptions } from './types'

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const client = new Anthropic({
      apiKey: requireAnthropicKey(),
      maxRetries: 4,
      timeout: 120_000,
    })

    const res = await client.messages.create({
      model: mediaConfig.anthropic.model,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: opts.user }],
    })

    return res.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
  }
}
