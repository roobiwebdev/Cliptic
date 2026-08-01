/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: Progress
 *
 * WHAT:  Minimal, dependency-free progress bar (0–100) using theme tokens.
 * WHY:   A determinate bar is all Cliptic's job progress needs; no Radix
 *        dependency required. Uses bg-primary/bg-secondary so it follows theme.
 * WHERE: Clip job cards + job detail stepper.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

function Progress({
  value = 0,
  className,
  ...props
}: React.ComponentProps<'div'> & { value?: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-secondary relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <div
        className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { Progress }
