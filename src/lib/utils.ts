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
