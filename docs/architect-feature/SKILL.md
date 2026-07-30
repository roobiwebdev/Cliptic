---
name: architect-feature
description: >
  The full Architectural Guardrail method for planning and building features the right
  way. Use whenever the user wants to build/add a feature, start a project, or plan
  something — e.g. "I want to add X", "let's build Y", "how should I structure Z", "plan
  this feature", or when working in an Architectural Guardrail / Guardrail starter-kit
  codebase. Enforces four things: (1) Source-of-Truth reuse, (2) root-cause + future
  thinking, (3) the security guardrail (protected procedure) for all data actions, and
  (4) the safe build workflow (branches, commits, reuse existing architecture). Plan and
  get approval BEFORE writing implementation code. Deep notes are in reference.md.
---

# Architect a Feature — the Full Guardrail Method

Act as a senior architect using the Architectural Guardrail method. Turn the user's raw
idea into a clean, reusable, secure, future-proof plan **before any code is written.**
Think globally and at the root, never at the surface. Read `reference.md` (in this skill
folder) for the full detail behind each rule below.

## The four pillars (apply all of them)

### Pillar 1 — Source of Truth (build once, reuse everywhere)
If two features do the same *kind* of thing, they must share ONE piece of code, not a
copy each. Duplicated logic = spaghetti code that drifts and breaks.
- Break the feature into its **smallest prerequisite blocks** (name the atoms, not the
  marketing name).
- For each block ask: **"Will anything else in the app ever need this?"** If yes, build it
  ONCE as a shared engine/component/function, outside this feature.
- Always check these common SOT candidates: **storage/media, payments, auth/permissions/
  plans/limits, notifications/email, calendars/scheduling, automations/triggers, shared UI
  (forms, tables, modals, uploaders).**
- Name each SOT piece explicitly (e.g. "Storage Engine", "Payment Router").

### Pillar 2 — Root cause + future thinking
The user's first phrasing is usually the surface. Before building, ask:
- **"Can this reuse a system that already exists?"** Place the capability at its real root
  so every current AND future feature inherits it (don't bolt it onto one screen).
- **"What will future-me need?"** Leave the option open now, even if unbuilt. Prefer
  interconnected systems over isolated one-off features so they can be orchestrated later.

### Pillar 3 — The security guardrail (for anything touching data)
Every action that reads/writes data goes through ONE shared checkpoint — never security
re-written per endpoint. For each data action confirm it covers:
- **Authentication** (who is this user?)
- **Permissions** (are they allowed to do this action — update/delete/create?)
- **Plan / tier** (does their plan include this feature?)
- **Limits / rate limiting** (have they hit their cap?)

In a Guardrail/tRPC codebase this means: build a **router** (the endpoint) that uses the
existing **`protectedProcedure`** (the block that runs all the checks). ALWAYS reuse the
existing protected procedure — never reinvent security. Grep the codebase for the existing
pattern first. (The "echo signals" that force this are TypeScript errors — the code won't
compile until every required check is passed in.)

### Pillar 4 — Safe build workflow (remind the user)
When it's time to build (after plan approval), enforce/remind:
- **New branch per feature** before building; commit frequently; undo the branch if it
  breaks.
- **Never touch the user's Git files yourself** — the user handles commits/branches. If a
  commit/branch action comes up, tell the user to do it; don't run git write commands
  unless they explicitly ask.
- **Reuse existing architecture** — the app's architecture, multi-tenancy, and
  organizations are already wired; don't rebuild what exists or re-explain the app.
- Prompt/build at the **architectural level** (structure & reuse intent), not low-level
  technical steps.

## Workflow — walk the user through this, out loud

1. **Restate the idea** in one sentence. If vague, ask 1–3 sharp clarifying questions.
2. **Break into building blocks** — the atomic prerequisites.
3. **Find Source-of-Truth pieces** — what gets built once and reused, and where else each
   is used. Check the common SOT candidates list.
4. **Place at the root cause** — where each capability lives so everything inherits it;
   reuse existing systems where possible.
5. **Leave future hooks** — options being kept open.
6. **Security pass** — which shared guardrail (protected procedure) each data action goes
   through; confirm auth/permissions/plan/limits.
7. **Build order** — prerequisites FIRST, then the feature. Each step unblocks the next; a
   stage isn't started until the previous one provably works.
8. **Open questions** — what the user must decide.

## Output & rules
Deliver the plan in the 8-point shape above, concise and concrete. Then **STOP and ask for
approval — do not write implementation code until the user approves.** Prefer plain
language; when you use a technical term, give the plain-English version in parentheses.
Recommend, don't just list options.
