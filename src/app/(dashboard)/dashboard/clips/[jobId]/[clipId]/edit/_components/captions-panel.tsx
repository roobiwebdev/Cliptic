/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: CaptionsPanel, caption styling, karaoke, editable
 *   captions, burned captions UI
 *
 * WHAT:  The Editor's captions controls — enable toggle, style (font, size,
 *        color + karaoke highlight, position, uppercase, emoji) and an editable
 *        list of caption lines seeded from the clip's transcript.
 * WHY:   Every control maps to ONE field on spec.captions; the server Render
 *        Engine burns exactly this. Kept presentational — clip-editor owns the
 *        spec, the seed fetch, and autosave.
 * WHERE: Rendered by clip-editor.tsx.
 */

'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Captions, Copy, Loader2 } from 'lucide-react'
import { cn, formatClock, formatCaptionsForCopy } from '@/lib/utils'
import { CAPTION_FONTS, type CaptionFont, type CaptionStyle, type CaptionsSpec } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CaptionsPanelProps {
  captions: CaptionsSpec | undefined
  hasTranscript: boolean
  seeding: boolean
  /** An on-demand clip transcription is running (first toggle-on for a manual clip). */
  transcribing: boolean
  onToggle: (enabled: boolean) => void
  onStyleChange: (patch: Partial<CaptionStyle>) => void
  onSegmentText: (index: number, text: string) => void
  onReset: () => void
}

const POSITIONS = ['top', 'center', 'bottom'] as const

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.toLowerCase()}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="size-8 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <span className="text-muted-foreground text-xs uppercase">{value}</span>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export function CaptionsPanel({
  captions,
  hasTranscript,
  seeding,
  transcribing,
  onToggle,
  onStyleChange,
  onSegmentText,
  onReset,
}: CaptionsPanelProps) {
  const enabled = captions?.enabled ?? false
  const style = captions?.style
  const segments = captions?.segments ?? []
  /* UI preference only (not part of the edit spec): drives BOTH the visible
   * timestamps and whether Copy includes them. */
  const [showTimestamps, setShowTimestamps] = React.useState(true)

  const copyAll = async (): Promise<void> => {
    if (segments.length === 0) return
    try {
      await navigator.clipboard.writeText(formatCaptionsForCopy(segments, showTimestamps))
      toast.success(showTimestamps ? 'Captions copied with timestamps.' : 'Captions copied.')
    } catch {
      toast.error('Could not copy to the clipboard.')
    }
  }

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Captions className="size-4" />
            Captions
          </span>
          <Switch
            checked={enabled}
            disabled={seeding || transcribing}
            onCheckedChange={onToggle}
            aria-label="Burn captions"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasTranscript && !enabled && !transcribing ? (
          <p className="text-muted-foreground text-xs">
            This clip hasn&apos;t been transcribed yet. Turn captions on and we&apos;ll
            transcribe it automatically — any language, word for word.
          </p>
        ) : null}

        {transcribing ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" />
            Transcribing this clip — exact words, auto-detected language…
          </div>
        ) : seeding ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" />
            Loading captions from the transcript…
          </div>
        ) : null}

        {enabled && style ? (
          <>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Font</p>
              <Select
                value={style.fontFamily}
                onValueChange={(v) => {
                  const font: CaptionFont | undefined = CAPTION_FONTS.find((f) => f === v)
                  if (font) onStyleChange({ fontFamily: font })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPTION_FONTS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Size</p>
              <input
                type="range"
                min={3}
                max={16}
                value={style.fontSizePct}
                onChange={(e) => onStyleChange({ fontSizePct: Number(e.target.value) })}
                className="accent-primary w-full"
                aria-label="Caption size"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Text" value={style.color} onChange={(c) => onStyleChange({ color: c })} />
              <ColorField
                label="Highlight"
                value={style.highlightColor}
                onChange={(c) => onStyleChange({ highlightColor: c })}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs">Position</p>
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onStyleChange({ position: p })}
                    className={cn(
                      'rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors',
                      style.position === p
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <ToggleRow
                label="Karaoke word highlight"
                checked={style.karaoke}
                onChange={(v) => onStyleChange({ karaoke: v })}
              />
              <ToggleRow
                label="Uppercase"
                checked={style.uppercase}
                onChange={(v) => onStyleChange({ uppercase: v })}
              />
              <ToggleRow label="Emoji" checked={style.emoji} onChange={(v) => onStyleChange({ emoji: v })} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">Caption text</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    onClick={() => void copyAll()}
                    disabled={segments.length === 0}
                    aria-label="Copy all captions"
                  >
                    <Copy className="size-3" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={onReset}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              {/* One toggle drives both what's SHOWN and what Copy includes. */}
              <ToggleRow
                label="Timestamps"
                checked={showTimestamps}
                onChange={setShowTimestamps}
              />
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {segments.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No caption lines in this window.</p>
                ) : (
                  segments.map((s, i) => (
                    <div key={`${i}-${s.startSec}`} className="space-y-1">
                      {showTimestamps ? (
                        <span className="text-muted-foreground text-[10px]">
                          {formatClock(s.startSec)}
                        </span>
                      ) : null}
                      <Input
                        value={s.text}
                        onChange={(e) => onSegmentText(i, e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
