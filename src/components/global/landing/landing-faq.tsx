/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: LandingFaq
 *
 * WHAT:  Landing FAQ — a lightweight glass accordion.
 * WHERE: Rendered by the landing page.
 */

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

const FAQS = [
  {
    q: 'How does Cliptic pick the best clips?',
    a: 'It transcribes your video with word-level timestamps, then an LLM reads that transcript and selects the highest-retention moments — hooks, payoffs, strong opinions, and complete thoughts. No vision model, no guesswork.',
  },
  {
    q: 'Do I have to upload the whole video?',
    a: 'No. For a link, Cliptic downloads only what it needs. You can also upload your own file directly — handy when a source isn’t public.',
  },
  {
    q: 'Which sources work?',
    a: 'YouTube links and direct uploads today. Uploads always work; links depend on the source being reachable.',
  },
  {
    q: 'Can I use my own AI provider?',
    a: 'Yes. Cliptic is provider-agnostic — plug in OpenAI or Anthropic, or run models locally. You bring the key, you control the cost.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes — the Free plan includes a few videos every month so you can try the full pipeline before upgrading.',
  },
  {
    q: 'Can I self-host or own it?',
    a: 'Cliptic is multi-tenant and self-hostable. Run it on your own infrastructure and keep your data and clips entirely yours.',
  },
]

export function LandingFaq() {
  const [open, setOpen] = React.useState<number | null>(0)

  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-24">
      <div className="text-center">
        <span className="glass text-muted-foreground inline-block rounded-full px-3 py-1 text-xs">
          FAQ
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Questions &amp; answers</h2>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        {FAQS.map((item, index) => {
          const isOpen = open === index
          return (
            <div key={item.q} className="glass rounded-2xl">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-medium">{item.q}</span>
                <ChevronDown
                  className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                />
              </button>
              {isOpen ? <p className="text-muted-foreground px-5 pb-5 text-sm">{item.a}</p> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
