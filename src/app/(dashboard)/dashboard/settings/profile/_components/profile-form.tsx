/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ProfileForm
 *
 * WHAT:  Edit the signed-in user's display name + avatar URL (email read-only).
 * WHY:   Writes through Better Auth's updateUser (keeps the session in sync),
 *        then invalidates user.getProfile so the sidebar reflects the change.
 * WHERE: Rendered by the account settings page.
 */

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { authClient } from '@/lib/better-auth/auth-client'
import { trpc } from '@/trpc/react-provider'
import { updateProfileSchema, type UpdateProfileValues } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

export function ProfileForm() {
  const utils = trpc.useUtils()
  const profileQuery = trpc.user.getProfile.useQuery(undefined, { staleTime: 5 * 60 * 1000 })
  const [saving, setSaving] = React.useState(false)

  const form = useForm<UpdateProfileValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: '', image: '' },
  })

  const profile = profileQuery.data
  React.useEffect(() => {
    if (profile) form.reset({ name: profile.name, image: profile.image ?? '' })
  }, [profile, form])

  async function onSubmit(values: UpdateProfileValues) {
    setSaving(true)
    const { error } = await authClient.updateUser({
      name: values.name,
      image: values.image && values.image.trim() ? values.image.trim() : null,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message ?? 'Could not save your profile.')
      return
    }
    await utils.user.getProfile.invalidate()
    toast.success('Profile updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name and avatar shown across the app.</CardDescription>
      </CardHeader>
      <CardContent>
        {profileQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email ?? ''} disabled readOnly />
                <p className="text-muted-foreground text-xs">Email can&apos;t be changed here.</p>
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avatar URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Optional. Leave blank to remove.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-fit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
