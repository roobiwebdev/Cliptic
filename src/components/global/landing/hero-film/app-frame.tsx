/**
 * SOURCE OF TRUTH KEYWORDS: FilmAppFrame, hero film window, browser chrome,
 *   film sidebar, dashboard mock, URL bar
 *
 * WHAT:  The hero film's environment: a browser window with the Cliptic
 *        dashboard shell (sidebar with the real nav items, active "Clips").
 * WHY:   Puts the mock in a believable place; the address bar follows the
 *        page the film is on (clips list, then the job page).
 * WHERE: hero-film/scene.tsx.
 */

import { CreditCard, LayoutDashboard, Lock, Scissors, Settings, Users } from 'lucide-react'

import { PlatformLogo } from '@/components/global/platform-logo'
import { rect } from '@/components/global/product-film'
import { cn } from '@/lib/utils'
import { CHROME_H, SIDEBAR_W, T, WINDOW } from './script'

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, active: false },
  { label: 'Clips', icon: Scissors, active: true },
  { label: 'Team', icon: Users, active: false },
] as const

const SETTINGS_NAV = [
  { label: 'Billing', icon: CreditCard },
  { label: 'Organization', icon: Settings },
] as const

export function FilmAppFrame({ t }: { t: number }) {
  const onJob = t >= T.toJob[0] && t < T.loopOut[1] - 400
  const path = onJob ? '/dashboard/clips/cm9q2x7tk' : '/dashboard/clips'

  return (
    <>
      {/* Window body + chrome. */}
      <div
        className="border-foreground/12 bg-background absolute overflow-hidden rounded-[16px] border shadow-2xl"
        style={rect({ x: WINDOW.x, y: WINDOW.y, w: WINDOW.w, h: WINDOW.h })}
      >
        <div
          className="border-border bg-foreground/[0.03] flex items-center border-b px-5"
          style={{ height: CHROME_H }}
        >
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="bg-foreground/20 size-3 rounded-full" />
            ))}
          </div>
          <div className="bg-foreground/[0.06] text-muted-foreground mx-auto flex h-[28px] w-[420px] items-center justify-center gap-2 rounded-lg text-[15px]">
            <Lock className="size-3.5" />
            <span className="text-foreground">cliptic</span>
            <span>{path}</span>
          </div>
          <div className="w-[52px]" />
        </div>
      </div>

      {/* Sidebar with the dashboard's real nav. */}
      <div
        className="border-sidebar-border bg-sidebar text-sidebar-foreground absolute flex flex-col rounded-bl-[15px] border-r px-4 pt-5 pb-4"
        style={rect({
          x: WINDOW.x + 1,
          y: WINDOW.y + CHROME_H + 1,
          w: SIDEBAR_W,
          h: WINDOW.h - CHROME_H - 2,
        })}
      >
        <PlatformLogo href="" size={30} className="px-2 text-[21px]" />
        <nav className="mt-7 space-y-1">
          {NAV.map((item) => (
            <div
              key={item.label}
              className={cn(
                'flex h-11 items-center gap-3 rounded-lg px-3 text-[17px]',
                item.active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </div>
          ))}
        </nav>
        <p className="text-muted-foreground mt-6 px-3 text-[13px] font-medium tracking-wide uppercase">
          Settings
        </p>
        <nav className="mt-2 space-y-1">
          {SETTINGS_NAV.map((item) => (
            <div
              key={item.label}
              className="text-muted-foreground flex h-11 items-center gap-3 rounded-lg px-3 text-[17px]"
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg text-[14px] font-semibold">
            LS
          </span>
          <div className="leading-tight">
            <p className="text-[16px] font-medium">Lumen Studio</p>
            <p className="text-muted-foreground text-[13px]">Pro plan</p>
          </div>
        </div>
      </div>
    </>
  )
}
