/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: editSpecSchema, EditSpec, EDIT_SPEC_VERSION,
 *   reframeSchema, ReframeSpec, aspectRatioSchema, AspectRatio, reframeLayoutSchema,
 *   cropRegionSchema, CropRegion, captionsSchema, CaptionsSpec, captionStyleSchema,
 *   CaptionStyle, captionSegmentSchema, CaptionSegment, CAPTION_FONTS, CaptionFont,
 *   CAPTION_POSITIONS, hexColorSchema, DEFAULT_CAPTION_STYLE, createDefaultEditSpec,
 *   parseEditSpec, clip editor edit spec
 *
 * WHAT:  The versioned, Zod-validated "edit spec" — the JSON recipe the browser
 *        Editor builds and the server Render Engine applies. v1 layers: reframe
 *        (crop → aspect, single or split top/bottom) and burned captions. Each
 *        future tool is ONE more optional layer here + one applier in the render
 *        stage + one UI control — the render engine loop never changes.
 * WHY:   Custom contracts live in lib/types (CLAUDE.md). This is the single
 *        source of truth for the spec shape, shared verbatim by the tRPC
 *        procedures (validate on save/render), the worker (apply it), and the UI
 *        (build it). The client is untrusted, so EVERY field is bounded here:
 *        crop rects clamp to the frame, fonts are a fixed allowlist (never a
 *        path), colors are strict hex, and text is length-capped — so a spec can
 *        never make the render sample outside the video or reach an arbitrary file.
 * WHERE: Validated by clips.saveEdit / clips.render (src/trpc/routers/clips.ts);
 *        applied by the render stage (src/lib/media-pipeline/stages/render.ts);
 *        stored on ClipEdit.spec (prisma). Narrowed back via parseEditSpec.
 */

import { z } from 'zod'

/* Bump when the shape changes incompatibly; the render engine branches on it. */
export const EDIT_SPEC_VERSION = 1

/* ── Reframe layer ───────────────────────────────────────────────────────── */

/** Output aspect ratios the render engine can produce. */
export const aspectRatioSchema = z.enum(['9:16', '1:1', '16:9'])
export type AspectRatio = z.infer<typeof aspectRatioSchema>

/** single = one crop fills the output; split = two crops stacked top/bottom. */
export const reframeLayoutSchema = z.enum(['single', 'split'])
export type ReframeLayout = z.infer<typeof reframeLayoutSchema>

/**
 * A crop rectangle in NORMALIZED source-frame coordinates (0..1), so it stays
 * resolution-independent. `x,y` = top-left; `w,h` = size. Bounded within the
 * frame (x+w ≤ 1, y+h ≤ 1) so the render never samples outside the video.
 */
export const cropRegionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  })
  .refine((r) => r.w > 0 && r.h > 0, { message: 'Crop region must have a positive size.' })
  .refine((r) => r.x + r.w <= 1 + 1e-6 && r.y + r.h <= 1 + 1e-6, {
    message: 'Crop region must stay within the video frame.',
  })
export type CropRegion = z.infer<typeof cropRegionSchema>

/**
 * The reframe layer — pick an output aspect and how source regions map into it.
 * `single` needs exactly one region; `split` needs exactly two (index 0 = top,
 * index 1 = bottom), each positioned manually by the user.
 */
export const reframeSchema = z
  .object({
    aspect: aspectRatioSchema,
    layout: reframeLayoutSchema,
    regions: z.array(cropRegionSchema).min(1).max(2),
  })
  .refine((r) => (r.layout === 'single' ? r.regions.length === 1 : r.regions.length === 2), {
    message: 'single layout needs one region; split needs two (top, bottom).',
    path: ['regions'],
  })
export type ReframeSpec = z.infer<typeof reframeSchema>

/* ── Captions layer ──────────────────────────────────────────────────────── */

/**
 * Caption fonts bundled INTO the worker image (see the render PR). A fixed
 * allowlist — never an arbitrary path — so a spec can't point ffmpeg at a file
 * outside the bundle.
 */
export const CAPTION_FONTS = ['Inter', 'Montserrat', 'Poppins', 'Anton', 'Bebas Neue'] as const
export const captionFontSchema = z.enum(CAPTION_FONTS)
export type CaptionFont = z.infer<typeof captionFontSchema>

export const CAPTION_POSITIONS = ['top', 'center', 'bottom'] as const
export const captionPositionSchema = z.enum(CAPTION_POSITIONS)
export type CaptionPosition = z.infer<typeof captionPositionSchema>

