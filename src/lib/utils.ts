import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * SOURCE OF TRUTH KEYWORDS: slugify, kebab-case, filename slug, download filename
 *
 * WHAT:  Turns arbitrary text into a safe lowercase ASCII kebab-case slug.
 * WHY:   Clean, filesystem-safe download filenames (and any title→id need) without
 *        pulling a dependency. Strips accents, collapses non-alphanumerics to a
 *        single hyphen, and caps length; empty results fall back.
 * WHERE: Clip download filenames (clips.get downloadUrl), reusable anywhere.
 */
export function slugify(input: string, fallback = "clip"): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 80)
    .replace(/-+$/, "")
  return slug || fallback
}

/**
 * SOURCE OF TRUTH KEYWORDS: formatClock, parseClock, H:MM:SS, MM:SS, timestamp seconds
 *
 * WHAT:  Convert between seconds and an "H:MM:SS" clock string, both directions.
 * WHY:   Manual-clip range inputs (create form + studio) type/read timecodes while
 *        the API/worker speak seconds — one shared pair keeps them in sync. Hours
 *        are always shown (default 0) so a podcast slice like 1:05:03 is typeable.
 * WHERE: new-clip-dialog manual range, manual-clip-studio, anywhere times show.
 */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

/**
 * SOURCE OF TRUTH KEYWORDS: formatCaptionsForCopy, copy transcript, caption copy
 *
 * WHAT:  Caption lines → one plain-text block for the clipboard. Timestamps
 *        ([H:MM:SS], via formatClock) are included ONLY when requested — the
 *        Editor's timestamp toggle drives both what's shown and what's copied.
 * WHY:   One shared formatter so the copied text always matches the UI, for any
 *        language (text passes through untouched — Amharic, English, anything).
 * WHERE: CaptionsPanel copy button (clip editor).
 */
export function formatCaptionsForCopy(
  segments: ReadonlyArray<{ startSec: number; text: string }>,
  includeTimestamps: boolean
): string {
  return segments
    .map((s) => (includeTimestamps ? `[${formatClock(s.startSec)}] ${s.text}` : s.text))
    .join("\n")
}

/** "H:MM:SS" | "M:SS" | "SS" → seconds, or null when unparseable. */
export function parseClock(raw: string): number | null {
  const value = raw.trim()
  if (/^\d+$/.test(value)) return Number(value)
  const hms = value.match(/^(\d+):([0-5]?\d):([0-5]?\d)$/)
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  const ms = value.match(/^(\d+):([0-5]?\d)$/)
  if (ms) return Number(ms[1]) * 60 + Number(ms[2])
  return null
}
