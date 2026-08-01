#!/usr/bin/env bash
#
# Run the Cliptic web app + background worker together in ONE terminal.
# - Preflight: kills any leftover dev server / workers from a previous run so
#   you never hit "port 3000 in use" / "another dev server already running".
# - Ctrl+C (or closing the terminal) stops BOTH cleanly — no orphans.
#
set -uo pipefail

# Clear leftovers from earlier runs (harmless if none exist). These run BEFORE
# we start our own processes, so they only ever hit stale ones.
pkill -f "next-server" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "src/worker/index.ts" 2>/dev/null || true
sleep 0.5

# Kill the whole process group on exit (Ctrl+C, error, or normal exit).
trap 'kill 0' EXIT

# Web (Next.js dev server).
next dev &

# Background worker (react-server condition so `server-only` is a no-op here).
NODE_OPTIONS=--conditions=react-server tsx src/worker/index.ts &

wait
