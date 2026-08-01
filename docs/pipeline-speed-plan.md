# Cliptic Pipeline Speed Plan — measure-first, evidence-based

> Plan-only. On approval, ships as a branch → PR into `dev` (green CI + CodeRabbit), you review/merge. On approval I also copy this to `docs/pipeline-speed-plan.md`.

## Context
After a user submits a URL, clips take far too long and the screen feels dead. Goal: make it *fast* and get the **first usable clip as early as physically possible**, without degrading the AI's clip selection.

---

## 1. Measured findings (real numbers, not guesses)

Representative video = `Mof4DT_jzSs` (11 min / 659 s / 2528 words / 5 clips). Numbers from the **actual Cliptic worker log** + existing clipper artifacts + tooling probes.

| Stage | Measured | Notes |
|---|---|---|
| **Download (audio-only)** | **594 s — 9 min 54 s** @ **19 KiB/s** avg, 4× read-timeouts/retries | **~90% of wall-clock.** Pure YouTube CDN throttling of format 251 from `googlevideo.com`. |
| Audio → WAV transcode | few sec | ffmpeg local, negligible. |
| Transcribe | single Whisper call (21 MB WAV < 24 MB cap) ≈ 20–40 s | **Long videos exceed 24 MB → chunked *sequentially*** (grows with length). |
| Analyze | one gpt-4o call over 2528 words ≈ 10–25 s | Minor. |
| **Cut** | ~1–2 min/clip × 5 ≈ **several min** | **Each clip re-downloads its section from YouTube (throttled again!) + re-encodes, sequentially.** |
| R2 uploads | 4–12 MB/clip, sequential | Minor. |

**Environment probes:** 16 cores local (**cloud Railway = far fewer vCPU**); **`aria2c` not installed**; ffmpeg hardware encoders exist **only locally** (no GPU on Railway → cloud uses libx264 CPU); **yt-dlp 2026.03.17 is >90 days old** (newer builds fix throttling/extraction).

### Root cause (the one-line version)
**The pipeline is bottlenecked on downloading from YouTube, and it hits YouTube `1 + N` times** — once for the audio, then once per clip for each section. Throttling (~19 KiB/s) turns each fetch into minutes. Everything else is secondary. Cloud is *worse* (datacenter IPs are throttled/blocked hardest).

> Caveat: transcribe/analyze/cut wall-clock are estimated from artifacts + API characteristics, not yet instrumented in-worker. **Phase 0 adds permanent per-stage timing** so we confirm on cloud and measure before/after for real.

---

## 2. Prioritized optimizations (easy wins first, each tied to evidence)

### TIER 0 — Instrument (do first, same PR)
- Add per-stage + per-clip timing: structured worker logs (`stage`, `durationMs`, bytes, speed) **and** persist a `timings` JSON on `ClipJob`. This is the "measure" baked in permanently, and gives honest before/after on cloud.

### TIER 1 — Kill the download bottleneck (attacks ~90% of wall-clock)
1. **Download the source ONCE, cut locally (eliminate N per-clip re-downloads).** Replace "audio-only + N throttled section downloads" with a **single capped-resolution download** (default ≤720p muxed mp4, env `CLIP_SOURCE_MAX_HEIGHT`), extract audio from it for transcription, and **cut every clip from that local file**. Turns `1 + N` throttled YouTube fetches into **one**. Biggest single win; also unlocks parallel local cutting (Tier 2).
2. **Beat the throttle on that one download:**
   - **`aria2c` multi-connection downloader** (`--downloader aria2c --downloader-args "aria2c:-x16 -s16 -k1M"`) — the most effective known fix for YouTube throttling (parallel connections bypass per-stream throttle). Requires adding `aria2` to the worker image. Env `YTDLP_DOWNLOADER=aria2c|native`.
   - **Upgrade + pin a recent yt-dlp** in the worker image (current build is 90+ days old).
   - Configurable **`--extractor-args youtube:player_client=…`** (the throttled run used the "android vr" client/fmt 251; `tv`/`ios`/`web_safari` clients often return un-throttled URLs). Env `YTDLP_PLAYER_CLIENT`.
   - Keep existing `--throttled-rate` as a fallback re-extract trigger.
3. **Lean on the upload path as the guaranteed-fast route** (already built): uploads skip YouTube entirely → download stage ≈ instant (R2→local). Best reliability on cloud. UI already offers it; we'll keep nudging speed-sensitive users there.

### TIER 2 — Parallelize + stream (time-to-first-clip + throughput)
4. **Cut clips concurrently from the local file**, bounded by `CLIP_CUT_CONCURRENCY` (default `min(cores, 4)`, auto-shrinks on small cloud instances). Cut the **best-ranked clip first**, commit + upload it immediately, then parallel-cut the rest. Each finished clip's `Clip` row appears in the UI on the next poll — the streaming seam already exists.
5. **Parallelize transcription chunks** (only long videos that chunk), bounded by `TRANSCRIBE_CONCURRENCY` (default 4). No-op for short videos.
6. R2 uploads overlap naturally with concurrent cutting; stream file→R2 to bound memory.

