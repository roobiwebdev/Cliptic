/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import 'server-only'

/**
 * SOURCE OF TRUTH KEYWORDS: resolvePortalAdmin, ensurePortalOwnerOrganization,
 *   isPortalMember, listAllOrganizations, listAllUsers, getPortalOverview,
 *   listPlatformActivity, PortalOrganizationRow, PortalUserRow, PortalOverview
 *
 * WHAT:  Platform-admin (portal) data access — resolves/bootstraps the operator,
 *        and reads cross-tenant data (orgs, users, overview, activity) for the
 *        /portal console.
 * WHY:   Portal access spans ALL organizations (not one tenant), so it can't
 *        use the org-scoped protectedProcedure. Admin status is: the configured
 *        owner email OR membership in a portal org. The owner is auto-provisioned
 *        on first access (a dedicated org flagged isPortalOrganization → the
 *        unlimited `portal` tier via getOrganizationTier) so there's no manual
 *        DB seeding. Pure DB + config access.
 * WHERE: Called by src/trpc/routers/portal.ts (portal-admin gated) and the
 *        /portal layout (auto-provision + gate).
 */

import { prisma } from '@/lib/config/prisma'
import { isPortalOwnerEmail, isPortalEnabled } from '@/lib/config/portal'
import { getPlatformActivityLogs } from '@/services/activity-log.service'
import { ensureUniqueOrganizationSlug } from '@/services/organization.service'

/**
 * SOURCE OF TRUTH KEYWORDS: isPortalMember
 *
 * WHAT:  True when the user is a member of any portal organization.
 * WHERE: Portal-admin resolution.
 */
export async function isPortalMember(userId: string): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: { userId, organization: { isPortalOrganization: true } },
    select: { id: true },
  })
  return member !== null
}

/**
 * SOURCE OF TRUTH KEYWORDS: resolvePortalAdmin
 *
 * WHAT:  True when the portal is enabled AND the user is either the configured
 *        owner email or a member of a portal org.
 * WHERE: portalProcedure gate + portal.getAccess.
 */
export async function resolvePortalAdmin(user: { id: string; email: string }): Promise<boolean> {
  if (!isPortalEnabled()) return false
  if (isPortalOwnerEmail(user.email)) return true
  return isPortalMember(user.id)
}

/**
 * SOURCE OF TRUTH KEYWORDS: ensurePortalOwnerOrganization
 *
 * WHAT:  For the configured owner email, ensures a portal organization exists
 *        (creating it + the owner membership on first access). No-op for anyone
 *        else. Returns the portal org id, or null when not applicable.
 * WHY:   Bootstraps the first platform admin from a single env var — the org is
 *        flagged isPortalOrganization so getOrganizationTier grants the
 *        unlimited portal tier.
 * WHERE: Called by the /portal layout before rendering.
 */
export async function ensurePortalOwnerOrganization(user: {
  id: string
  email: string
  name: string
}): Promise<string | null> {
  if (!isPortalEnabled() || !isPortalOwnerEmail(user.email)) return null

  const existing = await prisma.member.findFirst({
    where: { userId: user.id, organization: { isPortalOrganization: true } },
    select: { organizationId: true },
  })
  if (existing) return existing.organizationId

  const organizationId = crypto.randomUUID()
  const slug = await ensureUniqueOrganizationSlug(prisma, 'platform')
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.organization.create({
      data: {
        id: organizationId,
        name: `${user.name || 'Platform'} — Portal`,
        slug,
        createdAt: now,
        isPortalOrganization: true,
      },
    })
    await tx.member.create({
      data: {
        id: crypto.randomUUID(),
        organizationId,
        userId: user.id,
        role: 'owner',
        createdAt: now,
      },
    })
    await tx.user.update({ where: { id: user.id }, data: { onboardingComplete: true } })
  })

  return organizationId
}

export interface PortalOrganizationRow {
  id: string
  name: string
  slug: string
  createdAt: Date
  isPortalOrganization: boolean
  memberCount: number
  plan: string | null
  subscriptionStatus: string | null
}

/**
 * SOURCE OF TRUTH KEYWORDS: listAllOrganizations
 *
 * WHAT:  Every organization with member count + newest subscription plan/status.
 * WHERE: portal.listOrganizations.
 */
export async function listAllOrganizations(
  skip: number,
  take: number
): Promise<{ items: PortalOrganizationRow[]; total: number }> {
  const [orgs, total] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        isPortalOrganization: true,
        _count: { select: { members: true } },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { plan: true, status: true },
        },
      },
    }),
    prisma.organization.count(),
  ])

  return {
    items: orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt,
      isPortalOrganization: org.isPortalOrganization,
      memberCount: org._count.members,
      plan: org.subscriptions[0]?.plan ?? null,
      subscriptionStatus: org.subscriptions[0]?.status ?? null,
    })),
    total,
  }
}

export interface PortalUserRow {
  id: string
  name: string
  email: string
  createdAt: Date
  banned: boolean
  emailVerified: boolean
}

/**
 * SOURCE OF TRUTH KEYWORDS: listAllUsers
 *
 * WHAT:  Every user (display-safe fields only).
 * WHERE: portal.listUsers.
 */
export async function listAllUsers(
  skip: number,
  take: number
): Promise<{ items: PortalUserRow[]; total: number }> {
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        banned: true,
        emailVerified: true,
      },
    }),
    prisma.user.count(),
  ])

  return {
    items: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      banned: u.banned ?? false,
      emailVerified: u.emailVerified,
    })),
    total,
  }
}

export interface PortalOverview {
  totalOrganizations: number
  totalUsers: number
  activeSubscriptions: number
}

/**
 * SOURCE OF TRUTH KEYWORDS: getPortalOverview
 *
 * WHAT:  Headline platform counts for the portal home.
 * WHERE: portal.getOverview.
 */
export async function getPortalOverview(): Promise<PortalOverview> {
  const [totalOrganizations, totalUsers, activeSubscriptions] = await Promise.all([
    prisma.organization.count({ where: { isPortalOrganization: false } }),
    prisma.user.count(),
    prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
  ])
  return { totalOrganizations, totalUsers, activeSubscriptions }
}

/**
 * SOURCE OF TRUTH KEYWORDS: listPlatformActivity
 *
 * WHAT:  Platform-wide audit log page (all orgs), via the safe-select boundary.
 * WHERE: portal.listActivity.
 */
export async function listPlatformActivity(skip: number, take: number) {
  return getPlatformActivityLogs(skip, take)
}
