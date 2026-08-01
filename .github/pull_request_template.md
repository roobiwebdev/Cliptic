<!-- Cliptic PR — keep it focused: one unit of work per PR. -->

## What & why
<!-- Short summary of the change and the problem it solves. -->

## Plan reference
<!-- Which phase / section of docs/clipper-migration-plan.md does this implement? -->
- Phase:
- Section:

## Changes
<!-- Bullet the notable changes. -->
-

## Screenshots / recordings
<!-- Required for any UI change. -->

## Checklist
- [ ] `pnpm typecheck` passes (no `any`, no type bypasses)
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] Prisma schema changes include a migration note (migrations are run by the maintainer)
- [ ] No secrets committed (`.env` stays local)
- [ ] Reused existing Source-of-Truth architecture (registry / protectedProcedure / services); no duplicated patterns
- [ ] Docs / `.env.example` updated if new env vars were introduced

## Notes for reviewer
<!-- Anything CodeRabbit or the human reviewer should focus on. -->
