/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: run, capture, captureAll, runWithProgress, tailBuffer
 *
 * WHAT:  Thin child_process wrappers — the ONLY place the pipeline shells out to
 *        yt-dlp / ffmpeg / ffprobe.
 * WHY:   run() streams to stdout (progress), capture() collects stdout (probes),
 *        captureAll() returns both streams (ffmpeg silencedetect writes stderr).
 *        runWithProgress() streams progress AND keeps a tail of output so a
 *        non-zero exit surfaces the REAL error (e.g. yt-dlp's "Sign in to confirm
 *        you're not a bot" / HTTP 429) instead of a bare "exited with code 1".
 *        All fail loudly when a binary is missing.
 * WHERE: Used by the media-pipeline lib + stages.
 */

import { spawn, spawnSync } from 'node:child_process'

const commandExistsCache = new Map<string, boolean>()

/** How many trailing output lines to keep for a failure message. */
const ERROR_TAIL_LINES = 40

/**
 * SOURCE OF TRUTH KEYWORDS: tailBuffer
 *
 * WHAT:  A bounded ring of the most recent output lines, for building a
 *        meaningful error when a streamed command exits non-zero.
 * WHY:   Progress output is huge and mostly noise; on failure we only want the
 *        last few dozen lines (where yt-dlp/ffmpeg print the actual reason).
 */
class TailBuffer {
  private readonly lines: string[] = []
  push(line: string): void {
    this.lines.push(line)
    if (this.lines.length > ERROR_TAIL_LINES) this.lines.shift()
  }
  /** Prefer ERROR/WARNING lines; fall back to the raw tail. */
  meaningful(): string {
    const flagged = this.lines.filter((l) => /error|warning|forbidden|unable|unavailable|http error|sign in|not a bot|private|age/i.test(l))
    const pick = flagged.length > 0 ? flagged : this.lines
    return pick.slice(-8).join('\n').slice(0, 1500)
  }
}

/**
 * Whether a binary is on PATH (cached). Used to auto-pick aria2c when present.
 */
export function commandExists(cmd: string): boolean {
  const cached = commandExistsCache.get(cmd)
  if (cached !== undefined) return cached
  let ok = false
  try {
    const result = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
    ok = result.error === undefined
  } catch {
    ok = false
  }
  commandExistsCache.set(cmd, ok)
  return ok
}

function friendly(cmd: string, err: NodeJS.ErrnoException): Error {
  if (err.code === 'ENOENT') {
    return new Error(`"${cmd}" not found on PATH. Is it installed?`)
  }
  return err
}

/** Run a command, inheriting stdio so progress streams to the worker log. */
export function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' })
    child.on('error', (err) => reject(friendly(cmd, err)))
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))
    )
  })
}

/**
 * Run a command, streaming stdout+stderr to `onLine` line-by-line (handles
 * both \n and \r so progress bars that use carriage returns are parsed too).
 * Used to surface real yt-dlp download progress to the UI.
 */
export function runWithProgress(
  cmd: string,
  args: string[],
  onLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = new TailBuffer()
    let buffer = ''
    const handle = (chunk: Buffer) => {
      buffer += chunk.toString()
      const parts = buffer.split(/\r|\n/)
      buffer = parts.pop() ?? ''
      for (const line of parts) {
        const trimmed = line.trim()
        if (trimmed) {
          tail.push(trimmed)
          onLine(trimmed)
        }
      }
    }
    child.stdout?.on('data', handle)
    child.stderr?.on('data', handle)
    child.on('error', (err) => reject(friendly(cmd, err)))
    child.on('close', (code) => {
      if (code === 0) return resolve()
      const detail = tail.meaningful()
      reject(new Error(`${cmd} exited with code ${code}${detail ? `:\n${detail}` : ''}`))
    })
  })
}

/** Run a command and resolve with its trimmed stdout. */
export function capture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => reject(friendly(cmd, err)))
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`))
    )
  })
}

/** Run a command and resolve with BOTH streams (ffmpeg reports on stderr). */
export function captureAll(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => reject(friendly(cmd, err)))
    child.on('close', (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`))
    )
  })
}
