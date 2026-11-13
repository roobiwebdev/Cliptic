/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ReferralsSection, affiliate
 *
 * WHAT:  Referrals settings body — your shareable link (copy button) and two
 *        counters: signups referred and organizations created by them.
 * WHY:   Minimal by design — attribution only, no money in this phase (the
 *        payout seam lives in referral.service.ts). Reuses SettingsSection.
 * WHERE: Rendered by settings/referrals page (env-flagged).
 */

import * as React from 'react'
import { Check, Copy, Users } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { SettingsSection } from '@/components/global/settings-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

export function ReferralsSection() {
  const { data, isLoading } = trpc.referral.getMyReferral.useQuery()
  const [copied, setCopied] = React.useState(false)

  async function copyLink() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.referralLink)
      setCopied(true)
      toast.success('Referral link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <SettingsSection
      title="Referrals"
      description="Share Cliptic and see who signed up through you"
      label="Your Link"
      labelDescription="Anyone who signs up through it is attributed to you."
    >
      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="referral-link">Referral link</Label>
            <div className="flex gap-2">
              <Input id="referral-link" readOnly value={data.referralLink} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">Copy referral link</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your code: <span className="font-mono font-medium">{data.code}</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <p className="text-xs">Signups</p>
              </div>
              <p className="mt-1 text-2xl font-semibold">{data.signups}</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <p className="text-xs">Organizations</p>
              </div>
              <p className="mt-1 text-2xl font-semibold">{data.organizations}</p>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
