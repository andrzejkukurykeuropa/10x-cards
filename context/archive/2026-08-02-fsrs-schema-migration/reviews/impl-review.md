<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Migracja schematu SRS z SM-2 na FSRS (F-04)

- **Plan**: context/changes/fsrs-schema-migration/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-08-02
- **Verdict**: APPROVED
- **Findings**: [0 critical] [1 warning] [1 observation]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — `state` implemented as a TS `enum` instead of the planned string union type

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/types.ts:1-6, 19
- **Detail**: Phase 2's contract specified `state: "New" | "Learning" | "Review" | "Relearning"` (a type-only string union, consistent with the rest of `types.ts` which has no runtime enums). The implementation instead introduces `export enum FsrsState { New = "New", ... }` and types `state: FsrsState`. Functionally equivalent (same string values, assignable from the DB's `fsrs_state` enum), and the commit message documents the deviation explicitly, but it's the first TS `enum` in the codebase where the plan called for a plain union, and it changes the contract from type-only (erased at compile time) to a runtime object.
- **Fix**: Replace `export enum FsrsState {...}` with `export type FsrsState = "New" | "Learning" | "Review" | "Relearning";` and update `state: FsrsState` accordingly (no other call sites reference `FsrsState.New` etc., since S-04 isn't implemented yet, so this is a safe, isolated rename).
  - Strength: Matches the plan's literal contract and the rest of `types.ts`, which uses plain string/union types with zero runtime enums.
  - Tradeoff: Loses the (minor) autocomplete/namespacing benefit of an enum; negligible given no consumers exist yet.
  - Confidence: HIGH — grep confirms no other file references `FsrsState` members.
  - Blind spot: None significant — S-04 hasn't started, so no downstream code depends on the enum shape.
- **Decision**: FIXED — replaced `enum FsrsState` with `type FsrsState = "New" | "Learning" | "Review" | "Relearning"` in src/types.ts; `npm run lint` re-verified clean.

### F2 — No automated/unit tests added

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: N/A (plan-level)
- **Detail**: Plan explicitly scoped this out ("Brak — zmiana wyłącznie schematu/typów, brak logiki biznesowej do testowania jednostkowo"). Confirmed appropriate: no code paths read/write the new fields yet (S-04 not implemented), so there's nothing to unit test. Not an actual gap, just noting it was a deliberate and correct scoping choice.
- **Fix**: None needed.
- **Decision**: SKIPPED — confirmed correctly scoped, no action needed.

## Notes

- Migration SQL (`supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql`) matches the plan's contract byte-for-byte: idempotent enum creation, column drop/add order, CHECK constraints (including `difficulty >= 0` to accommodate `ts-fsrs`'s `createEmptyCard()`), and the reset `UPDATE`.
- `npm run lint` passes (verified live during this review, exit code 0; only pre-existing `astro-eslint-parser` warnings, no errors).
- Grep confirms no other source file references the removed `easiness_factor`/`interval` fields or the new FSRS fields — the "safe to change, no consumers yet" premise in the plan's Analiza stanu obecnego holds.
- Both commits (`242eb12`, `9d1bf1a`) are scoped exactly to their phase's file list; no unplanned files touched. Progress checkboxes in `## Progress` match the actual commits (no blind-signoff — sha references present for every checked item).
