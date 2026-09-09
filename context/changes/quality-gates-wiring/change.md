---
change_id: quality-gates-wiring
title: Wire lint + unit/integration as a required CI gate on every PR
status: implemented
created: 2026-09-09
updated: 2026-09-10
archived_at: null
---

## Notes

Rollout Phase 5 of context/foundation/test-plan.md: "Quality-gates wiring".

Goal: wire `lint` + `unit + integration` as a REQUIRED CI gate on every PR (§3, §5 — currently "wymagana po §3 Faza 1" but not actually enforced in .github/workflows/ci.yml).

Risks covered: cross-cutting (protects every risk #1–#6 by making the suite from Phases 1–4 a merge blocker).

Test types planned: gates (CI workflow wiring — no new test code).

Risk response intent:
- This phase proves protection by regression: once wired, any PR that breaks an existing unit/integration test or introduces a lint error cannot merge. Today the suite exists (tests/ — ~120 tests across lib/api/components) but CI only runs lint + build, and lint is currently RED (49 errors) so it could not be made blocking even if wired.
- Hard prerequisite: zero the pre-existing lint debt first. `npm run lint` = 49 errors in non-test files (src/components/AccountDeletion.tsx, src/components/ui/checkbox.tsx, src/components/ui/dialog.tsx, src/lib/inactive-accounts.ts, src/pages/api/admin/cleanup-inactive-accounts.ts, src/pages/api/generate-flashcards.ts). 46 auto-fixable via `npm run lint:fix`; 3 manual: two @typescript-eslint/no-unnecessary-condition in cleanup-inactive-accounts.ts (lines 94, 118), one @typescript-eslint/no-deprecated on generateObject in generate-flashcards.ts:48. New test files are already clean (`npx eslint tests/**` → 0). Tracked in context/archive/2026-09-09-study-fsrs-scheduling-integrity/follow-ups/review-fixes.md (F1).
- CI reality to ground: .github/workflows/ci.yml runs lint + build on push/PR to master and needs SUPABASE_URL / SUPABASE_KEY repo secrets. Integration tests need a running Supabase (`npx supabase start`) — the plan must decide whether the CI gate runs unit-only, or spins up Supabase in CI for the full integration suite.
- Anti-pattern to avoid: marking the gate "required" in the test plan without a corresponding real CI step; or making lint blocking by suppressing/`eslint-disable`-ing the 3 manual violations instead of fixing them.

Out of scope for this phase (do NOT fold in): §4 "Stos" `--refresh` for jsdom/RTL + tests/lib/ — that is a separate `/10x-test-plan --refresh`, not blocking here.
