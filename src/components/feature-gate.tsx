/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: FeatureGate, FeatureGateProps, useFeatureGate,
 *   FeatureGateData, FeatureGatesData
 *
 * WHAT:  Client component + hook that wraps a trigger element and surfaces
 *        the upgrade modal when the current organization is at-limit or the
 *        plan doesn't include the feature.
 * WHY:   Server enforcement is the source of truth; this is UX only — the
 *        default loading state is fail-closed so a fast click can't slip past.
 *        Works on any RESOURCES entry with `limit` or `flag` — `nav` is not
 *        required.
 * WHERE: Reads gates from trpc.usage.getFeatureGates.
 */

import * as React from 'react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { UpgradeModal } from '@/components/upgrade-modal'
import type { ResourceKey } from '@/lib/resources'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@/trpc/routers/_app'

/**
 * SOURCE OF TRUTH KEYWORDS: FeatureGatesData, FeatureGateData
 *
 * WHAT:  Client-side types mirroring the usage.getFeatureGates payload and
 *        one resource's gate entry.
 * WHY:   Derived from router output so adding a gate field server-side flows
 *        through to consumers without a hand-rolled DTO.
 * WHERE: Consumed by FeatureGate, useFeatureGate, and the feature-gate UI.
 */
export type FeatureGatesData =
  inferRouterOutputs<AppRouter>['usage']['getFeatureGates']

export type FeatureGateData = NonNullable<FeatureGatesData['gates'][ResourceKey]>

export interface FeatureGateProps {
  resource: ResourceKey
  children: React.ReactElement<{
    onClick?: (e: React.MouseEvent) => void
    disabled?: boolean
  }>
  onLimitReached?: () => void
  fallback?: React.ReactNode
  /**
   * Default is fail-closed (child rendered disabled until gate resolves) so a
   * fast click can't slip past the teaser. Server enforcement is unchanged
   * either way; this only affects UX during the loading window.
   */
  optimistic?: boolean
}

const FEATURE_GATES_QUERY_OPTIONS = {
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 30,
} as const

/**
 * SOURCE OF TRUTH KEYWORDS: useFeatureGate
 *
 * WHAT:  Hook returning one resource's gate snapshot, or null while loading or
 *        before the active org resolves.
 * WHY:   Caches at 5min staleTime — gates change rarely and over-fetching the
 *        gate map on every render is wasteful.
 * WHERE: Backs FeatureGate; can be used directly by UI that renders custom
 *        at-limit affordances.
 */
export function useFeatureGate(resource: ResourceKey): FeatureGateData | null {
  const organizationId = useActiveOrganizationId()
  const input = organizationId ? { organizationId } : undefined

  const { data } = trpc.usage.getFeatureGates.useQuery(
    input ?? { organizationId: '' },
    {
      enabled: input !== undefined,
      ...FEATURE_GATES_QUERY_OPTIONS,
    }
  )

  if (!data?.gates[resource]) return null
  return data.gates[resource]
}

/**
 * SOURCE OF TRUTH KEYWORDS: FeatureGate
 *
 * WHAT:  Wraps a single child element, intercepts onClick when at-limit, and
 *        opens the UpgradeModal (or invokes onLimitReached).
 * WHY:   Server still enforces — this is purely UX so the user gets the
 *        upgrade prompt instead of a tRPC error toast.
 * WHERE: Used wherever a create/upgrade-gated action exists in the UI.
 */
export function FeatureGate({
  resource,
  children,
  onLimitReached,
  fallback,
  optimistic = false,
}: FeatureGateProps) {
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false)
  const organizationId = useActiveOrganizationId()
  const gate = useFeatureGate(resource)

  const isLoading = organizationId !== undefined && gate === null && !optimistic

  if (isLoading) {
    if (fallback !== undefined) return <>{fallback}</>
    return React.cloneElement(children, { disabled: true })
  }

  const wrappedChild = React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      if (gate?.atLimit) {
        e.preventDefault()
        e.stopPropagation()
        if (onLimitReached) onLimitReached()
        else setShowUpgradeModal(true)
        return
      }
      if (children.props.onClick) children.props.onClick(e)
    },
  })

  return (
    <>
      {wrappedChild}
      {organizationId && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          organizationId={organizationId}
          resource={resource}
        />
      )}
    </>
  )
}

export default FeatureGate
