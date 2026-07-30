/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: SettingsIndexPage
 *
 * WHAT:  /dashboard/settings — redirects to the first settings sub-page.
 * WHY:   Settings has no landing of its own; billing is the default tab.
 * WHERE: Sub-pages: organization, billing, audit-logs, profile.
 */

import { redirect } from 'next/navigation'

export default function SettingsIndexPage() {
  redirect('/dashboard/settings/billing')
}
