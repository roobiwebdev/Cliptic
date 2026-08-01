/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client'

/**
 * SOURCE OF TRUTH KEYWORDS: ThemeToggle
 *
 * WHAT:  Light/dark theme toggle (next-themes). The brand logo swaps with it.
 * WHY:   Icons swap via CSS `dark:` variants (stable across SSR/hydration, no
 *        mounted-state flag); the current theme is read from the DOM at click
 *        time so no resolvedTheme dependency is needed.
 * WHERE: Landing nav (and reusable anywhere a toggle is wanted).
 */

import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      className={cn(className)}
      onClick={() => {
        const isDark = document.documentElement.classList.contains('dark')
        setTheme(isDark ? 'light' : 'dark')
      }}
    >
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="block size-4 dark:hidden" />
    </Button>
  )
}
