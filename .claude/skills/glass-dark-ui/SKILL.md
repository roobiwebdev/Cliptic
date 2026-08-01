---
name: glass-dark-ui
description: Cliptic's core visual design language — a modern "glass dark" aesthetic (near-black canvas, frosted-glass panels, giant gradient display type, soft glow, floating pill nav). USE THIS for any UI work across the platform — landing page, dashboard, auth, marketing — so everything looks like a premium modern SaaS (opus.pro / Snippa / FunnelMods class). Adapted from github.com/sifenfisaha/glass-dark-ui and wired into this codebase's Tailwind v4 tokens.
---

# Glass-Dark UI — Cliptic's design language

Apply this to **every** surface. The goal: sleek, dark, layered, premium.

## Principles
1. **Near-black canvas, white-opacity depth.** Backgrounds are `bg-background` (black in dark theme). Depth comes from translucent white overlays, never from separate solid colors.
2. **Frosted glass everywhere.** Cards, nav, modals, badges use the `.glass` / `.glass-strong` utilities (backdrop-blur + faint foreground-tinted fill + hairline border). No flat opaque cards on the landing.
3. **Giant display type.** Hero uses a massive wordmark with `.text-gradient` (solid→faded vertical fill). Section headings are `text-3xl/4xl font-semibold tracking-tight`.
4. **Soft glow, not hard shadows.** Use `.glow-primary` behind hero/CTA/most-popular surfaces. Spotlight backdrops use `.bg-spotlight`.
5. **Floating pill nav.** Sticky, centered, rounded-full, `.glass-strong`.
6. **Rounded + airy.** Prefer `rounded-2xl`/`rounded-3xl`/`rounded-full`, generous padding, `gap-3/4`.
7. **Theme-adaptive.** Everything must work in light AND dark — the utilities derive from tokens, so never hardcode colors.

## Utilities (defined in src/app/globals.css)
- `.glass` — frosted panel (subtle). Cards, badges, secondary surfaces.
- `.glass-strong` — heavier frost + border. Nav, featured cards, CTA panels.
- `.text-gradient` — solid→faded text fill for big display words.
- `.glow-primary` — soft ambient glow behind a surface.
- `.bg-spotlight` — radial top spotlight for hero sections.

## Hard rules (also in CLAUDE.md)
- **Theme tokens only** — `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border`, `bg-foreground/5`, `ring-foreground/15`, etc. Never hex, `text-white`, `bg-[#…]`, or forced `dark`.
- **Font:** the app ships **Geist** (`font-sans`) + Geist Mono. Use heavy weights + `.text-gradient` for the display look (we don't swap in Poppins app-wide).
- **Icons:** `lucide-react`, `size-4`/`size-5`.
- **Brand mark:** `<PlatformLogo />` (src/components/global/platform-logo.tsx) — swaps white/black logo with the theme automatically.
- Reuse existing shadcn/ui primitives (`Button`, `Card`, `AlertDialog`, `Progress`, …) — restyle with the utilities above, don't reinvent.

## Reference implementation
The landing page (`src/app/page.tsx` + `src/components/global/landing/*`) is the canonical example — copy its patterns (pill nav, giant gradient hero, glass feature/pricing cards, glass FAQ accordion, glow CTA) when building new pages or upgrading the dashboard.
