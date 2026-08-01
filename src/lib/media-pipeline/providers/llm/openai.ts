/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: OpenAIProvider
 *
 * WHAT:  OpenAI chat-completions LLM provider with JSON mode.
 * WHERE: Selected by the LLM factory when LLM_PROVIDER=openai.
 */
import OpenAI from 'openai'
import { mediaConfig, requireOpenAIKey } from '../../config'
import type { LLMProvider, LLMCompleteOptions } from './types'

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const client = new OpenAI({
      apiKey: requireOpenAIKey(),
      baseURL: mediaConfig.openai.baseURL,
      maxRetries: 4,
      timeout: 120_000,
    })

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: opts.user })

    const res = await client.chat.completions.create({
      model: mediaConfig.openai.chatModel,
      messages,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    })

    return res.choices[0]?.message?.content ?? ''
  }
}
