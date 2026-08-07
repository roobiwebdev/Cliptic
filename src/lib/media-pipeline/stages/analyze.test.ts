/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: analyze test, fitSpanToLength test, realignToHookQuote test
 *
 * WHAT:  Unit tests for the pure sentence-space boundary math behind AI clip
 *        selection — hook realignment (Latin + Ethiopic) and sentence-aware
 *        length fitting. No LLM calls.
 * WHY:   These two functions decide every AI cut point; locking them keeps the
 *        judge pass and single-pass paths honest in any language.
 */
import { describe, it, expect } from 'vitest'
import { fitSpanToLength, realignToHookQuote } from './analyze'
import type { Sentence } from '../types'

/** Sentences of `secEach` seconds back-to-back with a 0.4s pause between them. */
function makeSentences(texts: string[], secEach = 6): Sentence[] {
  return texts.map((text, index) => ({
    index,
    start: index * (secEach + 0.4),
    end: index * (secEach + 0.4) + secEach,
    text,
  }))
}

describe('realignToHookQuote', () => {
  it('keeps the start when the first sentence is the quoted hook', () => {
    const sentences = makeSentences(['Here is how I went from zero to 10k.', 'Step one is simple.'])
    const idx = realignToHookQuote(
      { hookQuote: 'Here is how I went from zero to 10k.', startSentence: 0, endSentence: 1 },
      sentences
    )
    expect(idx).toBe(0)
  })

  it('moves the start to the buried hook sentence', () => {
    const sentences = makeSentences([
      'So yeah, we were talking about that.',
      'Anyway, moving on.',
      'Here is how I went from zero to 10k a month.',
      'The first step is distribution.',
    ])
    const idx = realignToHookQuote(
      { hookQuote: 'Here is how I went from zero to 10k a month.', startSentence: 0, endSentence: 3 },
      sentences
    )
    expect(idx).toBe(2)
  })

  it('realigns Amharic hooks (punctuation/space-insensitive, Ethiopic script)', () => {
    const sentences = makeSentences(['እንግዲህ ስለ ዚያ እንነጋገር ነበር።', 'ከዜሮ ወደ ስኬት እንዴት እንደደረስኩ ልንገራችሁ።', 'የመጀመሪያው እርምጃ ይህ ነው።'])
    const idx = realignToHookQuote(
      { hookQuote: 'ከዜሮ ወደ ስኬት እንዴት እንደደረስኩ ልንገራችሁ', startSentence: 0, endSentence: 2 },
      sentences
    )
    expect(idx).toBe(1)
  })

  it('trusts the original anchor when the quote is not found', () => {
    const sentences = makeSentences(['First thought here.', 'Second thought here.'])
    const idx = realignToHookQuote(
      { hookQuote: 'Something the model hallucinated.', startSentence: 1, endSentence: 1 },
      sentences
    )
    expect(idx).toBe(1)
  })
})

describe('fitSpanToLength', () => {
  const duration = 600

  it('returns word-precise bounds with breathing room for a fitting span', () => {
    const sentences = makeSentences(['a.', 'b.', 'c.', 'd.', 'e.'])
    const fitted = fitSpanToLength(sentences, 1, 4, duration)
    const first = sentences[1]
    const last = sentences[4]
    if (!fitted || !first || !last) throw new Error('expected a fitted span and sentences')
    expect(fitted.endIdx).toBe(4)
    expect(fitted.start).toBeLessThanOrEqual(first.start)
    expect(fitted.end).toBeGreaterThanOrEqual(last.end)
  })

  it('trims an over-long span back to a sentence end, never mid-thought', () => {
    // 20 sentences x ~6.4s ≈ 128s span — beyond hardMax (90); must trim to ≤ targetMax (60).
    const sentences = makeSentences(Array.from({ length: 20 }, (_, i) => `sentence ${i}.`))
    const fitted = fitSpanToLength(sentences, 0, 19, duration)
    if (!fitted) throw new Error('expected a fitted span')
    const trimmedEnd = sentences[fitted.endIdx]
    if (!trimmedEnd) throw new Error('expected the trimmed sentence to exist')
    expect(fitted.endIdx).toBeLessThan(19)
    expect(fitted.end - fitted.start).toBeLessThanOrEqual(60)
    // The fitted end lands exactly on the trimmed sentence's word timing (+roll).
    expect(fitted.end).toBeGreaterThanOrEqual(trimmedEnd.end)
  })

  it('drops a span that cannot reach the minimum length', () => {
    const sentences = makeSentences(['too short.'], 3)
    expect(fitSpanToLength(sentences, 0, 0, duration)).toBeNull()
  })
})
