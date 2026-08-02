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
 * SOURCE OF TRUTH KEYWORDS: formatClock, parseClock, MM:SS, timestamp seconds
 *
 * WHAT:  Convert between seconds and a "M:SS" clock string, both directions.
 * WHY:   Manual-clip range inputs (create form + studio) type/read MM:SS while
 *        the API/worker speak seconds — one shared pair keeps them in sync.
 * WHERE: new-clip-dialog manual range, manual-clip-studio, anywhere times show.
 */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** "M:SS" | "MM:SS" | "SS" → seconds, or null when unparseable. */
export function parseClock(raw: string): number | null {
  const value = raw.trim()
  if (/^\d+$/.test(value)) return Number(value)
  const m = value.match(/^(\d+):([0-5]?\d)$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
