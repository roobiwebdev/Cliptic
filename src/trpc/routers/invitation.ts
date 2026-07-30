/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: invitationRouter
 *
 * WHAT:  Organization invitations — create (with seat enforcement), cancel,
 *        resend, and a public get for the accept page.
 * WHY:   A pending invitation consumes a `member` seat, but invitations are
 *        their own (non-limit) resource so the factory's auto limit-check /
 *        counter-bump don't apply. The create handler therefore enforces the
 *        seat cap with checkFeatureGate and bumps the `member` counter inside
 *        the tx (matching the forms.publish pattern in the docs); cancel
 *        releases the seat. Members are created on the accept page, not here,
 *        so the seat is counted once at invite time and never double-counted.
 * WHERE: Mounted as `invitation` in src/trpc/routers/_app. Emails via
 *        src/services/email.service; gate via src/lib/feature-gate.
 */

import { TRPCError } from '@trpc/server'
import { nanoid } from 'nanoid'

import { createTRPCRouter, createStructuredError } from '../init'
import { protectedProcedure, baseProcedure, authProcedure } from '../procedures'
import { permissions } from '@/lib/better-auth/permissions'
import {
  inviteMemberSchema,
  cancelInvitationSchema,
  resendInvitationSchema,
} from '@/lib/types'
import { z } from 'zod'
import { checkFeatureGate } from '@/lib/feature-gate'
import { incrementUsage, decrementUsage } from '@/services/usage.service'
import { processRole } from '@/services/role.service'
import { sendOrganizationInvitationEmail } from '@/services/email.service'
import { APP_URL } from '@/lib/config'
import { ERROR_CODES } from '@/lib/errors'

const INVITATION_TTL_DAYS = 7

function invitationExpiry(): Date {
  const expires = new Date()
  expires.setDate(expires.getDate() + INVITATION_TTL_DAYS)
  return expires
}

function acceptUrl(invitationId: string): string {
  return `${APP_URL}/accept-invitation?id=${invitationId}`
}

export const invitationRouter = createTRPCRouter({
  /* Public — the accept page reads invitation details before the user signs
   * in, so this can't require org membership. Returns only display-safe fields. */
  get: baseProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { id: input.invitationId },
        include: { organization: { select: { name: true } } },
      })
      if (!invitation) return null
      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        organizationName: invitation.organization.name,
        expiresAt: invitation.expiresAt,
        expired: invitation.expiresAt.getTime() < Date.now(),
      }
    }),

  create: protectedProcedure({ requirePermission: permissions.INVITATION_CREATE })
    .input(inviteMemberSchema)
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase()
      if (email === ctx.user.email.toLowerCase()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are already in this organization' })
      }

      /* Reject if the email already belongs to a member or a pending invite. */
      const existingUser = await ctx.db.user.findUnique({ where: { email }, select: { id: true } })
      if (existingUser) {
        const existingMember = await ctx.db.member.findFirst({
          where: { organizationId: input.organizationId, userId: existingUser.id },
          select: { id: true },
        })
        if (existingMember) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'That person is already a member' })
        }
      }
      const existingInvite = await ctx.db.invitation.findFirst({
        where: { organizationId: input.organizationId, email },
        select: { id: true },
      })
      if (existingInvite) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'An invitation is already pending for that email' })
      }

      /* Seat cap — invitation consumes a `member` seat (see file header). */
      const gate = await checkFeatureGate(input.organizationId, 'member', 1)
      if (!gate.allowed) {
        throw createStructuredError('FORBIDDEN', gate.reason ?? 'Seat limit reached', {
          errorCode: ERROR_CODES.USAGE_LIMIT_REACHED,
          resource: 'member',
          limit: gate.limit ?? 0,
          current: gate.currentUsage ?? 0,
          upgradeRequired: true,
          message: gate.reason ?? 'You have reached your plan seat limit',
        })
      }

      /* Decode the encoded role (creating the role row if needed) so the
       * invitation stores a concrete role name the accepted member resolves to. */
      const role = await processRole(ctx.db, input.organizationId, input.role)

      const invitation = await ctx.db.invitation.create({
        data: {
          id: nanoid(),
          organizationId: input.organizationId,
          email,
          role,
          inviterId: ctx.user.id,
          expiresAt: invitationExpiry(),
        },
      })

      await incrementUsage(input.organizationId, 'member', 1, ctx.db)

      const invitationLink = acceptUrl(invitation.id)
      await sendOrganizationInvitationEmail({
        to: email,
        inviterName: ctx.user.name,
        organizationName: ctx.organization.name,
        invitationLink,
        role,
      })

      return { invitation, invitationLink }
    }),

  /* Accept — runs on authProcedure because the user is NOT yet a member of the
   * target org (protectedProcedure would reject them). Creates the member row
   * and deletes the invitation in one tx; the seat was already counted at
   * invite time, so acceptance is counter-neutral. Returns ids for setActive. */
  accept: authProcedure
    .input(z.object({ invitationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { id: input.invitationId },
        include: { organization: { select: { id: true, slug: true } } },
      })
      if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' })
      if (invitation.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invitation has expired' })
      }
      if (invitation.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `This invitation was sent to ${invitation.email}`,
        })
      }

      const organizationId = invitation.organization.id

      const alreadyMember = await ctx.prisma.member.findFirst({
        where: { organizationId, userId: ctx.user.id },
        select: { id: true },
      })
      if (alreadyMember) {
        /* Idempotent — clean up the dangling invite and proceed. */
        await ctx.prisma.invitation.delete({ where: { id: invitation.id } }).catch(() => {})
        return { organizationId, slug: invitation.organization.slug }
      }

      await ctx.prisma.$transaction(async (tx) => {
        await tx.member.create({
          data: {
            id: crypto.randomUUID(),
            organizationId,
            userId: ctx.user.id,
            role: invitation.role ?? 'member',
            createdAt: new Date(),
          },
        })
        await tx.invitation.delete({ where: { id: invitation.id } })
      })

      return { organizationId, slug: invitation.organization.slug }
    }),

  cancel: protectedProcedure({ requirePermission: permissions.INVITATION_CANCEL })
    .input(cancelInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findFirst({
        where: { id: input.invitationId, organizationId: input.organizationId },
        select: { id: true },
      })
      if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' })

      const deleted = await ctx.db.invitation.delete({ where: { id: invitation.id } })
      /* Release the seat the pending invite was holding. */
      await decrementUsage(input.organizationId, 'member', 1, ctx.db)
      return deleted
    }),

  resend: protectedProcedure({
    requirePermission: permissions.INVITATION_CREATE,
    audit: { entity: 'invitation', action: 'resend' },
  })
    .input(resendInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findFirst({
        where: { id: input.invitationId, organizationId: input.organizationId },
      })
      if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' })

      const updated = await ctx.db.invitation.update({
        where: { id: invitation.id },
        data: { expiresAt: invitationExpiry() },
      })

      const invitationLink = acceptUrl(updated.id)
      await sendOrganizationInvitationEmail({
        to: updated.email,
        inviterName: ctx.user.name,
        organizationName: ctx.organization.name,
        invitationLink,
        role: updated.role ?? 'member',
      })

      return { invitation: updated, invitationLink }
    }),
})
