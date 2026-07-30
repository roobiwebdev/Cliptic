/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: createOrganizationWithOwner, slugifyOrganizationName,
 *   ensureUniqueOrganizationSlug, CreateOrganizationResult
 *
 * WHAT:  Creates an Organization plus the creator's owner Member row in one
 *        transaction, deriving a unique slug from the name.
 * WHY:   The Organization/Member models carry no `createdAt` default and use
 *        string ids, so creation must stamp `id`/`createdAt` and reserve a
 *        unique slug — centralizing that here keeps the onboarding router (and
 *        any future bulk-provision path) a one-liner. Pure DB access only; the
 *        caller owns onboardingComplete flips and audit.
 * WHERE: Called by organization.createOrganization in
 *        src/trpc/routers/organization.ts; `db` is the caller's tx client.
 */

import { nanoid } from 'nanoid'
import type { DbClient } from '@/lib/config/prisma'

export interface CreateOrganizationResult {
  organizationId: string
  slug: string
}

/* Lowercase, strip non-alphanumerics to hyphens, collapse repeats, trim. */
export function slugifyOrganizationName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base.length > 0 ? base : 'org'
}

/* Appends a short random suffix until the slug is free. Runs against the
 * caller's `db` (the tx) so the check and the create stay consistent. */
export async function ensureUniqueOrganizationSlug(
  db: DbClient,
  baseSlug: string
): Promise<string> {
  let candidate = baseSlug
  /* Bounded retry — collisions are rare; the random suffix makes a loop of a
   * few iterations effectively impossible to exhaust. */
  for (let attempt = 0; attempt < 6; attempt++) {
    const existing = await db.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
    candidate = `${baseSlug}-${nanoid(6).toLowerCase()}`
  }
  /* Final fallback — a fully random slug that can't realistically collide. */
  return `${baseSlug}-${nanoid(10).toLowerCase()}`
}

/**
 * SOURCE OF TRUTH KEYWORDS: createOrganizationWithOwner
 *
 * WHAT:  Inserts the Organization and the creator's `owner` Member row.
 * WHY:   Owner membership is what unlocks every protected procedure (the
 *        onboarding gate keys off "has a membership"), so the two writes must
 *        commit together — the caller passes its tx client as `db`.
 * WHERE: Called by the onboarding mutation; returns ids for setActive.
 */
export async function createOrganizationWithOwner(
  db: DbClient,
  params: { userId: string; name: string; logo?: string | undefined }
): Promise<CreateOrganizationResult> {
  const organizationId = crypto.randomUUID()
  const slug = await ensureUniqueOrganizationSlug(db, slugifyOrganizationName(params.name))
  const now = new Date()

  await db.organization.create({
    data: {
      id: organizationId,
      name: params.name,
      slug,
      logo: params.logo ?? null,
      createdAt: now,
    },
  })

  await db.member.create({
    data: {
      id: crypto.randomUUID(),
      organizationId,
      userId: params.userId,
      role: 'owner',
      createdAt: now,
    },
  })

  return { organizationId, slug }
}
