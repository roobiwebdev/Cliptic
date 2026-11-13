/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest'
import { parseYouTubeVideoId } from './source'

describe('parseYouTubeVideoId', () => {
  it('reads the id from youtu.be short links (incl. ?si= tracking)', () => {
    expect(parseYouTubeVideoId('https://youtu.be/qgeQ5kMVwRA?si=DV4JRKnZwLEA5fYJ')).toBe('qgeQ5kMVwRA')
    expect(parseYouTubeVideoId('https://youtu.be/VeybhHRjAlY?si=bwJPD_SenDv1MNrd')).toBe('VeybhHRjAlY')
  })

  it('reads the id from watch URLs (any subdomain, extra params)', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('reads the id from shorts / embed / live / v paths', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk')
    expect(parseYouTubeVideoId('https://www.youtube.com/embed/abcdefghijk')).toBe('abcdefghijk')
    expect(parseYouTubeVideoId('https://www.youtube.com/live/abcdefghijk')).toBe('abcdefghijk')
  })

  it('falls back to a stable hash for unparseable / non-standard inputs', () => {
    const a = parseYouTubeVideoId('not a url at all')
    const b = parseYouTubeVideoId('not a url at all')
    expect(a).toBe(b) // deterministic
    expect(a.startsWith('yt-')).toBe(true)
    // a youtu.be path that isn't a valid 11-char id also falls back
    expect(parseYouTubeVideoId('https://youtu.be/short').startsWith('yt-')).toBe(true)
  })
})
