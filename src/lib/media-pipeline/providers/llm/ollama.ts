/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: OllamaProvider
 *
 * WHAT:  Ollama LLM provider — local, free inference over the Ollama HTTP API.
 * WHY:   The "run it free locally" path; no SDK, just fetch. Untested until an
 *        Ollama server is running; small models may need transcript chunking.
 * WHERE: Selected by the LLM factory when LLM_PROVIDER=ollama.
 */
import { mediaConfig } from '../../config'
import type { LLMProvider, LLMCompleteOptions } from './types'

interface OllamaChatResponse {
  message?: { content?: string }
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama'

  async complete(opts: LLMCompleteOptions): Promise<string> {
    const messages: Array<{ role: string; content: string }> = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: opts.user })

    const res = await fetch(`${mediaConfig.ollama.host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: mediaConfig.ollama.model,
        messages,
        stream: false,
        ...(opts.json ? { format: 'json' } : {}),
      }),
    })

    if (!res.ok) {
      throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`)
    }

    const data = (await res.json()) as OllamaChatResponse
    return data.message?.content ?? ''
  }
}
