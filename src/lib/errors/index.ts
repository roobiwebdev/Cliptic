/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ERROR_CODES, ErrorCode, StructuredError,
 *   StructuredErrorCause
 *
 * WHAT:  Discriminated union of every structured error the server may attach
 *        to a tRPC error's `cause`, keyed by ERROR_CODES.
 * WHY:   Clients narrow on `errorCode` to render specific UI (upgrade modal,
 *        invitation accept screen, 2FA prompt) instead of generic error text.
 * WHERE: Codes thrown via createStructuredError in src/trpc/init.ts; consumed
 *        by the tRPC client error handler and UI gate components.
 */

import type { ResourceKey } from '@/lib/resources'

/**
 * SOURCE OF TRUTH KEYWORDS: ERROR_CODES, ErrorCode
 *
 * WHAT:  String enum of every structured error code the server emits.
 * WHY:   Frozen at the type level so adding a new variant forces an exhaustive
 *        check on every switch consuming StructuredErrorCause.
 * WHERE: Used everywhere a StructuredError is created or matched.
 */
export const ERROR_CODES = {
  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',
  NOT_ORGANIZATION_MEMBER: 'NOT_ORGANIZATION_MEMBER',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
  USAGE_LIMIT_REACHED: 'USAGE_LIMIT_REACHED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  RATE_LIMITED: 'RATE_LIMITED',
  PENDING_INVITATION: 'PENDING_INVITATION',
  INVITATION_NOT_FOUND: 'INVITATION_NOT_FOUND',
  INVITATION_ALREADY_USED: 'INVITATION_ALREADY_USED',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * SOURCE OF TRUTH KEYWORDS: StructuredErrorCause, StructuredError
 *
 * WHAT:  Discriminated union of every structured error payload.
 * WHY:   `errorCode` narrows the union in switch statements, giving callers
 *        type-safe access to error-specific fields (resource, retryAfter, etc.).
 * WHERE: Set as `cause` on TRPCError via createStructuredError; surfaced to
 *        clients through the tRPC errorFormatter.
 */
/* Discriminated union — `errorCode` narrows in switch statements. */
export type StructuredErrorCause =
  | {
      errorCode: typeof ERROR_CODES.ONBOARDING_INCOMPLETE
      requiredStep: 'onboarding'
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.NOT_ORGANIZATION_MEMBER
      organizationId: string
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.INSUFFICIENT_PERMISSIONS
      required: string[]
      current: string
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.VALIDATION_ERROR
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.FEATURE_NOT_AVAILABLE
      resource: ResourceKey
      currentPlan: string
      upgradeRequired: true
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.USAGE_LIMIT_REACHED
      resource: string
      limit: number
      current: number
      upgradeRequired: true
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.INSUFFICIENT_CREDITS
      resource: ResourceKey
      required: number
      available: number
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.RATE_LIMITED
      limit: number
      remaining: number
      resetAt: number
      retryAfter: number
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.PENDING_INVITATION
      invitationId: string
      organizationId: string
      organizationName: string
      role: string
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.INVITATION_NOT_FOUND
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.INVITATION_ALREADY_USED
      status: string
      message: string
    }
  | {
      errorCode: typeof ERROR_CODES.INVITATION_EXPIRED
      message: string
    }

export type StructuredError = StructuredErrorCause
