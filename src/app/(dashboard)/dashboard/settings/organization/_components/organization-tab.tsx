/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: OrganizationTab
 *
 * WHAT:  Org settings form — rename the organization and set a logo URL.
 * WHY:   RHF + the shared updateOrganizationSettingsSchema; reads current
 *        values from organizationSettings.get and writes via .update, then
 *        invalidates so the sidebar/switcher reflect the new name.
 * WHERE: Rendered by settings/organization page.
 */

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import {
  updateOrganizationSettingsSchema,
  type UpdateOrganizationSettingsValues,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'

export function OrganizationTab() {
  const organizationId = useActiveOrganizationId()
  const utils = trpc.useUtils()
  const enabled = organizationId !== undefined
  const orgId = organizationId ?? ''

  const settingsQuery = trpc.organizationSettings.get.useQuery({ organizationId: orgId }, { enabled })
  const update = trpc.organizationSettings.update.useMutation()
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const form = useForm<UpdateOrganizationSettingsValues>({
    resolver: zodResolver(updateOrganizationSettingsSchema),
    defaultValues: { organizationId: orgId, name: '', logo: '' },
  })

  /* Seed the form once the current settings load. */
  const settings = settingsQuery.data
  React.useEffect(() => {
    if (settings) {
      form.reset({
        organizationId: settings.id,
        name: settings.name,
        logo: settings.logo ?? '',
      })
    }
  }, [settings, form])

  async function onSubmit(values: UpdateOrganizationSettingsValues) {
    setError(null)
    setSaved(false)
    try {
      await update.mutateAsync(values)
      await Promise.all([
        utils.organizationSettings.get.invalidate({ organizationId: orgId }),
        utils.organization.getUserOrganizations.invalidate(),
        utils.organization.getActiveOrganization.invalidate(),
      ])
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings.')
    }
  }

  if (!organizationId) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent>
        {settingsQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-4" noValidate>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logo URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Optional. Leave blank to remove.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {saved ? <p className="text-sm text-muted-foreground">Saved.</p> : null}
              <Button type="submit" className="w-fit" disabled={update.isPending}>
                {update.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  )
}
