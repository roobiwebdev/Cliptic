# The Clip Editor

After a clip is generated, the user opens it in a full-screen **Editor** to visually
edit it, then **exports** a new video. v1 ships two tools — **manual reframe** and
**styled captions** — but the point is the architecture: **one render engine, many
spec fields**. Every future tool is *one spec field + one UI control + one ffmpeg
applier*.

## The two ideas

1. **The edit spec** (`src/lib/types/edit-spec.ts`) — a versioned, Zod-validated JSON
   recipe the browser builds. It does NOT render video. It's just data: an output
   aspect, crop regions, caption style + lines, and (later) cuts/overlays/brand/music.
2. **The Render Engine** (`src/lib/media-pipeline/stages/render.ts`) — a server job
   that applies the spec to the clip mp4 with ffmpeg and writes a new edited mp4 + poster
   to R2. It's an **ordered pipeline of appliers**; each reads one optional spec field.

The browser is a live preview + controls that produce the spec. All rendering is
server-side, reusing the existing Job Engine, Storage Engine, and encode settings.

## End-to-end flow

```
Editor UI (spec)  ──saveEdit (autosave, DRAFT)──▶  ClipEdit.spec (Json)
      │
      └──render──▶ ClipEdit(QUEUED) ──enqueue──▶ clip-render queue
                                                      │
                            worker: download clip mp4 → renderEditSpec(spec) → R2
                                                      │
      getEditor (poll)  ◀──ClipEdit(RENDERING→COMPLETED, outputR2Key)──┘
      │
      └──▶ edited preview + attachment download URL
```

- **Data model:** `ClipEdit` (one per clip, `@@unique([clipId])`) holds the spec, the
  render status/progress, and the output keys. Non-destructive — the source `Clip` is
  never touched. `organizationId` is denormalized (tenant-scoped queries + signed URLs).
- **Procedures** (all `protectedProcedure` on the `clips` resource): `getEditor`,
  `saveEdit` (`audit:false`), `render` (audited, rate-limited, per-plan concurrent cap),
  `cancelRender`, `getEditorCaptions`.
- **Gating:** editing needs `clips:update`. Export is **rate-limited** (registry
  `clips.rateLimit.render`) + capped by **`maxConcurrentRenders`** (per plan). Re-rendering
  does **not** consume a monthly video — the video was already paid for.

## v1 tools → spec → ffmpeg

- **Reframe:** `spec.reframe` = `{ aspect, layout, regions[] }`. `single` crops one region
  and covers it to the output frame; `split` covers two regions to half height and
  `vstack`s them. The crop rectangles come from the Editor (normalized 0..1), locked to
  the output region's pixel aspect (see `reframe-geometry.ts`).
- **Captions:** `spec.captions` = `{ enabled, style, segments? }`. Words come from the
  clip's cached Whisper transcript (`sliceTranscriptWords`), grouped into lines by
  `buildCaptionEvents`, compiled to an ASS subtitle by `captions/ass.ts` (word-level
  karaoke via `\kf`), and burned with ffmpeg's `ass` filter. When the user edits the
  text, `segments` overrides the transcript; otherwise the worker derives it.

## Adding a fast-follow (the whole point)

To add filler-word removal, a hook/title overlay, a brand kit, or background music:

1. **Spec:** add ONE optional field to `editSpecSchema` (e.g. `cuts?`, `overlays?`,
   `brandKit?`, `music?`). Bounded like the rest (no arbitrary paths, clamped values).
2. **Applier:** add ONE step to the fixed order in `renderEditSpec` that reads that field
   and appends to the ffmpeg command (a filter, an extra input, an audio mix). The engine
   loop never changes.
3. **UI:** add ONE control panel that mutates that field. Autosave + export are unchanged.

Asset uploads (brand logo, music) reuse the Storage Engine's presigned PUT with size/type
guards — the same pattern as `clips.createUploadUrl`.

## Files

| Concern | File |
|--------|------|
| Edit spec (SOT) | `src/lib/types/edit-spec.ts` |
| Render engine | `src/lib/media-pipeline/stages/render.ts` |
| Caption compiler | `src/lib/media-pipeline/captions/ass.ts` |
| Render worker | `src/worker/processors/clip-render.processor.ts` |
| Procedures | `src/trpc/routers/clips.ts` (`getEditor`/`saveEdit`/`render`/`cancelRender`/`getEditorCaptions`) |
| Editor UI | `src/app/(dashboard)/dashboard/clips/[jobId]/[clipId]/edit/` |
| Storage keys | `src/services/storage.service.ts` (`clipEdit*`) |
| Render caps | `src/lib/config/clip-limits.ts` (`maxConcurrentRenders`) + `RESOURCES.clips` |

Worker note: caption burning needs fonts in the image — `Dockerfile.worker` ships
fontconfig + Noto (incl. color emoji). The branded caption fonts fall back to Noto until
their `.ttf` files are dropped into the image (no code change).
