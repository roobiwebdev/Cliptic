/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ProfileSettingsPage
 *
 * WHAT:  /dashboard/settings/profile — the user's account settings: profile,
 *        password, and a danger zone to permanently delete the account.
 * WHERE: Linked from the sidebar user menu (NavUser → "Account").
 */

import type { Metadata } from 'next'

import { ContentLayout } from '@/components/global/page-header'
import { ProfileForm } from './_components/profile-form'
import { PasswordForm } from './_components/password-form'
import { DeleteAccount } from './_components/delete-account'

export const metadata: Metadata = {
  title: 'Account',
}

export default function ProfileSettingsPage() {
  return (
    <ContentLayout title="Account">
      <div className="flex max-w-2xl flex-col gap-6">
        <ProfileForm />
        <PasswordForm />
        <DeleteAccount />
      </div>
    </ContentLayout>
  )
}
