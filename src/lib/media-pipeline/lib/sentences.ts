/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: assembleSentences, renderSentences, Sentence,
 *   sentence splitting, terminal punctuation, word gap, pause marker, Amharic
 *
 * WHAT:  The Sentence Engine — rebuilds numbered, timestamped sentences from
 *        word-level transcript timing, and renders them as compact prompt lines.
 * WHY:   The clip AI anchors to sentence indices (never raw seconds), so cuts
 *        land on complete thoughts by construction. Splitting is language-
 *        agnostic: real spoken pauses (word gaps) are the PRIMARY signal, with a
 *        script-aware terminal-punctuation set (Latin, Ethiopic ።፧፨, Arabic ؟,
 *        CJK 。！？) as the secondary signal — so Amharic and other non-Latin
 *        transcripts split as cleanly as English.
 * WHERE: stages/analyze.ts (prompt rendering + boundary mapping); future judge
 *        pass reuses the same sentences.
 */
import type { Word, Sentence } from '../types'

/* Sentence-ENDING marks only. Ethiopic ፡ (U+1361) is a word separator, NOT a
 * full stop — deliberately excluded. Trailing quotes/brackets after the mark
 * are allowed (e.g. `word."` still terminates). */
const TERMINAL_PUNCTUATION = /[.!?…。！？؟።፧፨]["'"'»”’)\]]*$/

/** A pause this long ends a sentence even without punctuation (unpunctuated
 *  speech — common in Whisper output for non-English languages). */
const GAP_BREAK_SEC = 0.7

/** Runaway guard: after this many words, break at the next natural micro-pause
 *  so every anchor stays a usable cut point. */
const MAX_SENTENCE_WORDS = 40
const RUNAWAY_GAP_SEC = 0.25

/** Gap between sentences worth surfacing to the LLM as a long-pause marker. */
const LONG_PAUSE_SEC = 1.0

/**
 * SOURCE OF TRUTH KEYWORDS: assembleSentences
 *
 * WHAT:  words → ordered Sentence[] with precise start/end from word timing.
 * WHY:   One SOT for "what is a sentence" so prompt rendering, boundary mapping,
 *        and sentence-aware truncation can never disagree.
 */
export function assembleSentences(words: Word[]): Sentence[] {
  const sentences: Sentence[] = []
  let current: Word[] = []

  const flush = (): void => {
    const first = current[0]
    const last = current[current.length - 1]
    if (!first || !last) return
    sentences.push({
      index: sentences.length,
      start: first.start,
      end: last.end,
      text: current
        .map((w) => w.text.trim())
        .filter(Boolean)
        .join(' '),
    })
    current = []
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (!word) continue
    current.push(word)

    const next = words[i + 1]
    const gap = next ? next.start - word.end : Infinity
    const endsWithTerminal = TERMINAL_PUNCTUATION.test(word.text.trim())
    const runaway = current.length >= MAX_SENTENCE_WORDS && gap >= RUNAWAY_GAP_SEC

    if (endsWithTerminal || gap >= GAP_BREAK_SEC || runaway || !next) flush()
  }

  return sentences
}

/**
 * SOURCE OF TRUTH KEYWORDS: renderSentences, sentence prompt lines
 *
 * WHAT:  Sentences → compact prompt lines: `s<index> [<start>] <text>` with a
 *        ` ⏸` suffix where a long spoken pause follows (a natural cut point).
 * WHY:   Start-only timestamps keep token cost low (elapsed time is readable
 *        from consecutive lines); the pause marker shows the LLM real breathing
 *        points the transcript text alone can't reveal.
 */
export function renderSentences(sentences: Sentence[]): string {
  return sentences
    .map((s) => {
      const next = sentences[s.index + 1]
      const longPause = next !== undefined && next.start - s.end >= LONG_PAUSE_SEC
      return `s${s.index} [${s.start.toFixed(1)}] ${s.text}${longPause ? ' ⏸' : ''}`
    })
    .join('\n')
}
