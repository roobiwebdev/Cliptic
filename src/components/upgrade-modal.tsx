/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: UpgradeModal, UpgradeModalProps
 *
 * WHAT:  Branded "you hit a limit, upgrade?" dialog with a link to the billing
 *        route for the given organization.
 * WHY:   Copy flows through BRANDING. The billing destination is read from
 *        RESOURCES.billing.nav.href — that's the registry-level source of
 *        truth for the billing page location, so this modal cannot drift
 *        away from the sidebar/nav.
 * WHERE: Rendered by FeatureGate when atLimit fires; reads BRANDING from
 *        src/lib/config and resource metadata from src/lib/resources.
 */

import * as React from 'react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BRANDING } from '@/lib/config'
import { RESOURCES, type ResourceKey } from '@/lib/resources'

/**
 * SOURCE OF TRUTH KEYWORDS: UpgradeModalProps
 *
 * WHAT:  Controlled-dialog props plus the organizationId used in the billing
 *        link and an optional resource for tailored copy.
 * WHY:   organizationId is required so the CTA deep-links to the right org's
 *        billing page; resource swaps in the resource-specific body template.
 * WHERE: Passed by FeatureGate; consumed only by UpgradeModal.
 */
export interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  resource?: ResourceKey
}

export function UpgradeModal({
  open,
  onOpenChange,
  organizationId,
  resource,
}: UpgradeModalProps) {
  const resourceName = resource ? RESOURCES[resource].name : null
  const body = resourceName
    ? BRANDING.upgradeModal.bodyTemplate.replace('{resourceName}', resourceName)
    : BRANDING.upgradeModal.genericBody

  const billingHref = `${RESOURCES.billing.nav.href}?org=${organizationId}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{BRANDING.upgradeModal.title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {BRANDING.upgradeModal.secondaryCtaLabel}
          </Button>
          <Link href={billingHref}>
            <Button>{BRANDING.upgradeModal.primaryCtaLabel}</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
