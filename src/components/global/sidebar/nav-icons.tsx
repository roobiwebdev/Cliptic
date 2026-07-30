/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: NAV_ICONS, getNavIcon, NavIconName
 *
 * WHAT:  Maps the `nav.icon` string on a RESOURCES entry to a lucide icon
 *        component, with a safe fallback.
 * WHY:   RESOURCES stores icons as plain strings (it must stay free of React
 *        imports). This is the single place those strings resolve to
 *        components, so adding a new nav icon means adding one map entry here.
 * WHERE: Used by src/components/global/sidebar/app-sidebar.tsx.
 */

import {
  BarChart3,
  Circle,
  CreditCard,
  Folder,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

/* Keyed by the exact strings used in RESOURCES[*].nav.icon. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  Folder,
  Users,
  BarChart: BarChart3,
  ScrollText,
  CreditCard,
  Settings,
  LayoutDashboard,
}

export type NavIconName = keyof typeof NAV_ICONS

/**
 * SOURCE OF TRUTH KEYWORDS: getNavIcon
 *
 * WHAT:  Resolves an icon string to a component, falling back to a neutral
 *        circle so an unmapped name never crashes the sidebar.
 * WHERE: Called by app-sidebar.tsx when rendering each nav item.
 */
export function getNavIcon(name: string): LucideIcon {
  return NAV_ICONS[name] ?? Circle
}
