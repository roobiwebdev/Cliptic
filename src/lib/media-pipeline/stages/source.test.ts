/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { describe, it, expect } from 'vitest'
import { parseYouTubeVideoId, classifyYoutubeError } from './source'

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

describe('classifyYoutubeError', () => {
  it('maps the bot wall (sign-in / 429) to actionable cookies guidance', () => {
    const raw =
      'yt-dlp exited with code 1:\nERROR: [youtube] X: Sign in to confirm you’re not a bot. Use --cookies'
    const msg = classifyYoutubeError(raw)
    expect(msg.toLowerCase()).toContain('bot')
    expect(msg).toContain('YTDLP_COOKIES')
  })

  it('maps a bare HTTP 429 to rate-limit/cookies guidance', () => {
    expect(classifyYoutubeError('HTTP Error 429: Too Many Requests')).toContain('YTDLP_COOKIES')
  })

  it('recognizes private, unavailable, and age-restricted videos distinctly', () => {
    expect(classifyYoutubeError('ERROR: Private video. Sign in if granted access').toLowerCase()).toContain('private')
    expect(classifyYoutubeError('ERROR: Video unavailable. This video has been removed').toLowerCase()).toContain('unavailable')
    expect(
      classifyYoutubeError('ERROR: Sign in to confirm your age. This video may be inappropriate').toLowerCase()
    ).toContain('age-restricted')
  })

  it('never swallows an unknown failure — keeps a raw tail', () => {
    expect(classifyYoutubeError('ERROR: some brand new failure mode')).toContain('some brand new failure mode')
  })
})