/** Strict #RRGGBB hex — validated because it's interpolated into the ASS file. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB hex color.')

export const captionStyleSchema = z.object({
  fontFamily: captionFontSchema,
  /** Caption text height as a % of the output height (keeps sizing responsive). */
  fontSizePct: z.number().min(2).max(20),
  color: hexColorSchema,
  /** Active-word color when karaoke is on. */
  highlightColor: hexColorSchema,
  position: captionPositionSchema,
  /** Word-by-word highlight timed to the transcript. */
  karaoke: z.boolean(),
  uppercase: z.boolean(),
  emoji: z.boolean(),
})
export type CaptionStyle = z.infer<typeof captionStyleSchema>

/**
 * One editable caption line, in CLIP-RELATIVE seconds. Defaulted from the clip's
 * transcript window but the user can rewrite the text before exporting.
 */
export const captionSegmentSchema = z
  .object({
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    text: z.string().trim().max(200),
  })
  .refine((s) => s.endSec > s.startSec, {
    message: 'A caption must end after it starts.',
    path: ['endSec'],
  })
export type CaptionSegment = z.infer<typeof captionSegmentSchema>

/**
 * The captions layer. When `enabled` is false the render skips it entirely.
 * `segments` are optional overrides — omitted means "derive from the clip's
 * transcript window at render time".
 */
export const captionsSchema = z.object({
  enabled: z.boolean(),
  style: captionStyleSchema,
  segments: z.array(captionSegmentSchema).max(500).optional(),
})
export type CaptionsSpec = z.infer<typeof captionsSchema>

/* ── The spec ────────────────────────────────────────────────────────────── */

/**
 * The full edit spec. `reframe` is required (every export has an output frame);
 * `captions` is optional. Fast-follow layers (cuts, overlays, brandKit, music)
 * become additional OPTIONAL fields here — the render engine applies whichever
 * are present, in a fixed order, so adding one never touches existing appliers.
 */
export const editSpecSchema = z.object({
  version: z.literal(EDIT_SPEC_VERSION),
  reframe: reframeSchema,
  captions: captionsSchema.optional(),
})
export type EditSpec = z.infer<typeof editSpecSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: DEFAULT_CAPTION_STYLE, createDefaultEditSpec
 *
 * WHAT:  A sensible starting spec for a brand-new edit (9:16, full-frame single
 *        crop, captions off) plus the default caption style the panel seeds when
 *        captions are switched on. (Caption colors are video content, not app
 *        theme, so a literal hex is correct here.)
 * WHY:   One place defines the default so the draft the UI shows and the draft
 *        the server would accept are identical.
 */
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Montserrat',
  fontSizePct: 8,
  color: '#FFFFFF',
  highlightColor: '#FFD400',
  position: 'bottom',
  karaoke: true,
  uppercase: true,
  emoji: true,
}

export function createDefaultEditSpec(aspect: AspectRatio = '9:16'): EditSpec {
  return {
    version: EDIT_SPEC_VERSION,
    reframe: {
      aspect,
      layout: 'single',
      regions: [{ x: 0, y: 0, w: 1, h: 1 }],
    },
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: parseEditSpec
 *
 * WHAT:  Narrows the untyped `ClipEdit.spec` Json column into a validated
 *        EditSpec (or null if malformed) — no `any` cast, same pattern as
 *        parseManualRanges / parseClipJobTimings.
 * WHERE: The worker reads the spec off the ClipEdit row; the UI reads a saved draft.
 */
export function parseEditSpec(value: unknown): EditSpec | null {
  const result = editSpecSchema.safeParse(value)
  return result.success ? result.data : null
}

/* ── Editor tRPC input contracts ─────────────────────────────────────────── */

/**
 * SOURCE OF TRUTH KEYWORDS: editorClipRefSchema, saveEditSchema, SaveEditValues,
 *   EditorClipRefValues
 *
 * WHAT:  Inputs for the editor procedures — reference a clip by (org, clipId),
 *        and for save/render carry the validated spec (untrusted client → the
 *        spec is re-validated server-side here).
 * WHERE: clips.getEditor / saveEdit / render / cancelRender (src/trpc/routers/clips.ts).
 */
export const editorClipRefSchema = z.object({
  organizationId: z.string().min(1),
  clipId: z.string().min(1),
})
export const saveEditSchema = editorClipRefSchema.extend({ spec: editSpecSchema })

export type EditorClipRefValues = z.infer<typeof editorClipRefSchema>
export type SaveEditValues = z.infer<typeof saveEditSchema>
