/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: alignAccurateWords test, isNonLatinDominant test,
 *   scriptLanguage test, hybrid transcription test, Amharic transcription test
 *
 * WHAT:  Unit tests for the hybrid-transcription pure helpers — the pieces that
 *        rescue Amharic (and other whisper-unsupported scripts) by mapping the
 *        accurate gpt-4o text onto whisper's word-timing grid.
 */
import { describe, it, expect } from 'vitest'
import {
  alignAccurateWords,
  isNonLatinDominant,
  isEnglishLang,
  distributeWordsEvenly,
  scriptLanguage,
} from './openai'

describe('isEnglishLang', () => {
  it('treats english / en / empty as English (no rescue)', () => {
    expect(isEnglishLang('english')).toBe(true)
    expect(isEnglishLang('en')).toBe(true)
    expect(isEnglishLang('')).toBe(true)
    expect(isEnglishLang(null)).toBe(true)
  })
  it('treats any other detected language as non-English (triggers rescue)', () => {
    // The key bug: whisper detects "amharic" but hallucinates English text.
    expect(isEnglishLang('amharic')).toBe(false)
    expect(isEnglishLang('somali')).toBe(false)
  })
})

describe('distributeWordsEvenly', () => {
  it('spreads words across the window when there is no whisper grid (no "no speech")', () => {
    const words = distributeWordsEvenly('ሚኒስትር አብይ አህመድ', 5, 8)
    expect(words.map((w) => w.text)).toEqual(['ሚኒስትር', 'አብይ', 'አህመድ'])
    expect(words[0]?.start).toBe(5)
    expect(words[words.length - 1]?.end).toBe(8)
  })
  it('returns nothing for empty text', () => {
    expect(distributeWordsEvenly('  ', 0, 5)).toEqual([])
  })
})

describe('isNonLatinDominant', () => {
  it('is false for English (routes to whisper, no regression)', () => {
    expect(isNonLatinDominant('Here is how I went from zero to ten thousand a month.')).toBe(false)
  })
  it('is true for Amharic (routes to the gpt-4o rescue)', () => {
    expect(isNonLatinDominant('ሚኒስትር አብይ አህመድ ለአመታት በፖለቲካ መዳረስ')).toBe(true)
  })
  it('is false for mostly-English with a few foreign chars', () => {
    expect(isNonLatinDominant('The café opened at 9am with a résumé workshop.')).toBe(false)
  })
  it('is false for empty / no-letter text (silence)', () => {
    expect(isNonLatinDominant('   ... 123 ')).toBe(false)
  })
})

describe('scriptLanguage', () => {
  it('names Amharic from Ethiopic script', () => {
    expect(scriptLanguage('ሚኒስትር አብይ አህመድ')).toBe('amharic')
  })
  it('names other non-Latin scripts', () => {
    expect(scriptLanguage('привет мир')).toBe('russian')
    expect(scriptLanguage('你好世界')).toBe('chinese')
  })
  it('falls back to a generic non-english marker', () => {
    expect(scriptLanguage('12345 ...')).toBe('non-english')
  })
})

describe('alignAccurateWords', () => {
  const grid = [
    { start: 0.0, end: 0.4 },
    { start: 0.5, end: 0.9 },
    { start: 1.0, end: 1.4 },
    { start: 1.5, end: 1.9 },
  ]

  it('places accurate words across the real timing grid (offset applied)', () => {
    const words = alignAccurateWords('ሚኒስትር አብይ አህመድ ለአመታት', grid, 10)
    expect(words.map((w) => w.text)).toEqual(['ሚኒስትር', 'አብይ', 'አህመድ', 'ለአመታት'])
    const first = words[0]
    const last = words[3]
    if (!first || !last) throw new Error('expected 4 aligned words')
    expect(first.start).toBeCloseTo(10.0, 5) // offset shifts to absolute time
    expect(last.start).toBeGreaterThan(first.start)
  })

  it('keeps timestamps monotonic when more words than grid slots', () => {
    const words = alignAccurateWords('a b c d e f g h', grid, 0)
    expect(words).toHaveLength(8)
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1]
      const cur = words[i]
      if (!prev || !cur) throw new Error('expected contiguous words')
      expect(cur.start).toBeGreaterThanOrEqual(prev.start)
      expect(cur.end).toBeGreaterThan(cur.start)
    }
  })

  it('returns nothing when the timing grid is empty (whisper found no speech)', () => {
    expect(alignAccurateWords('ሚኒስትር አብይ', [], 0)).toEqual([])
  })

  it('returns nothing for empty accurate text', () => {
    expect(alignAccurateWords('   ', grid, 0)).toEqual([])
  })
})
