#!/usr/bin/env bash
#
# Run the Cliptic web app + background worker together in ONE terminal.
# Ctrl+C (or closing the terminal) stops BOTH cleanly — no orphaned dev server
# holding port 3000 and no piled-up workers.
#
set -euo pipefail

# Kill the whole process group on exit (Ctrl+C, error, or normal exit).
trap 'kill 0' EXIT

# Web (Next.js dev server).
next dev &

# Background worker (react-server condition so `server-only` is a no-op here).
NODE_OPTIONS=--conditions=react-server tsx src/worker/index.ts &

wait
