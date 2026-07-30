/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: SettingsSection, SettingsSectionProps
 *
 * WHAT:  A settings section — SectionHeader, a separator, then a two-column
 *        grid: a left label/description column and a right content column
 *        (capped at max-w-md).
 * WHY:   This exact layout repeats for every settings section (subscription,
 *        payment methods, organization, …). Extracting it keeps each section a
 *        one-liner and the spacing/columns consistent.
 * WHERE: settings/billing, settings/organization, etc.
 */

import * as React from 'react'

import { SectionHeader } from '@/components/global/section-header'
import { Separator } from '@/components/ui/separator'

export interface SettingsSectionProps {
  title: string
  description?: string
  label: string
  labelDescription?: string
  children: React.ReactNode
}

export function SettingsSection({
  title,
  description,
  label,
  labelDescription,
  children,
}: SettingsSectionProps) {
  return (
    <div className="space-y-6">
      <SectionHeader title={title} {...(description ? { description } : {})} />
      <Separator />
      <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">{label}</h4>
          {labelDescription ? (
            <p className="text-sm text-muted-foreground">{labelDescription}</p>
          ) : null}
        </div>
        <div className="max-w-md">{children}</div>
      </div>
    </div>
  )
}