### TIER 3 — Faster transcription input
7. **Transcribe from compressed audio, not 21 MB WAV.** Transcode to compact mono (opus/mp3 ~24–32 kbps): an 11-min clip → ~1–3 MB, a 60-min → ~10–15 MB — **usually under the 25 MB cap → single Whisper call, no sequential chunking**, and a smaller upload to Whisper. Word timestamps are unaffected (Whisper downsamples to 16 kHz internally anyway). Cheap, broad win; chunking only kicks in for very long videos.

### TIER 4 — Encoding speed knobs (no quality regression)
8. `CLIP_ENCODE_PRESET` (default `veryfast`; `ultrafast` for max speed) and **auto-detected optional hardware accel** `CLIP_HWACCEL=auto` (`h264_nvenc`/`vaapi`/`videotoolbox` when present, else libx264). Mostly helps local/GPU hosts; cloud stays libx264, where parallelism (#4) is the real lever now that we cut from a local file.

---

## 3. Time-to-first-clip design
`analyze` returns clips **best-first**. The worker: (a) finishes download→transcribe→analyze, (b) immediately cuts + uploads + commits **clip #1**, (c) parallel-cuts the rest. The detail page already polls `clips.get` (1.5 s) and renders `Clip` rows as they land + per-clip progress. So the top clip surfaces the moment it's rendered, and the rest **stream in**. Combined with Tier 1/3 shrinking the pre-cut latency, first clip should appear in well under ~90 s (vs the whole batch after ~15 min today).

## 4. Cutting accuracy/speed trade-off (my decision — you delegated this)
**Keep frame-accurate re-encode; get speed from parallelism + local source, not from stream-copy.** Stream-copy cuts only at keyframes → clips start on the wrong frame / brief freeze / drifted boundary — visibly broken for a viral-clip product and a quality regression I won't take. Instead: cut from the already-downloaded local file (no re-fetch), in parallel, at `veryfast`/`ultrafast`, with optional HW accel. All knobs are env-tunable so you can push further later.

## 5. Risks & guards
- **YouTube on cloud (residual risk):** datacenter IPs throttle/block hardest. aria2c + player-client + fresh yt-dlp mitigate; **upload stays the guaranteed path**; residential-proxy remains the (paid) escape hatch if link success is poor — deferred, noted.
- **Bandwidth of download-once:** capped at 720p (configurable); section downloads already fetched video bytes, so net round-trips drop sharply. R2 egress is free; 7-day retention already caps storage.
- **Provider rate limits / cost:** concurrency is env-bounded; SDK backoff already on; compressed audio = same Whisper $/min; analyze model unchanged → no runaway bills.
- **CPU/memory on small cloud instances:** cut concurrency = `min(cores, N)`; stream uploads; long-video chunk concurrency bounded.
- **Selection QUALITY (hard constraint):** untouched — same `analyze` prompt + default gpt-4o, same whisper-1 word timestamps, same frame-accurate cuts. This PR changes *how fast* we fetch/cut, never *what* gets picked.

## 6. Before/after expectation (rough; confirmed by Tier-0 instrumentation)
- **Today (measured):** ~10 min download + ~4 min cut + ~1 min transcribe/analyze ≈ **~15 min**, nothing visible until the end.
- **After:** single aria2c download (seconds–~1 min when throttle is bypassed, ~10–20× on the dominant stage) + single-call transcription (~20–40 s) + analyze (~15 s) + parallel local cut (~20–40 s total).
- **Targets:** end-to-end **~15 min → ~2–3 min**; **time-to-first-clip → under ~90 s**; upload path faster still. Numbers verified by the new per-stage timings on approval.

---

## Build order (each phase provably faster than the last)
- **Phase 0 — Instrument** (timings on `ClipJob` + logs). Establish the real baseline (local + cloud). *Own PR.*
- **Phase 1 — Download once + aria2c + yt-dlp upgrade + player-client** (Tier 1). Re-measure. *Own PR.*
- **Phase 2 — Parallel cut from local file + stream first-clip-first** (Tier 2 #4) + compressed-audio transcription (Tier 3). Re-measure.
- **Phase 3 — Parallel chunk transcription + encode knobs/HW accel** (Tier 2 #5, Tier 4).
Each phase: `pnpm typecheck/lint/build` green, and the timings prove the win.

## Env knobs introduced (all optional, sane defaults)
`CLIP_SOURCE_MAX_HEIGHT=720` · `YTDLP_DOWNLOADER=aria2c` · `YTDLP_PLAYER_CLIENT` · `CLIP_CUT_CONCURRENCY` · `TRANSCRIBE_CONCURRENCY=4` · `TRANSCRIBE_AUDIO_FORMAT=opus` · `CLIP_ENCODE_PRESET=veryfast` · `CLIP_HWACCEL=auto`. Worker Docker image gains `aria2` + a pinned recent `yt-dlp`.

## Open questions
1. **Resolution cap** default 720p OK, or do you want 1080p clips (bigger/slower downloads)?
2. OK to **add `aria2` + bump yt-dlp in the worker image** (infra change to the Railway worker build)?
3. Anything blocking me from doing a **short instrumented cloud run** post-approval to capture the real cloud baseline (Phase 0)?
