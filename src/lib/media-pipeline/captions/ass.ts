/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: compileAss, buildCaptionEvents, hexToAssColor,
 *   CaptionEvent, CaptionWord, AssStyle, AssDimensions, ASS subtitle, karaoke,
 *   burned captions
 *
 * WHAT:  A PURE compiler that turns caption timing + style into an ASS subtitle
 *        document (the format libass burns in via ffmpeg's `ass` filter). Two
 *        steps: buildCaptionEvents (transcript words OR user-edited segments →
 *        timed lines) and compileAss (lines + style + output size → .ass text).
 * WHY:   Kept free of ffmpeg, files, and app types so it is deterministic and
 *        unit-testable — the render stage owns the impure ffmpeg call and the
 *        EditSpec→AssStyle mapping. Karaoke word-highlight is native ASS (`\kf`),
 *        so it costs nothing extra at render time.
 * WHERE: Consumed by src/lib/media-pipeline/stages/render.ts (captions applier).
 */

/** A word with clip-relative timestamps (seconds). Mirrors media-pipeline Word. */
export interface CaptionWord {
  text: string
  start: number
  end: number
}

/** One on-screen caption line: its visible window and the words within it. */
export interface CaptionEvent {
  start: number
  end: number
  words: CaptionWord[]
}

/** ASS-domain style (already resolved from the app CaptionStyle by render.ts). */
export interface AssStyle {
  fontName: string
  fontSizePx: number
  /** Base text color (#RRGGBB). */
  primaryColorHex: string
  /** Karaoke "spoken" color (#RRGGBB). */
  highlightColorHex: string
  /** Outline color (#RRGGBB); defaults to black. */
  outlineColorHex?: string
  /** ASS numpad alignment (2=bottom-center, 5=center, 8=top-center). */
  alignment: number
  /** Vertical margin from the aligned edge, in output pixels. */
  marginVPx: number
  karaoke: boolean
  bold: boolean
}

export interface AssDimensions {
  width: number
  height: number
}

/* Broad emoji ranges — stripped when the caption style disables emoji. */
const EMOJI_REGEX =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu

/* Short-form pacing: few words on screen at a time. Char cap counts CHARACTERS
 * (script-agnostic); pixel overflow is impossible regardless because compileAss
 * uses WrapStyle 0 — libass wraps within the margins when a line is still too
 * wide for the frame (wide scripts like Ethiopic, huge font sizes). */
const MAX_WORDS_PER_LINE = 5
const MAX_CHARS_PER_LINE = 20
const MAX_LINE_GAP_SEC = 0.8

/**
 * SOURCE OF TRUTH KEYWORDS: hexToAssColor
 *
 * WHAT:  #RRGGBB → ASS `&HAABBGGRR` (opaque). ASS colors are BGR with a leading
 *        alpha; 00 alpha = fully opaque.
 * WHY:   The spec validates colors as #RRGGBB; ASS needs them byte-swapped.
 */
export function hexToAssColor(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  const rgb = m?.[1] ?? 'FFFFFF'
  const rr = rgb.slice(0, 2)
  const gg = rgb.slice(2, 4)
  const bb = rgb.slice(4, 6)
  return `&H00${bb}${gg}${rr}`.toUpperCase()
}

function transformText(text: string, uppercase: boolean, emoji: boolean): string {
  let out = text
  if (!emoji) out = out.replace(EMOJI_REGEX, '')
  if (uppercase) out = out.toUpperCase()
  return out.replace(/\s+/g, ' ').trim()
}

/** Split a segment's text into evenly-timed pseudo-words (proportional to length). */
function distributeWords(text: string, start: number, end: number): CaptionWord[] {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return []
  const totalChars = tokens.reduce((n, t) => n + t.length, 0) || 1
  const span = Math.max(0.01, end - start)
  const words: CaptionWord[] = []
  let cursor = start
  for (const token of tokens) {
    const dur = (token.length / totalChars) * span
    words.push({ text: token, start: cursor, end: cursor + dur })
    cursor += dur
  }
  const last = words[words.length - 1]
  if (last) last.end = end
  return words
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildCaptionEvents
 *
 * WHAT:  Turn either user-edited segments (authoritative) or raw transcript
 *        words into timed caption lines. Segments give line-level timing (words
 *        distributed proportionally so karaoke still works); words are grouped
 *        into short lines with their real timestamps.
 * WHY:   The Editor may hand us either — the user's edits win when present,
 *        otherwise we derive lines from the clip's transcript window.
 */
export function buildCaptionEvents(input: {
  segments?: ReadonlyArray<{ startSec: number; endSec: number; text: string }>
  words?: ReadonlyArray<CaptionWord>
  uppercase: boolean
  emoji: boolean
}): CaptionEvent[] {
  const { uppercase, emoji } = input

  if (input.segments && input.segments.length > 0) {
    const events: CaptionEvent[] = []
    for (const seg of input.segments) {
      const text = transformText(seg.text, uppercase, emoji)
      if (!text) continue
      const words = distributeWords(text, seg.startSec, seg.endSec)
      if (words.length === 0) continue
      events.push({ start: seg.startSec, end: seg.endSec, words })
    }
    return events
  }

  const source = input.words ?? []
  const events: CaptionEvent[] = []
  let line: CaptionWord[] = []
  let chars = 0

  const flush = (): void => {
    if (line.length === 0) return
    const first = line[0]
    const last = line[line.length - 1]
    if (first && last) events.push({ start: first.start, end: last.end, words: line })
    line = []
    chars = 0
  }

  for (const raw of source) {
    const text = transformText(raw.text, uppercase, emoji)
    if (!text) continue
    const word: CaptionWord = { text, start: raw.start, end: raw.end }
    const prev = line[line.length - 1]
    const gap = prev ? word.start - prev.end : 0
    const wouldOverflow =
      line.length >= MAX_WORDS_PER_LINE || chars + text.length + 1 > MAX_CHARS_PER_LINE
    if (line.length > 0 && (wouldOverflow || gap > MAX_LINE_GAP_SEC)) flush()
    line.push(word)
    chars += text.length + 1
  }
  flush()
  return events
}

/** ASS timestamp `H:MM:SS.cs` (centiseconds), clamped to non-negative. */
function formatAssTime(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.round((s - Math.floor(s)) * 100)
  const cc = cs === 100 ? 99 : cs // guard rounding to 100
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cc).padStart(2, '0')}`
}

/* ASS override blocks are wrapped in braces; strip them from user text so a
 * stray `{` can't inject styling. Newlines become hard breaks. */
function escapeAssText(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N')
}

function renderEventText(event: CaptionEvent, karaoke: boolean): string {
  if (!karaoke) {
    return escapeAssText(event.words.map((w) => w.text).join(' '))
  }
  return event.words
    .map((w) => {
      const cs = Math.max(1, Math.round((w.end - w.start) * 100))
      return `{\\kf${cs}}${escapeAssText(w.text)} `
    })
    .join('')
    .trimEnd()
}

/**
 * SOURCE OF TRUTH KEYWORDS: compileAss
 *
 * WHAT:  Build the full ASS document from events + style + output dimensions.
 * WHY:   PlayResX/Y are the output pixels so font size + margins scale exactly
 *        to the rendered frame. Karaoke swaps Primary/Secondary so unspoken words
 *        show in the base color and fill to the highlight color as they're spoken.
 */
export function compileAss(events: CaptionEvent[], style: AssStyle, dims: AssDimensions): string {
  const outline = style.outlineColorHex ?? '#000000'
  /* Karaoke: PrimaryColour is the "sung" color, SecondaryColour the "unsung". */
  const primary = style.karaoke ? style.highlightColorHex : style.primaryColorHex
  const secondary = style.karaoke ? style.primaryColorHex : style.primaryColorHex
  const outlinePx = Math.max(2, Math.round(style.fontSizePx * 0.06))
  const shadowPx = Math.max(0, Math.round(style.fontSizePx * 0.03))
  const marginLR = Math.round(dims.width * 0.05)
  const bold = style.bold ? -1 : 0

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${dims.width}`,
    `PlayResY: ${dims.height}`,
    /* Smart wrap: a line wider than the frame (big fonts, wide scripts) breaks
     * across balanced rows inside the margins instead of overflowing the edges. */
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${style.fontName},${style.fontSizePx},${hexToAssColor(primary)},${hexToAssColor(secondary)},${hexToAssColor(outline)},&H64000000,${bold},0,0,0,100,100,0,0,1,${outlinePx},${shadowPx},${style.alignment},${marginLR},${marginLR},${style.marginVPx},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]

  const lines = events
    .filter((e) => e.end > e.start && e.words.length > 0)
    .map(
      (e) =>
        `Dialogue: 0,${formatAssTime(e.start)},${formatAssTime(e.end)},Caption,,0,0,0,,${renderEventText(e, style.karaoke)}`
    )

  return [...header, ...lines, ''].join('\n')
}
