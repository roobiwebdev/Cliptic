/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: AcceptInvitation
 *
 * WHAT:  Client surface for /accept-invitation — shows invitation details and
 *        an Accept button (or a sign-in prompt when anonymous), then accepts
 *        via tRPC, sets the org active, and lands in the dashboard.
 * WHY:   Acceptance is a mutation behind a button (not a GET side effect), so a
 *        link prefetch can't silently join an org. The server mutation is the
 *        real authority on email-match/expiry; this just surfaces its errors.
 * WHERE: Rendered by src/app/(auth)/accept-invitation/page.tsx. Calls
 *        trpc.invitation.get / .accept and authClient.organization.setActive.
 */

import * as React from 'react'
import { Loader2Icon } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import { AUTH_ROUTES, ROUTES } from '@/lib/config'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isAccepting, setIsAccepting] = React.useState(false)

  React.useEffect(() => {
    let active = true
    void authClient.getSession().then((result) => {
      if (active) setSignedIn(Boolean(result.data?.user))
    })
    return () => {
      active = false
    }
  }, [])

  const invitationQuery = trpc.invitation.get.useQuery({ invitationId })
  const acceptMutation = trpc.invitation.accept.useMutation()

  const invitation = invitationQuery.data

  async function handleAccept() {
    setError(null)
    setIsAccepting(true)
    try {
      const result = await acceptMutation.mutateAsync({ invitationId })
      await authClient.organization.setActive({
        organizationId: result.organizationId,
        organizationSlug: result.slug,
      })
      window.location.assign(ROUTES.dashboard)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation.')
      setIsAccepting(false)
    }
  }

  if (invitationQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (!invitation || invitation.expired) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Invitation unavailable</CardTitle>
          <CardDescription>
            This invitation is invalid or has expired. Ask the organization owner to send a new
            one.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Join {invitation.organizationName}</CardTitle>
        <CardDescription>
          You were invited to join as <span className="font-medium">{invitation.role ?? 'member'}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        Invitation sent to {invitation.email}.
        {error ? (
          <p role="alert" className="mt-3 text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex-col gap-2">
        {signedIn === false ? (
          <>
            <p className="text-sm text-muted-foreground text-center">
              Sign in with {invitation.email} to accept.
            </p>
            <Button className="w-full" onClick={() => window.location.assign(AUTH_ROUTES.signIn)}>
              Go to sign in
            </Button>
          </>
        ) : (
          <Button className="w-full" onClick={handleAccept} disabled={isAccepting || signedIn === null}>
            {isAccepting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Accepting…
              </>
            ) : (
              'Accept invitation'
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
