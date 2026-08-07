/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: PaymentMethodRow, PaymentMethodRowProps, isCardExpired
 *
 * WHAT:  A single saved-card row — brand + last4, "Default" badge, an
 *        "Expired" badge when the card is past its expiry, and set-default /
 *        delete actions (delete reveals on hover).
 * WHY:   Reusable across the billing settings tab (and anywhere cards are
 *        listed). Actions are optional so a read-only context can render it
 *        without buttons. An expired default card is the most common cause of
 *        payment failure, so it must be visible at a glance.
 * WHERE: settings/billing BillingTab.
 */

import { CreditCard, Check, Loader2Icon, Trash2 } from 'lucide-react'

import type { PaymentMethodSummary } from '@/services/payment.service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * SOURCE OF TRUTH KEYWORDS: isCardExpired
 *
 * WHAT:  True when a card's expiry month/year is in the past (a card is valid
 *        through the last day of its expiry month).
 * WHERE: PaymentMethodRow badge + BillingTab's expired-default-card warning.
 */
export function isCardExpired(
  expMonth: number | null,
  expYear: number | null
): boolean {
  if (expMonth === null || expYear === null) return false
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  return expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)
}

export interface PaymentMethodRowProps {
  method: PaymentMethodSummary
  canManage: boolean
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
  settingDefault: boolean
  deleting: boolean
}

export function PaymentMethodRow({
  method,
  canManage,
  onSetDefault,
  onDelete,
  settingDefault,
  deleting,
}: PaymentMethodRowProps) {
  const brandName = method.brand?.toUpperCase() || 'CARD'
  const expired = isCardExpired(method.expMonth, method.expYear)
  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-background">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {brandName} **** {method.last4}
            </p>
            {method.isDefault ? (
              <Badge variant="secondary" className="text-xs">
                Default
              </Badge>
            ) : null}
            {expired ? (
              <Badge variant="destructive" className="text-xs">
                Expired
              </Badge>
            ) : null}
          </div>
          <p className={cn('text-xs', expired ? 'text-destructive' : 'text-muted-foreground')}>
            {expired ? 'Expired' : 'Expires'} {method.expMonth}/{method.expYear}
          </p>
        </div>
      </div>

      {canManage ? (
        <div className="flex items-center gap-2">
          {method.isDefault ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetDefault(method.id)}
              disabled={settingDefault}
              className="gap-2"
            >
              {settingDefault ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Setting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Set as Default
                </>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(method.id)}
            disabled={deleting}
            className="text-destructive transition-opacity hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
          >
            {deleting ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span className="sr-only">Delete payment method</span>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
