/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getR2Client, isR2Configured, R2_BUCKET, R2Client,
 *   S3Client, Storage Engine, Cloudflare R2
 *
 * WHAT:  Lazy, memoised S3 client pointed at Cloudflare R2, plus a config guard.
 * WHY:   R2 is S3-compatible; one client is the single seat of storage config so
 *        every uploader (clips today, avatars/exports tomorrow) shares it. Same
 *        fail-soft pattern as rate-limit.ts / resend: when the env isn't set the
 *        client is null and callers fail with a clear "storage not configured"
 *        message instead of a cryptic AWS error.
 * WHERE: Used by src/services/storage.service.ts (the only caller of the SDK).
 */

import { S3Client } from '@aws-sdk/client-s3'

const GLOBAL_R2_KEY = Symbol.for('app.r2.client')

type GlobalWithR2 = typeof globalThis & {
  [GLOBAL_R2_KEY]?: S3Client | null
}

/** Bucket every object lives in. Read once; safe to import anywhere server-side. */
export const R2_BUCKET = process.env['R2_BUCKET'] ?? 'cliptic-artifacts'

function resolveEndpoint(): string | null {
  const explicit = process.env['R2_ENDPOINT']
  if (explicit && explicit.trim().length > 0) return explicit.trim()
  const accountId = process.env['R2_ACCOUNT_ID']
  if (accountId && accountId.trim().length > 0) {
    return `https://${accountId.trim()}.r2.cloudflarestorage.com`
  }
  return null
}

function resolveR2Client(): S3Client | null {
  const globalWithR2 = globalThis as GlobalWithR2
  if (GLOBAL_R2_KEY in globalWithR2) {
    return globalWithR2[GLOBAL_R2_KEY] ?? null
  }
  const endpoint = resolveEndpoint()
  const accessKeyId = process.env['R2_ACCESS_KEY_ID']
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY']
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    globalWithR2[GLOBAL_R2_KEY] = null
    return null
  }
  globalWithR2[GLOBAL_R2_KEY] = new S3Client({
    /* R2 ignores region but the SDK requires one; 'auto' is the R2 convention. */
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    /* R2 works most reliably with path-style addressing. */
    forcePathStyle: true,
  })
  return globalWithR2[GLOBAL_R2_KEY]
}

/**
 * SOURCE OF TRUTH KEYWORDS: getR2Client
 *
 * WHAT:  The memoised R2 S3 client, or null when storage isn't configured.
 * WHERE: Called by storage.service.ts before every operation.
 */
export function getR2Client(): S3Client | null {
  return resolveR2Client()
}

/**
 * SOURCE OF TRUTH KEYWORDS: isR2Configured
 *
 * WHAT:  True when the R2 credentials + endpoint are all present.
 * WHERE: Setup checklist / health checks.
 */
export function isR2Configured(): boolean {
  return resolveR2Client() !== null
}
