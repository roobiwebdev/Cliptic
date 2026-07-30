# Architectural Guardrail — Full Lesson Notes (reference)

The complete methodology from the lesson, in four parts. SKILL.md turns this into an
actionable workflow; this file is the depth behind it.

---

## PART 1 — Source of Truth (SOT)

**Rule:** Build it once, reuse it everywhere. If two features do the same *kind* of
thing, they share ONE piece of code — not a copy each.

- The shared piece is the "source of truth." Change it once → updates everywhere.
- The enemy is duplicated logic ("spaghetti code") that drifts apart and breaks.
- Break a feature into its smallest prerequisite blocks first (e.g. testimonials →
  image/video upload + create form + list page). Name the atoms, not the marketing name.
- For each block ask: "will anything else ever need this?" If yes → build it as a shared
  engine/component/function OUTSIDE the feature.
- Examples from the lesson:
  - **Storage Engine** — one media component (Cloudflare R2 behind it) plugged into every
    feature that uploads files (testimonials, profiles, website builder).
  - **Checkout / Payment Router** — one payment router wired into website builder,
    invoices, and product pages. 3 screens, 1 source of truth.
  - **Calendar** — one component rendered in app + website builder + booking links.
- Prompt starter: *"We're enforcing Source of Truth architecture for all features.
  Identify what could be reused elsewhere and build those as single shared pieces."*

---

## PART 2 — Root Cause + Future Thinking

**Rule:** Solve the problem at the root cause, not where you first noticed it. Think
beyond the current stage.

- Two questions before every feature:
  1. "Can this reuse a system that already exists?"
  2. "What will future-me need?" — leave the option open now even if unbuilt.
- **Drip-sequence example:** goal = stop email mass-blasting. Wrong = add a delay inside
  the *email* feature (surface). Right = add a "drip" action inside the shared
  *automation builder* (root), so every current & future flow inherits it.
- **Lead-list example:** instead of a "quick emails" button hard-coded on lead lists, he
  removed it and added a generic "Run Automation" button — now any leads can flow into
  ANY automation (email, tags, future campaigns). One decision, huge future flexibility.
- **Interconnectivity:** features that plug into shared systems can be orchestrated later
  (even by AI). Isolated "little nuggets" that don't interconnect can't.

---

## PART 3 — The Security Guardrail Block

**Rule:** Every action that reads/writes data passes through ONE shared checkpoint — not
security logic re-written in every endpoint.

- The UI talks to the database via an **API call** (a "phone call"); the **endpoint** is
  the phone number. By default *anyone* can dial it.
- Questions every call must answer: **Authentication** (who are you?), **Permissions**
  (are you allowed?), **Plan** (does your tier include this?), **Limits / rate limiting**
  (hit your cap?).
- Writing those gates into all 500 endpoints = unmaintainable. Solution = a middle
  **block** (the guardrail) that every request passes through first.
- "Echo signals": each check echoes a requirement back; technically these are
  **TypeScript errors** — the code won't compile until every required piece is passed in.
  This forces Claude to wire security correctly; it can't skip or hallucinate past it.
- In the codebase (tRPC):
  - **Router** = the endpoint. Every feature gets one.
  - **Procedure** = the block. `authProcedure` handles auth; **`protectedProcedure`**
    does everything (org exists, onboarding done, membership, roles, permissions, rate
    limits).
  - The rule for Claude is simply: **"build a router using the protected procedure"** and
    all security falls into place.
- The CLAUDE.md system references this so the AI reuses it and doesn't hallucinate.

---

## PART 4 — The Safe Build Workflow (habits)

**User-side habits the skill should remind the user about:**

- **Never let Claude touch Git files** — do commits/branches yourself; deny if it asks.
- **New branch per feature** — if it breaks, undo the whole branch in one click.
- **Commit frequently; undo when something goes wrong.** That's the safety net.
- **`claude --dangerously-skip-permissions`** = autopilot (convenient; know the risk).
- **The architecture is already built** — Claude already knows the app; don't re-explain
  it. Don't rebuild architecture that exists.
- **Multi-tenancy + organizations are already wired in** — so the app can be sold as a
  SaaS later (recurring revenue). New features build into the sidebar automatically.
- **Prompt at an architectural level, not technical** — describe what to *consider* and
  how it should be *structured/reused*, not the low-level how-to. (Voice-to-text helps
  you think out loud.)
- **Just start. Do checkpoints. Post wins in the community.** Consistency > waiting.
