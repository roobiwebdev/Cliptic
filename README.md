# Cliptic

**Long videos in. Viral clips out.**

Cliptic turns long-form videos (podcasts, interviews, talks) into short, viral-ready clips with AI. Paste a YouTube link or upload a file — Cliptic transcribes it, an LLM finds the best moments from the transcript, and FFmpeg cuts frame-accurate clips, snapped to silence. You get ready-to-post clips back in minutes, with live progress the whole way.

## How it works

```
link / upload → download (once, 720p) → transcribe (word timestamps)
             → analyze (LLM picks viral moments) → cut (parallel, streamed) → clips
```

The AI never watches the video — it reasons over the **transcript**, so it's fast, cheap, and provider-agnostic.

## Stack

- **Next.js 16** (App Router) + **tRPC** + **Prisma/Postgres** + **Better Auth** — multi-tenant SaaS foundation with organizations, roles, plan limits, audit logs, and rate limiting.
- **BullMQ + Redis** worker for the long-running video pipeline; **Cloudflare R2** for artifacts.
- **Swappable AI** — OpenAI / Anthropic / Ollama for selection; Whisper / whisper.cpp for transcription. Bring your own key or run locally.
- **Polar** for billing (Merchant of Record).

## Develop

```bash
pnpm install
cp .env.example .env      # fill in the values (see .env.example)
pnpm prisma db push       # sync the schema (this repo is schema-first, not migrate)
pnpm dev:all              # runs the web app + background worker together (Ctrl+C stops both)
```

Open http://localhost:3000. The worker needs a reachable Redis and Cloudflare R2 to process jobs.

### Deploy (Railway)

- **Web** service: standard Next.js build.
- **Worker** service: build from `Dockerfile.worker` (ships ffmpeg + aria2 + a fresh yt-dlp).

## Architecture

Cliptic is built on the **Architectural Guardrail** method — one feature registry (`src/lib/resources.ts`) + one protected procedure wire up auth, permissions, plan limits, usage counters, audit, and rate limits. See `docs/`.

Design language: **glass-dark-ui** (`.claude/skills/glass-dark-ui`) — the core visual style across the whole platform.

## License

Proprietary — © Cliptic. All rights reserved.
