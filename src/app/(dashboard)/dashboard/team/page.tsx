/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: TeamPage
 *
 * WHAT:  /dashboard/team route — thin shell; TeamClient does the work.
 * WHERE: RESOURCES.member.nav.href.
 */

import type { Metadata } from 'next'

import { TeamClient } from './_components/team-client'

export const metadata: Metadata = {
  title: 'Team',
}

export default function TeamPage() {
  return <TeamClient />
}
