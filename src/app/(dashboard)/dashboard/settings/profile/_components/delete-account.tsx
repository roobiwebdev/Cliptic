/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: DeleteAccount
 *
 * WHAT:  Danger-zone card to permanently delete the account (with a confirm
 *        dialog), then sign out and bounce to sign-up.
 * WHY:   Calls user.deleteAccount (server transaction wipes the user + owned
 *        orgs + cascaded data); the confirm dialog guards the irreversible act.
 * WHERE: Rendered by the account settings page.
 */

import * as React from 'react'
import { AlertTriangle, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import { AUTH_ROUTES } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function DeleteAccount() {
  const deleteAccount = trpc.user.deleteAccount.useMutation()
  const [busy, setBusy] = React.useState(false)

  async function onConfirm() {
    setBusy(true)
    try {
      await deleteAccount.mutateAsync()
      await authClient.signOut()
      window.location.assign(AUTH_ROUTES.signUp)
    } catch (err) {
      setBusy(false)
      toast.error(err instanceof Error ? err.message : 'Could not delete your account.')
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Permanently delete your account and every organization you own, along with all their data
          — clips, jobs, members, and billing. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <AlertTriangle className="size-4" />
            Delete account
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes your account and every organization you own — including all
                clips, jobs, members, and billing records. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
