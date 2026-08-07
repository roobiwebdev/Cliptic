/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: sentences test, assembleSentences test, Amharic test
 *
 * WHAT:  Unit tests for the Sentence Engine — punctuation splits (Latin +
 *        Ethiopic), gap-based splits, runaway guard, prompt rendering.
 * WHY:   Sentence anchors decide every AI cut; these lock the language-agnostic
 *        splitting rules (especially Amharic ። vs the ፡ word separator).
 */
import { describe, it, expect } from 'vitest'
import { assembleSentences, renderSentences } from './sentences'
import type { Word } from '../types'

/** Evenly-timed words: 0.3s per word, `gapAfter` inserts extra silence AFTER the 1-based nth word. */
function makeWords(texts: string[], gapAfter: Record<number, number> = {}): Word[] {
  const words: Word[] = []
  let t = 0
  texts.forEach((text, i) => {
    words.push({ text, start: t, end: t + 0.3 })
    t += 0.3 + 0.05 + (gapAfter[i + 1] ?? 0)
  })
  return words
}

describe('assembleSentences', () => {
  it('splits on Latin terminal punctuation', () => {
    const words = makeWords(['I', 'quit', 'my', 'job.', 'Best', 'decision', 'ever!'])
    const sentences = assembleSentences(words)
    expect(sentences.map((s) => s.text)).toEqual(['I quit my job.', 'Best decision ever!'])
  })

  it('splits on Ethiopic full stop ። and question mark ፧ but NOT on the word separator ፡', () => {
    const words = makeWords(['እኔ፡ወደ', 'ገበያ', 'ሄድኩ።', 'አንተስ፧', 'ደህና', 'ነኝ።'])
    const sentences = assembleSentences(words)
    expect(sentences.map((s) => s.text)).toEqual(['እኔ፡ወደ ገበያ ሄድኩ።', 'አንተስ፧', 'ደህና ነኝ።'])
  })

  it('splits on a real spoken pause even without punctuation (unpunctuated non-English speech)', () => {
    const words = makeWords(['so', 'we', 'started', 'over', 'then', 'it', 'worked'], { 4: 0.9 })
    const sentences = assembleSentences(words)
    expect(sentences.map((s) => s.text)).toEqual(['so we started over', 'then it worked'])
  })

  it('keeps sentences intact across small word gaps', () => {
    const words = makeWords(['one', 'single', 'thought'], { 1: 0.2, 2: 0.3 })
    expect(assembleSentences(words)).toHaveLength(1)
  })

  it('allows trailing quotes after the terminal mark', () => {
    const words = makeWords(['he', 'said', '"stop."', 'so', 'I', 'did.'])
    const sentences = assembleSentences(words)
    expect(sentences.map((s) => s.text)).toEqual(['he said "stop."', 'so I did.'])
  })

  it('force-breaks runaway unpunctuated speech at a micro-pause', () => {
    const texts = Array.from({ length: 50 }, (_, i) => `w${i}`)
    const words = makeWords(texts, { 42: 0.3 })
    const sentences = assembleSentences(words)
    expect(sentences.length).toBeGreaterThan(1)
    expect(sentences[0]?.text.split(' ')).toHaveLength(42)
  })

  it('carries precise word timing onto sentence bounds and sequential indices', () => {
    const words = makeWords(['First', 'one.', 'Second', 'one.'])
    const sentences = assembleSentences(words)
    expect(sentences[0]).toMatchObject({ index: 0, start: 0 })
    expect(sentences[1]?.index).toBe(1)
    expect(sentences[0]?.end).toBeCloseTo(words[1]?.end ?? -1, 5)
    expect(sentences[1]?.start).toBeCloseTo(words[2]?.start ?? -1, 5)
  })

  it('returns [] for no words', () => {
    expect(assembleSentences([])).toEqual([])
  })
})

describe('renderSentences', () => {
  it('renders indexed lines with start timestamps and long-pause markers', () => {
    const words = makeWords(['Big', 'claim.', 'The', 'payoff.'], { 2: 1.4 })
    const rendered = renderSentences(assembleSentences(words))
    const lines = rendered.split('\n')
    expect(lines[0]).toMatch(/^s0 \[0\.0\] Big claim\. ⏸$/)
    expect(lines[1]).toMatch(/^s1 \[\d+\.\d\] The payoff\.$/)
  })
})
