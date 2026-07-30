/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: createOrganizationSchema, CreateOrganizationValues
 *
 * WHAT:  Zod schema + inferred type for the create-organization input used by
 *        the onboarding flow and the organization.createOrganization router.
 * WHY:   Per CLAUDE.md, every input surface validates against a shared zod
 *        schema living under lib/types — client form and server handler infer
 *        from the SAME object so they can't drift.
 * WHERE: Imported by the onboarding flow (src/app/(onboarding)/...) and
 *        src/trpc/routers/organization.ts. Re-exported via src/lib/types.
 */

import { z } from 'zod'

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters.')
    .max(120, 'Organization name is too long.'),
  /* Optional logo URL — the onboarding form doesn't collect it yet, but the
   * service and schema accept it so a logo step can be added without churn. */
  logo: z.string().trim().url('Enter a valid URL.').optional(),
})

export type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>

/**
 * SOURCE OF TRUTH KEYWORDS: updateOrganizationSettingsSchema,
 *   UpdateOrganizationSettingsValues
 *
 * WHAT:  Input for organizationSettings.update — rename + optional logo URL
 *        (empty string clears the logo).
 * WHERE: Used by src/trpc/routers/organization-settings.ts and the org
 *        settings form.
 */
export const updateOrganizationSettingsSchema = z.object({
  organizationId: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters.')
    .max(120, 'Organization name is too long.'),
  logo: z
    .union([z.string().trim().url('Enter a valid URL.'), z.literal('')])
    .optional(),
})

export type UpdateOrganizationSettingsValues = z.infer<typeof updateOrganizationSettingsSchema>
