/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: run, capture, captureAll
 *
 * WHAT:  Thin child_process wrappers — the ONLY place the pipeline shells out to
 *        yt-dlp / ffmpeg / ffprobe.
 * WHY:   run() streams to stdout (progress), capture() collects stdout (probes),
 *        captureAll() returns both streams (ffmpeg silencedetect writes stderr).
 *        All fail loudly when a binary is missing.
 * WHERE: Used by the media-pipeline lib + stages.
 */

import { spawn } from 'node:child_process'

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
