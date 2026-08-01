#!/usr/bin/env bash
#
# Copyright (c) 2026 Web Prodigies LLC
#
# Cliptic worker entrypoint (Docker/Railway only).
#
# WHAT:  Starts the bgutil PO-token provider in the background (127.0.0.1:4416),
#        then hands off to the BullMQ worker as the main process.
# WHY:   yt-dlp's bgutil plugin fetches PO tokens from this local provider so
#        YouTube downloads get past the datacenter-IP bot wall (HTTP 429). The
#        provider is best-effort: if it fails to boot, the worker still runs and
#        yt-dlp falls back to cookies — no PO tokens, but no regression either.
# WHERE: Referenced by Dockerfile.worker's CMD. Not used in local dev.

set -u

# Best-effort start of the PO-token provider (non-fatal if missing/failing).
if [ -f /opt/bgutil-provider/build/main.js ]; then
  echo "[entrypoint] starting bgutil PO-token provider on 127.0.0.1:4416"
  node /opt/bgutil-provider/build/main.js >/tmp/bgutil-provider.log 2>&1 &
  # Give it a moment to bind before the first job asks for a token.
  sleep 2
else
  echo "[entrypoint] bgutil provider not found — continuing without PO tokens"
fi

# Hand off to the worker as PID-forwarded main process.
exec pnpm worker
