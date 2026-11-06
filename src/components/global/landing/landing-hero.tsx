/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: LandingHero, HeroFilm
 *
 * WHAT:  Landing hero — giant gradient Cliptic wordmark, tagline, CTAs, and the
 *        code-drawn product film (HeroFilm) showing a link become clips.
 * WHERE: Rendered by the landing page.
 */

import Link from 'next/link'
import { ArrowRight, Scissors } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { AUTH_ROUTES } from '@/lib/config'
import { cn } from '@/lib/utils'
import { HeroFilm } from './hero-film'

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

      {/* The product film: link in, scored and captioned clips out. */}
      <HeroFilm className="mt-16 max-w-5xl text-left" />
    </section>
  )
}
