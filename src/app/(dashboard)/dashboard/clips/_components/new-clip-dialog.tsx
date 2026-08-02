/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: NewClipDialog
 *
 * WHAT:  The "New clip" trigger + dialog — paste a video URL or upload a file
 *        (presigned PUT straight to R2 with a progress bar), then enqueue a job.
 * WHY:   FeatureGate wraps the trigger so an at-limit org gets the upgrade modal
 *        instead of a failed request; uploads bypass the web server entirely.
 * WHERE: Rendered in the clips page header and empty state.
 */

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Link2, Upload, Loader2, Sparkles, Scissors } from 'lucide-react'

import { trpc } from '@/trpc/react-provider'
import { cn, parseClock } from '@/lib/utils'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { FeatureGate } from '@/components/feature-gate'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const MAX_UPLOAD_MB = 1024

const linkFormSchema = z.object({
  url: z.string().url('Enter a valid video URL'),
})

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.'
}

/* Presigned PUT to R2 via XHR so we get an upload-progress percentage. The
 * Content-Type MUST match the one the URL was signed with or R2 rejects it. */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}).`))
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
    xhr.send(file)
  })
}

export function NewClipDialog() {
  const organizationId = useActiveOrganizationId()
  const router = useRouter()
  const utils = trpc.useUtils()

  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<'link' | 'upload'>('link')
  const [mode, setMode] = React.useState<'AUTO' | 'MANUAL'>('AUTO')
  const [startStr, setStartStr] = React.useState('0:00')
  const [endStr, setEndStr] = React.useState('0:30')
  const [manualTitle, setManualTitle] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [uploadPct, setUploadPct] = React.useState<number | null>(null)

  /* Parse + validate the MANUAL range from the MM:SS boxes, or null (with a toast). */
  function manualRangeOrError(): { startSec: number; endSec: number; title?: string } | null {
    const s = parseClock(startStr)
    const e = parseClock(endStr)
    if (s === null || e === null) {
      toast.error('Enter valid times as M:SS (e.g. 3:05).')
      return null
    }
    if (e - s < 1) {
      toast.error('The end time must be at least 1 second after the start.')
      return null
    }
    return { startSec: s, endSec: e, ...(manualTitle.trim() ? { title: manualTitle.trim() } : {}) }
  }

  const linkForm = useForm<z.infer<typeof linkFormSchema>>({
    resolver: zodResolver(linkFormSchema),
    defaultValues: { url: '' },
  })

  const create = trpc.clips.create.useMutation()
  const createUploadUrl = trpc.clips.createUploadUrl.useMutation()

  const busy = create.isPending || createUploadUrl.isPending || uploadPct !== null

  function finish(jobId: string) {
    setOpen(false)
    setFile(null)
    setUploadPct(null)
    linkForm.reset()
    void utils.clips.list.invalidate()
    toast.success('Clip job started')
    router.push(`/dashboard/clips/${jobId}`)
  }

  async function submitLink(values: z.infer<typeof linkFormSchema>) {
    if (!organizationId) return
    let manualRange: { startSec: number; endSec: number; title?: string } | undefined
    if (mode === 'MANUAL') {
      const r = manualRangeOrError()
      if (!r) return
      manualRange = r
    }
    try {
      const job = await create.mutateAsync({
        organizationId,
        sourceType: 'YOUTUBE',
        url: values.url,
        mode,
        ...(manualRange ? { manualRange } : {}),
      })
      finish(job.id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function submitUpload() {
    if (!organizationId || !file) return
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`That file is too large (max ${MAX_UPLOAD_MB} MB).`)
      return
    }
    let manualRange: { startSec: number; endSec: number; title?: string } | undefined
    if (mode === 'MANUAL') {
      const r = manualRangeOrError()
      if (!r) return
      manualRange = r
    }
    const contentType = file.type || 'video/mp4'
    try {
      const { uploadUrl, uploadKey } = await createUploadUrl.mutateAsync({
        organizationId,
        filename: file.name,
        contentType,
      })
      setUploadPct(0)
      await putWithProgress(uploadUrl, file, contentType, setUploadPct)
      const job = await create.mutateAsync({
        organizationId,
        sourceType: 'UPLOAD',
        uploadKey,
        mode,
        ...(manualRange ? { manualRange } : {}),
      })
      finish(job.id)
    } catch (err) {
      setUploadPct(null)
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <FeatureGate resource="clips">
        <Button onClick={() => setOpen(true)} disabled={!organizationId}>
          <Plus />
          New clip
        </Button>
      </FeatureGate>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New clip job</DialogTitle>
            <DialogDescription>
              {mode === 'AUTO'
                ? "Paste a video link or upload a file — we'll find the best short clips."
                : "Set the exact start/end and paste a link (or upload) — we'll cut just that slice."}
            </DialogDescription>
          </DialogHeader>

          {/* First-class choice: let the AI pick, or cut exact ranges yourself. */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'AUTO', icon: Sparkles, label: 'AI auto-detect', hint: 'We find the viral moments' },
                { key: 'MANUAL', icon: Scissors, label: 'Manual', hint: 'Pick exact clips yourself' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                disabled={busy}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                  mode === opt.key
                    ? 'border-foreground/20 bg-foreground/5 ring-foreground/15 ring-1'
                    : 'border-border hover:bg-foreground/[0.03]'
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <opt.icon className="size-4" />
                  {opt.label}
                </span>
                <span className="text-muted-foreground text-xs">{opt.hint}</span>
              </button>
            ))}
          </div>

          {/* MANUAL: the exact slice to cut — the worker downloads only this part. */}
          {mode === 'MANUAL' ? (
            <div className="border-border space-y-3 rounded-xl border p-3">
              <p className="text-muted-foreground text-xs">
                Enter the exact part to clip — we&apos;ll cut just that slice.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="clip-start" className="text-xs">
                    Start (M:SS)
                  </Label>
                  <Input
                    id="clip-start"
                    value={startStr}
                    inputMode="numeric"
                    placeholder="0:00"
                    disabled={busy}
                    onChange={(e) => setStartStr(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clip-end" className="text-xs">
                    End (M:SS)
                  </Label>
                  <Input
                    id="clip-end"
                    value={endStr}
                    inputMode="numeric"
                    placeholder="0:30"
                    disabled={busy}
                    onChange={(e) => setEndStr(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clip-title" className="text-xs">
                  Title <span className="text-muted-foreground">(optional — AI fills it in)</span>
                </Label>
                <Input
                  id="clip-title"
                  value={manualTitle}
                  placeholder="A short, catchy title"
                  disabled={busy}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <Tabs value={tab} onValueChange={(v) => setTab(v === 'upload' ? 'upload' : 'link')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link">
                <Link2 />
                Paste link
              </TabsTrigger>
              <TabsTrigger value="upload">
                <Upload />
                Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="pt-2">
              <Form {...linkForm}>
                <form onSubmit={linkForm.handleSubmit(submitLink)} className="space-y-4">
                  <FormField
                    control={linkForm.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Video URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://youtu.be/…" autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={busy}>
                      {create.isPending ? <Loader2 className="animate-spin" /> : null}
                      {mode === 'MANUAL' ? 'Cut clip' : 'Generate clips'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="upload" className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="clip-upload">Video file</Label>
                <Input
                  id="clip-upload"
                  type="file"
                  accept="video/*"
                  disabled={busy}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <p className="text-muted-foreground text-sm">
                    {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                ) : null}
              </div>

              {uploadPct !== null ? (
                <div className="space-y-1">
                  <Progress value={uploadPct} />
                  <p className="text-muted-foreground text-xs">Uploading… {uploadPct}%</p>
                </div>
              ) : null}

              <DialogFooter>
                <Button onClick={submitUpload} disabled={busy || !file}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {mode === 'MANUAL' ? 'Upload & cut' : 'Upload & generate'}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
