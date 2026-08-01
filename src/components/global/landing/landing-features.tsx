/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingFeatures
 *
 * WHAT:  Landing feature grid — six frosted-glass cards describing what Cliptic
 *        does after a link is pasted.
 * WHERE: Rendered by the landing page.
 */

import { Activity, Cpu, Scissors, ShieldCheck, Type, Upload, type LucideIcon } from 'lucide-react'

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Scissors,
    title: 'AI moment selection',
    description:
      'The AI reads the transcript — not the pixels — to find hooks, payoffs, and emotional spikes worth clipping.',
  },
  {
    icon: Type,
    title: 'Cuts that never cut you off',
    description:
      'Word-level timestamps and silence snapping keep clips from starting or ending mid-sentence.',
  },
  {
    icon: Upload,
    title: 'Link or upload',
    description:
      'Paste a YouTube link or drop your own file. Either way, finished clips land in minutes.',
  },
  {
    icon: Cpu,
    title: 'Bring your own AI',
    description:
      'Provider-agnostic — OpenAI, Anthropic, or run it locally. Your key, your cost, no lock-in.',
  },
  {
    icon: Activity,
    title: 'Watch it work',
    description:
      'Live per-stage and per-clip progress — download, transcribe, analyze, cut — so it never feels stuck.',
  },
  {
    icon: ShieldCheck,
    title: 'Own the whole thing',
    description:
      'Multi-tenant, self-hostable, and yours. No per-clip rent — your data stays with you.',
  },
]

export function LandingFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
      <div className="text-center">
        <span className="glass text-muted-foreground inline-block rounded-full px-3 py-1 text-xs">
          Features
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Everything after you paste the link
        </h2>
        <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-balance">
          One link in — Cliptic handles the downloading, transcribing, analyzing, and cutting.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="glass rounded-2xl p-6">
            <span className="bg-foreground/5 mb-4 flex size-10 items-center justify-center rounded-xl">
              <feature.icon className="size-5" />
            </span>
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-sm">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
