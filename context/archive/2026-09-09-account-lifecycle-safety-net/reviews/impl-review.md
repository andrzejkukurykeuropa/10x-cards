<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account-lifecycle safety net (test-plan §3 Faza 4, Ryzyko #6)

- **Plan**: context/changes/account-lifecycle-safety-net/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Summary

Pure test-only phase, executed as planned. Diff scope: one new file
`tests/lib/inactive-accounts.test.ts` (207 lines, 8 `describe` groups, 37 tests)
plus `context/` docs and the §6.1/§6.6 cookbook sub-phase. **Zero `src/` changes**,
zero `vitest.config.ts` changes — exactly matching plan §"Czego NIE robimy".

Independently verified:
- `npx vitest run tests/lib/inactive-accounts.test.ts` → 37/37 pass (no `supabase start` needed).
- `npx vitest run tests/lib/` → 59/59 pass (fsrs suite unregressed).
- `npx eslint tests/lib/inactive-accounts.test.ts` → 0 errors.
- `npm run lint` → 49 errors, all in pre-existing `src/` files, none in the new test (consistent with plan assumption; blocks §3 Faza 5, not Faza 4).
- Manual check 1.6 reproduced: mutating `WARNING_THRESHOLD_MONTHS` 23→24 fails 5 tests; revert returns to green (`git diff` clean).

§7 negative-space respected: no endpoint test for `cleanup-inactive-accounts.ts`,
no `retention_warning_sent_at` marker-lifecycle fix (both explicitly deferred).

## Findings

### F1 — Boundary test reconstructs the SUT's threshold instant

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/lib/inactive-accounts.test.ts:71-76
- **Detail**: `monthsBefore(NOW, 24, 0)` reproduces the exact instant the SUT derives
  as `threshold` via the same `setMonth(-24)` operation. The file's own ZASADA ASERCJI
  docblock forbids reproducing `setMonth` or the threshold constants in assertions, and
  plan §Faza1 (line 184) asked for a near-threshold input "z marginesem ujemnym kilku
  dni", not the exact mirror. The mirror does buy something the negative-margin version
  would not — it exercises the `<=` (inclusive) boundary semantics — but it couples this
  one test's oracle to the SUT's arithmetic: a regression in `setMonth` calendar
  behavior would move helper and SUT together and the test would still pass. The
  deviation is explicitly commented and the rest of G2 covers "past threshold → true"
  independently, so blast radius is minimal.
- **Fix**: Keep the inclusive-boundary check, but add one sibling assertion with an
  independent input a few days past the threshold (`monthsBefore(NOW, 24, -3)` → `true`)
  so "past → delete" does not rely solely on the mirrored instant.
- **Decision**: SKIPPED — G2's first loop already covers "past threshold → true"
  independently; the mirror is intentional and commented, scoped to the `<=` boundary.

### F2 — G4 grid-loop comment oversells what the loop asserts

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/lib/inactive-accounts.test.ts:96-109
- **Detail**: The comment calls the grid loop "centralny test fazy" that catches any
  drift opening "lukę albo nakładkę" between the windows. The loop only asserts
  `!(del && warn)` and `filter(truthy).length <= 1` — that catches an *overlap* (both
  classifiers true) but not a *gap* (both false where one should fire). The mutation
  check confirms it: under `WARNING_THRESHOLD_MONTHS = 24` all 8 grid iterations still
  pass; the 5 failures come from the fixed-point assertions in G3, G7 and G4 line 111.
  The phase goal (catch threshold drift) is met by the file as a whole, but not by the
  loop the comment credits.
- **Fix**: Reword the comment to say the loop guards against window *overlap*, and that
  gap / threshold-drift is caught by the fixed-point assertions (line 111, G3, G7). No
  assertion change needed.
- **Decision**: FIXED — comment at lines 97-102 reworded (overlap-guard framing +
  pointer to the fixed-point assertions and G3/G7); no assertion change. Test + lint green.

### F3 — `process.env.TZ` mutated process-globally with no restore

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/lib/inactive-accounts.test.ts:28
- **Detail**: `process.env.TZ = "UTC"` is a process-global write that is never restored.
  Vitest reuses worker processes across test files in a pool, so a later file in the
  same worker inherits UTC. Today the blast radius is nil (UTC is the sane default;
  `fsrs.test.ts` is TZ-agnostic) and the plan deliberately chose this over `setupFiles`,
  but the intent is not signposted for a future reader.
- **Fix**: Add one comment line stating the no-restore is deliberate (UTC is the
  intended suite-wide default); if a future test file needs a different zone, promote to
  `setupFiles` per the plan's "Otwarte ryzyka" note.
- **Decision**: SKIPPED — UTC is the intended suite-wide default; blast radius nil,
  plan chose this over `setupFiles` deliberately. Revisit if a future file needs a different zone.
