/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest'
import { hexToAssColor, buildCaptionEvents, compileAss, type AssStyle } from './ass'

describe('hexToAssColor', () => {
  it('byte-swaps #RRGGBB to ASS &H00BBGGRR (opaque)', () => {
    expect(hexToAssColor('#FFD400')).toBe('&H0000D4FF')
    expect(hexToAssColor('#FFFFFF')).toBe('&H00FFFFFF')
    expect(hexToAssColor('#000000')).toBe('&H00000000')
  })
})

describe('buildCaptionEvents', () => {
  it('groups transcript words into a line carrying their real timings', () => {
    const events = buildCaptionEvents({
      words: [
        { text: 'Hello', start: 0, end: 0.5 },
        { text: 'world', start: 0.5, end: 1 },
      ],
      uppercase: false,
      emoji: true,
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.words.map((w) => w.text)).toEqual(['Hello', 'world'])
    expect(events[0]?.start).toBe(0)
    expect(events[0]?.end).toBe(1)
  })

  it('uppercases and strips emoji when the style disables it', () => {
    const events = buildCaptionEvents({
      words: [{ text: 'fire🔥', start: 0, end: 1 }],
      uppercase: true,
      emoji: false,
    })
    expect(events[0]?.words[0]?.text).toBe('FIRE')
  })

  it('prefers user-edited segments and distributes word timings across the line', () => {
    const events = buildCaptionEvents({
      segments: [{ startSec: 2, endSec: 4, text: 'one two' }],
      uppercase: false,
      emoji: true,
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.start).toBe(2)
    expect(events[0]?.end).toBe(4)
    expect(events[0]?.words).toHaveLength(2)
  })

  it('passes Amharic (Ethiopic script) through unharmed — uppercase is a no-op, no glyph loss', () => {
    const events = buildCaptionEvents({
      words: [
        { text: 'ከዜሮ', start: 0, end: 0.5 },
        { text: 'ወደ', start: 0.5, end: 0.9 },
        { text: 'ስኬት።', start: 0.9, end: 1.5 },
      ],
      uppercase: true,
      emoji: false,
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.words.map((w) => w.text)).toEqual(['ከዜሮ', 'ወደ', 'ስኬት።'])
  })

  it('breaks a long run of words into multiple lines', () => {
    const words = Array.from({ length: 10 }, (_, i) => ({
      text: `w${i}`,
      start: i,
      end: i + 0.5,
    }))
    const events = buildCaptionEvents({ words, uppercase: false, emoji: true })
    expect(events.length).toBeGreaterThan(1)
  })
})

describe('compileAss', () => {
  const style: AssStyle = {
    fontName: 'Montserrat',
    fontSizePx: 100,
    primaryColorHex: '#FFFFFF',
    highlightColorHex: '#FFD400',
    alignment: 2,
    marginVPx: 100,
    karaoke: false,
    bold: true,
  }
  const dims = { width: 1080, height: 1920 }

  it('emits an ASS document sized to the output frame', () => {
    const out = compileAss(
      [{ start: 0, end: 1, words: [{ text: 'HI', start: 0, end: 1 }] }],
      style,
      dims
    )
    expect(out).toContain('PlayResX: 1080')
    expect(out).toContain('PlayResY: 1920')
    expect(out).toContain('WrapStyle: 0') // smart wrap — overflow-proof for wide scripts/fonts
    expect(out).toContain('Style: Caption,Montserrat,100,')
    expect(out).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,Caption,,0,0,0,,HI')
  })

  it('adds karaoke \\kf tags when karaoke is enabled', () => {
    const out = compileAss(
      [{ start: 0, end: 1, words: [{ text: 'HI', start: 0, end: 1 }] }],
      { ...style, karaoke: true },
      dims
    )
    expect(out).toContain('{\\kf100}HI')
  })

  it('compiles Amharic dialogue with word-synced karaoke timing intact', () => {
    const out = compileAss(
      [
        {
          start: 0,
          end: 1.5,
          words: [
            { text: 'ከዜሮ', start: 0, end: 0.5 },
            { text: 'ስኬት።', start: 0.5, end: 1.5 },
          ],
        },
      ],
      { ...style, karaoke: true },
      dims
    )
    expect(out).toContain('{\\kf50}ከዜሮ')
    expect(out).toContain('{\\kf100}ስኬት።')
  })
})
