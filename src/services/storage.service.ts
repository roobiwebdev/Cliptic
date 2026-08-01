/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: storageKeys, putObject, getSignedDownloadUrl,
 *   getSignedUploadUrl, deletePrefix, uploadFile, Storage Engine, presigned URL,
 *   clipJobPrefix, clipObjectKey, thumbnailObjectKey, transcriptObjectKey,
 *   sourceUploadKey
 *
 * WHAT:  The Storage Engine's data-access layer — tenant-prefixed key builders
 *        plus thin R2 operations (put, presign get/put, delete-by-prefix).
 * WHY:   ONE place that knows the object-key layout and talks to R2, so every
 *        feature that stores files reuses it. Pure I/O — no auth, no business
 *        rules (those live in the clips router / worker). Keys are namespaced by
 *        organizationId so tenants can never address each other's objects.
 * WHERE: Called by the clips router (presign download/upload) and the worker
 *        (put artifacts, delete on job removal).
 */

import 'server-only'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getR2Client, R2_BUCKET } from '@/lib/storage/r2-client'

/**
 * SOURCE OF TRUTH KEYWORDS: storageKeys
 *
 * WHAT:  The canonical R2 key layout, tenant-isolated by `orgs/{orgId}/…`.
 * WHY:   Single source of the prefix scheme so signed-URL ownership checks and
 *        the worker's uploads always agree.
 */
export const storageKeys = {
  clipJobPrefix: (organizationId: string, clipJobId: string): string =>
    `orgs/${organizationId}/clip-jobs/${clipJobId}`,
  sourceUploadKey: (organizationId: string, clipJobId: string, ext = 'mp4'): string =>
    `orgs/${organizationId}/clip-jobs/${clipJobId}/source/upload.${ext}`,
  transcriptKey: (organizationId: string, clipJobId: string): string =>
    `orgs/${organizationId}/clip-jobs/${clipJobId}/transcript.json`,
  clipKey: (organizationId: string, clipJobId: string, index: number): string =>
    `orgs/${organizationId}/clip-jobs/${clipJobId}/clips/clip_${String(index).padStart(2, '0')}.mp4`,
  thumbnailKey: (organizationId: string, clipJobId: string, index: number): string =>
    `orgs/${organizationId}/clip-jobs/${clipJobId}/clips/clip_${String(index).padStart(2, '0')}.jpg`,
  /** Standalone key for a pending direct upload, before a job exists. */
  pendingUploadKey: (organizationId: string, token: string, ext = 'mp4'): string =>
    `orgs/${organizationId}/uploads/${token}.${ext}`,
}

const DEFAULT_DOWNLOAD_TTL_SEC = 300 // 5 min
const DEFAULT_UPLOAD_TTL_SEC = 600 // 10 min

function requireClient() {
  const client = getR2Client()
  if (!client) {
    throw new Error(
      'Storage (Cloudflare R2) is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.'
    )
  }
  return client
}

/* Turn opaque S3 errors into actionable ones — an AccessDenied on a write almost
 * always means the R2 API token is read-only. */
function r2Error(operation: string, error: unknown): Error {
  const name = error instanceof Error ? error.name : ''
  if (name === 'AccessDenied') {
    return new Error(
      `R2 ${operation} was denied. Your R2 API token needs "Object Read & Write" permission on bucket "${R2_BUCKET}" — regenerate it in Cloudflare → R2 → Manage API Tokens and update R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.`
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * SOURCE OF TRUTH KEYWORDS: putObject
 *
 * WHAT:  Uploads a buffer/stream to R2 at `key`.
 * WHERE: Worker uploads audio/transcript/clips/thumbnails.
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<void> {
  const client = requireClient()
  try {
    await client.send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType })
    )
  } catch (error) {
    throw r2Error('upload', error)
  }
}

/**
 * SOURCE OF TRUTH KEYWORDS: downloadToFile
 *
 * WHAT:  Streams an R2 object to a local file (memory-safe for large uploads).
 * WHERE: Worker downloads an uploaded source video before processing.
 */
export async function downloadToFile(key: string, destPath: string): Promise<void> {
  const client = requireClient()
  const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  if (!res.Body) throw new Error(`Object not found in storage: ${key}`)
  await pipeline(res.Body as Readable, createWriteStream(destPath))
}

/**
 * SOURCE OF TRUTH KEYWORDS: downloadBuffer
 *
 * WHAT:  Reads a small R2 object fully into a Buffer.
 * WHERE: Worker reloads a cached transcript on retry.
 */
export async function downloadBuffer(key: string): Promise<Buffer> {
  const client = requireClient()
  const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  if (!res.Body) throw new Error(`Object not found in storage: ${key}`)
  const bytes = await res.Body.transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * SOURCE OF TRUTH KEYWORDS: deleteObject
 *
 * WHAT:  Deletes a single object by key.
 * WHERE: Worker deletes the uploaded source after a successful run (retention).
 */
export async function deleteObject(key: string): Promise<void> {
  const client = requireClient()
  await client.send(
    new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: [{ Key: key }] } })
  )
}

/**
 * SOURCE OF TRUTH KEYWORDS: getSignedDownloadUrl
 *
 * WHAT:  Short-lived presigned GET URL for a private object.
 * WHY:   The bucket is private; the clips router mints these only after checking
 *        the requesting org owns the object.
 * WHERE: clips.getDownloadUrl.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_DOWNLOAD_TTL_SEC
): Promise<string> {
  const client = requireClient()
  return getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  })
}

/**
 * SOURCE OF TRUTH KEYWORDS: getSignedUploadUrl
 *
 * WHAT:  Short-lived presigned PUT URL so the browser uploads straight to R2.
 * WHY:   Large source files never transit the web server.
 * WHERE: clips.createUploadUrl.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = DEFAULT_UPLOAD_TTL_SEC
): Promise<string> {
  const client = requireClient()
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  )
}

/**
 * SOURCE OF TRUTH KEYWORDS: deletePrefix
 *
 * WHAT:  Deletes every object under a prefix (paginated).
 * WHY:   Job deletion + retention cleanup wipe a whole `clip-jobs/{id}/` folder.
 * WHERE: clips.delete handler / worker cleanup jobs.
 */
export async function deletePrefix(prefix: string): Promise<number> {
  const client = requireClient()
  let deleted = 0
  let continuationToken: string | undefined

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )
    const objects = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => typeof k === 'string')

    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: objects.map((Key) => ({ Key })) },
        })
      )
      deleted += objects.length
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined
  } while (continuationToken)

  return deleted
}
