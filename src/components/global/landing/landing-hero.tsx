/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingHero
 *
 * WHAT:  Landing hero — giant gradient Cliptic wordmark, tagline, CTAs, and a
 *        frosted "clip result" preview card.
 * WHERE: Rendered by the landing page.
 */

import Link from 'next/link'
import { ArrowRight, Download, Scissors } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { AUTH_ROUTES } from '@/lib/config'
import { cn } from '@/lib/utils'

export function LandingHero() {
  return (
    <section className="bg-spotlight relative flex flex-col items-center px-4 pt-36 pb-20 text-center sm:pt-44">
      <span className="glass text-muted-foreground mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm">
        <Scissors className="size-3.5" />
        AI clips from any long video
      </span>

      <h1 className="text-gradient text-[22vw] leading-[0.82] font-bold tracking-tighter sm:text-[16vw] lg:text-[11rem]">
        Cliptic
      </h1>

      <p className="mt-6 text-2xl font-semibold tracking-tight sm:text-4xl">
        Long videos in.{' '}
        <span className="text-muted-foreground">Viral clips out.</span>
      </p>

      <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-balance">
        Paste a YouTube link or upload a video. Cliptic transcribes it, finds the most viral moments
        with AI, and hands you ready-to-post clips — in minutes.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={AUTH_ROUTES.signUp}
          className={cn(buttonVariants({ size: 'lg' }), 'rounded-full')}
        >
          Start clipping free
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href="#pricing"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-full')}
        >
          See pricing
        </Link>
      </div>
      <p className="text-muted-foreground mt-4 text-xs">No credit card · Free plan included</p>

      {/* Frosted clip-result preview. */}
      <div className="glass-strong glow-primary mt-16 w-full max-w-2xl rounded-3xl p-3 text-left sm:p-4">
        <div className="mb-3 flex items-center gap-2 px-2 pt-1">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Scissors className="size-3.5" />
          </span>
          <span className="text-sm font-medium">youtu.be/…</span>
          <span className="glass text-muted-foreground ml-auto rounded-full px-2.5 py-0.5 text-xs">
            Done in 2:14
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="glass overflow-hidden rounded-2xl">
              <div className="relative flex aspect-video items-center justify-center bg-foreground/[0.03]">
                <span className="flex size-11 items-center justify-center rounded-full bg-foreground/10 backdrop-blur">
                  <svg viewBox="0 0 24 24" className="ml-0.5 size-4 fill-foreground" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">Clip {i} · the hook everyone shares</p>
                  <p className="text-muted-foreground text-xs">Score {94 - i * 3} · 0:32</p>
                </div>
                <span className="glass text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Download className="size-4" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
