/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: extractJson
 *
 * WHAT:  Robustly pulls a JSON value out of an LLM response — tolerates markdown
 *        fences and surrounding prose models add despite JSON-mode instructions.
 * WHERE: stages/analyze.ts.
 */
export function extractJson(text: string): string {
  let t = text.trim()

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) t = fence[1].trim()

  const firstObj = t.indexOf('{')
  const firstArr = t.indexOf('[')
  const candidates = [firstObj, firstArr].filter((i) => i >= 0)
  if (candidates.length === 0) return t
  const start = Math.min(...candidates)

  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  if (end < start) return t.slice(start)
  return t.slice(start, end + 1)
}
