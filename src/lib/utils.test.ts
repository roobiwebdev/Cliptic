/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest'
import { formatClock, parseClock, formatCaptionsForCopy } from './utils'

describe('formatClock', () => {
  it('always shows hours (H:MM:SS), default 0', () => {
    expect(formatClock(0)).toBe('0:00:00')
    expect(formatClock(30)).toBe('0:00:30')
    expect(formatClock(345)).toBe('0:05:45')
    expect(formatClock(3903)).toBe('1:05:03') // 1h 5m 3s
    expect(formatClock(-5)).toBe('0:00:00') // clamps negatives
  })
})

describe('parseClock', () => {
  it('parses H:MM:SS', () => {
    expect(parseClock('1:05:03')).toBe(3903)
    expect(parseClock('0:00:00')).toBe(0)
    expect(parseClock('2:00:00')).toBe(7200)
  })

  it('still parses M:SS (back-compat) and plain seconds', () => {
    expect(parseClock('5:45')).toBe(345)
    expect(parseClock('0:30')).toBe(30)
    expect(parseClock('90')).toBe(90)
  })

  it('round-trips with formatClock', () => {
    for (const sec of [0, 30, 345, 3903, 7325]) {
      expect(parseClock(formatClock(sec))).toBe(sec)
    }
  })

  it('rejects invalid input', () => {
    expect(parseClock('abc')).toBeNull()
    expect(parseClock('1:99')).toBeNull() // seconds out of range
    expect(parseClock('1:05:99')).toBeNull()
    expect(parseClock('')).toBeNull()
  })
})

describe('formatCaptionsForCopy', () => {
  const segments = [
    { startSec: 0.4, text: 'Here is how I went' },
    { startSec: 3903, text: 'ከዜሮ ወደ ስኬት' },
  ]

  it('copies plain text lines when timestamps are off', () => {
    expect(formatCaptionsForCopy(segments, false)).toBe('Here is how I went\nከዜሮ ወደ ስኬት')
  })

  it('prefixes [H:MM:SS] timestamps when the toggle is on — any language untouched', () => {
    expect(formatCaptionsForCopy(segments, true)).toBe(
      '[0:00:00] Here is how I went\n[1:05:03] ከዜሮ ወደ ስኬት'
    )
  })

  it('returns an empty string for no segments', () => {
    expect(formatCaptionsForCopy([], true)).toBe('')
  })
})
