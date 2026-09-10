---
date: 2026-09-09T23:58:00+02:00
researcher: AndrzejKukuryk
git_commit: 67e9b8322206f936f5e0ca60e69609c39f4ae373
branch: master
repository: 10x-cards
topic: "Phase 5 — Quality-gates wiring: lint + unit-only tests as a required CI gate"
tags: [research, codebase, ci, vitest, eslint, quality-gates, test-plan-phase-5]
status: complete
last_updated: 2026-09-09
last_updated_by: AndrzejKukuryk
---

# Research: Phase 5 — Quality-gates wiring

**Date**: 2026-09-09T23:58:00+02:00
**Researcher**: AndrzejKukuryk
**Git Commit**: 67e9b8322206f936f5e0ca60e69609c39f4ae373 (local `master`, 11 commits ahead of `origin/master`)
**Branch**: master
**Repository**: 10x-cards

## Research Question

Rollout Phase 5 of `context/foundation/test-plan.md` — "Quality-gates wiring". Ground the
following before `/10x-plan`:

1. What does the CI wiring actually require, given the decision to gate **lint + unit-only
   tests** (not the full integration suite)?
2. The 49-error lint debt — is `change.md`'s breakdown accurate, and what are the exact fixes
   for the 3 manual violations?
3. The flaky `study-review.test.ts` 2.4 test — root cause and options.
4. Any hidden blockers (test infra, "typecheck" gate, branch protection, deploy coupling).

## Summary

**Scope decision (from user):** the blocking CI gate for this phase is **`npm run lint` +
unit-only tests (`tests/lib/**`, no Supabase)**. The full integration suite (`tests/api/**`,
`tests/middleware.test.ts`, `tests/components/**`) stays local-only until a later phase — it
needs a live local Supabase and carries a known flaky test.

Five things the plan must handle:

1. **Zero the lint debt first (hard prerequisite).** `npm run lint` = **49 errors**, exactly
   as `change.md` states. 46 are `prettier/prettier` formatting, auto-fixed by
   `npm run lint:fix`. 3 are manual — all now analysed below with concrete one-line fixes
   (two dead null-guards; one migration off the deprecated `generateObject`). The debt lives
   in 6 non-test files; new test files are clean. **CI is almost certainly already red on
   `origin/master`** — the debt files were last touched in `1ecbd74` (account-deletion-retention
   p2), which *is* an ancestor of `origin/master`. The plan should verify the last CI run's
   status and treat "make lint green" as step 1, not an assumption.

2. **A unit-only test job cannot just run `npx vitest run tests/lib`.** `vitest.config.ts:8`
   registers `globalSetup: ["tests/setup/global-setup.ts"]`, which runs **unconditionally for
   any vitest invocation** (the `include` filter and CLI file args do not scope it). That
   setup throws without `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and then makes network
   calls to a live local Supabase to create test users. Verified: with `.env.test` removed,
   `npx vitest run tests/lib/fsrs.test.ts` fails in `_initializeGlobalSetup` before any test
   runs. The plan needs a **separate vitest config without `globalSetup`** scoped to
   `tests/lib/**` (recommended: a new `vitest.config.unit.ts` + `test:unit` npm script —
   smallest diff, keeps the loud failure in `global-setup.ts` intact).

3. **The two `tests/lib` files are genuinely Supabase-free and network-free.** Full import
   graph is `vitest` + `ts-fsrs` + pure type-only imports. They run clean under `environment:
   node` with no setup file. Unit scope = `fsrs.test.ts` (22 tests) + `inactive-accounts.test.ts`
   (37 tests) = **59 tests**.

4. **The `study-review.test.ts` 2.4 flake does not block this phase** (integration suite is
   not gated), but it should be recorded. Root cause: it is a positive control that asserts
   `[200, 409]`, and the `409` only occurs when two `Promise.all` requests genuinely overlap
   at the DB between the CAS `SELECT` and `UPDATE` (`src/pages/api/study/review.ts:45-84`).
   Under full-suite parallel load the two requests can serialize, making the second a
   legitimate sequential replay → `[200, 200]`. Observed failure rate ≈ 1 in 6 full-suite
   runs; always passes in isolation and on re-run.

5. **"Required gate" = merge-blocker only.** Cloudflare Pages deploys via its own Git
   integration on every push/PR branch **regardless of GitHub Actions status**
   (`.github/workflows/ci.yml:3-6`, `context/changes/deployment/deployment-plan.md:9-14`).
   Marking the check "required" blocks PR merge into `master`; it does not block a preview
   deploy of a red PR branch, and production only ever gets what was merged. Making the check
   *required* also needs a **manual GitHub branch-protection change** — `gh` CLI is installed
   but **not authenticated** (`gh auth status` → not logged in), so the plan cannot script it
   without an auth step.

## Detailed Findings

### A. Current CI — `.github/workflows/ci.yml`

30 lines. One job `ci` on `ubuntu-latest`, triggered on `push` to `master` and
`pull_request` to `master`.

Steps (`ci.yml:17-29`):
1. `actions/checkout@v4`
2. `actions/setup-node@v4` — `node-version: 22` (bare major; `.nvmrc` pins `v22.14.0`),
   `cache: npm`
3. `npm ci`
4. `npx astro sync`
5. `npm run lint` → `eslint .` (`package.json:11`)
6. `npm run build` → `astro build`, with `env: SUPABASE_URL, SUPABASE_KEY` from repo secrets

No test step today. No `node_modules`/build caching beyond npm's cache. Header comment
(`ci.yml:3-6`) forbids adding a deploy step ("Deployment is handled exclusively by Cloudflare
Pages Git integration").

`npx astro sync` **must** stay before `npm run lint`: it generates `.astro/types.d.ts`
(referenced by `tsconfig.json` `include`) which provides types for virtual modules
(`astro:env/server`), and the ESLint config is type-aware (`eslint.config.js:18`
`projectService: true`) so it needs those types present. A job that runs **only** vitest on
`tests/lib/**` does not need `astro sync`.

Second workflow `.github/workflows/cleanup-inactive-accounts.yml` is unrelated (daily `curl`
cron against the production cleanup endpoint).

### B. The lint debt — 49 errors

`npm run lint` output tail: `✖ 49 problems (49 errors, 0 warnings) / 46 errors ... potentially
fixable with the --fix option`. Confirmed live. Breakdown matches `change.md:21-22` exactly.

Affected files (all non-test):
- `src/components/AccountDeletion.tsx` — prettier only
- `src/components/ui/checkbox.tsx` — prettier only
- `src/components/ui/dialog.tsx` — prettier only (the bulk — ~24 errors, incl. tailwind class ordering)
- `src/lib/inactive-accounts.ts` — prettier only (2 missing commas: lines 21, 53)
- `src/pages/api/admin/cleanup-inactive-accounts.ts` — 1 prettier (`:146`) + **2 manual**
- `src/pages/api/generate-flashcards.ts` — **1 manual**

`npx eslint tests/**` → 0 errors (test files are clean).

The 3 debt files under `src/components/` were all last touched in commit `1ecbd74`
(`feat(account-deletion-retention): add self-service account deletion (p2)`), which is an
ancestor of `origin/master`. So these prettier violations have been on the remote default
branch for some time — **the plan should check whether the most recent CI run on `master` is
already failing** rather than assume lint is green today.

#### Manual fix #1 — `src/pages/api/admin/cleanup-inactive-accounts.ts:94`

`@typescript-eslint/no-unnecessary-condition` — "Unnecessary conditional, expected left-hand
side of `??` operator to be possibly null or undefined".

```ts
const createdAt = candidate.created_at ?? null;   // line 94
```

`candidate` is a `User` from `admin.auth.admin.listUsers()`. In `@supabase/auth-js`,
`User.created_at` is typed `string` (required, non-nullable). The `?? null` is dead.
(Contrast line 93 `candidate.last_sign_in_at ?? null` — that field is `string | undefined`,
so its guard is legitimate and the rule does *not* flag it.)

**Fix:**
```ts
const createdAt = candidate.created_at;
```
`createdAt` flows only into `isInactiveForDeletion(lastSignInAt, createdAt)` /
`isInWarningWindow(...)`, whose param is `createdAt: string | null = null`
(`src/lib/inactive-accounts.ts:20, :52`) — a plain `string` is assignable. No behavior change.

#### Manual fix #2 — `src/pages/api/admin/cleanup-inactive-accounts.ts:118`

`@typescript-eslint/no-unnecessary-condition` — "Unnecessary optional chain on a non-nullish
value".

```ts
const alreadyWarned = Boolean(candidate.user_metadata?.retention_warning_sent_at);   // line 118
```

`User.user_metadata` is typed `UserMetadata` (required; `interface UserMetadata { [key:
string]: any }`), never nullish. The same file already accesses it without `?.` at line 140
(`{ ...candidate.user_metadata, retention_warning_sent_at: ... }`).

**Fix:**
```ts
const alreadyWarned = Boolean(candidate.user_metadata.retention_warning_sent_at);
```
Member access resolves to `any`, wrapped in `Boolean(...)` — identical runtime result.

#### Manual fix #3 — `src/pages/api/generate-flashcards.ts:48` — `generateObject` deprecated

`@typescript-eslint/no-deprecated` — "`generateObject` is deprecated. Use `generateText` with
an `output` setting instead".

```ts
import { generateObject } from "ai";                       // line 3
...
const { object } = await generateObject({                  // line 48
  model: groq(MODEL_ID),
  schema: flashcardsOutputSchema,
  system: SYSTEM_PROMPT,
  prompt: `Text:\n${inputText}`,
});
return new Response(JSON.stringify(object), { status: 200, ... });   // line 55
```

- **Still functional in `ai@6.0.208`.** `generateObject` is exported and works; it is merely
  annotated `@deprecated` (removal slated for a future major). `generateText`, `Output.object`,
  and the `output` param carry no deprecation.
- **Not a deliberate choice.** No lesson note, plan, or research anywhere in `context/`,
  `.github/`, `.claude/` frames staying on `generateObject` as intentional. The impl-review
  follow-up (`context/archive/2026-09-09-study-fsrs-scheduling-integrity/follow-ups/review-fixes.md`
  F1 step 3) only *speculates* it "might be an m3l1 decision" and says: verify — if deliberate,
  `eslint-disable`; if not, migrate. No such m3l1 decision exists. The switch to `generateObject`
  happened silently at implementation time (edge-spike commit `a0db215`; original plan
  specified `streamObject`).
- **`change.md:24` explicitly names suppression as the anti-pattern**: "making lint blocking
  by suppressing/`eslint-disable`-ing the 3 manual violations instead of fixing them."

**Recommended fix — migrate to `generateText` + `Output.object`** (touches only this file):
```ts
import { generateText, Output } from "ai";
...
const { output } = await generateText({
  model: groq(MODEL_ID),
  output: Output.object({ schema: flashcardsOutputSchema }),
  system: SYSTEM_PROMPT,
  prompt: `Text:\n${inputText}`,
});
return new Response(JSON.stringify(output), { status: 200, ... });
```

**Does this disturb the AI-generation test suite? No.**
- `tests/api/generate-flashcards.test.ts` asserts **only** `response.status` and the JSON body
  (`{ error: "AI generation failed" }`) plus provider call-counts. It never asserts on
  `NoObjectGeneratedError` or any error class — that name appears only in comments
  (`generate-flashcards.test.ts:75, :182`; `tests/helpers/ai-mock.ts:17-20`).
- The endpoint's `catch` (`generate-flashcards.ts:59-64`) collapses every error to
  `500 { error: "AI generation failed" }`, so the error class never reaches an assertion.
- Underlying behavior is preserved: schema mismatch / non-JSON still throws
  `NoObjectGeneratedError` via `Output.object().parseCompleteOutput()`; retry counts (3× vs
  1×), abort passthrough, and the hang case are all in the shared `doGenerate` wrapper used by
  both functions.
- The provider mock seam (`vi.mock("@ai-sdk/groq")`) is untouched — no test imports
  `generateObject` as a value.
- One un-covered nuance: if a model finishes with `finishReason: "length"`, `generateText`'s
  `.output` getter throws `NoOutputGeneratedError` instead of `NoObjectGeneratedError` — both
  still land in the same generic `catch` → `500`.

Fallback if the team wants zero behavior delta: `test-plan.md` §6.1 (lines 159-160) sanctions
`// eslint-disable-next-line @typescript-eslint/no-deprecated` **with an explanatory comment**
for deprecated third-party APIs — but this directly contradicts `change.md:24`, so migration
is the better call.

### C. Unit-only test job — the `globalSetup` blocker and the config split

`vitest.config.ts` (12 lines):
```ts
export default getViteConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/setup/global-setup.ts"],
    testTimeout: 15000,
    passWithNoTests: true,
  },
});
```

`tests/setup/global-setup.ts` (77 lines):
- `loadEnv({ path: ".env.test", override: true })` (line 16)
- throws if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing (lines 18-26)
- `assertLocalSupabaseUrl()` — throws unless hostname is `127.0.0.1`/`localhost` (line 28, 65-76)
- builds a service-role client and calls `admin.auth.admin.createUser()` for `TEST_USER_A`/`B`
  — live network I/O (lines 30-36)

Vitest runs `globalSetup` once per run **regardless of `include` or CLI file args**.
**Verified**: with `.env.test` moved aside, `npx vitest run tests/lib/fsrs.test.ts` fails in
`TestProject._initializeGlobalSetup` before any test executes.

`tests/lib` file import graphs (both zero-Supabase, zero-network):
- `tests/lib/fsrs.test.ts`: `vitest`; `@/lib/services/fsrs` (imports only `ts-fsrs` + type-only
  `@/types`); type-only `@/types` (zero imports).
- `tests/lib/inactive-accounts.test.ts`: `vitest`; `@/lib/inactive-accounts` (zero imports —
  pure date arithmetic). Sets `process.env.TZ = "UTC"` in-file (test line 28), no setup file
  needed.

**Options for the split (ranked):**

- **Option A (recommended) — `vitest.config.unit.ts` + `test:unit` script.**
  ```ts
  import { getViteConfig } from "astro/config";
  export default getViteConfig({
    test: {
      environment: "node",
      include: ["tests/lib/**/*.test.ts"],
      passWithNoTests: true,   // no globalSetup
    },
  });
  ```
  `package.json`: `"test:unit": "vitest run --config vitest.config.unit.ts"`. Keep
  `getViteConfig` so the `@/*` alias resolves as in the app; `astro.config.mjs:21` already
  guards the Cloudflare adapter behind `process.env.VITEST` (Vitest sets this automatically).
  Smallest diff; the loud fail-fast in `global-setup.ts` stays intact for the local
  integration flow. Cost: two config files sharing conventions.

- **Option B — Vitest 4 `test.projects`.** `vitest@4.1.11` is installed; v4 removed
  `vitest.workspace.ts` so `test.projects` is the API. Requires moving `globalSetup` **off**
  the root config and onto an `integration` project only (a root `globalSetup` still runs for
  all projects). Bigger refactor of a green file for a marginal single-config payoff.

- **Option C — env-gate `global-setup.ts`.** Guard the Supabase block behind an
  env flag. Weakens the deliberate fail-fast (someone forgetting the flag locally would
  silently run integration tests with no Supabase). Least attractive.

Component tests (`tests/components/*.test.tsx`) opt into jsdom per-file via
`// @vitest-environment jsdom` docblock — a `tests/lib`-only config never touches jsdom.

### D. The flaky `study-review.test.ts` 2.4 test — root cause + options

**Test (`tests/api/study-review.test.ts:172-183`):**
```ts
it("2.4 kontrola pozytywna §D.1 — równoległy double-submit chroniony przez CAS ...", async () => {
  const id = await createCard();
  const [a, b] = await Promise.all([review(id, "good"), review(id, "good")]);
  const statuses = [a.status, b.status].sort((x, y) => x - y);
  expect(statuses).toEqual([200, 409]);           // <-- fails intermittently: got [200, 200]
  const row = (await queueRows("all")).find((f) => f.id === id);
  expect(row?.repetitions).toBe(1);
});
```

**Endpoint CAS (`src/pages/api/study/review.ts:45-84`):**
1. `SELECT ... WHERE id = ? AND user_id = ?` → reads `current.last_review`.
2. `updates = scheduleReview(current, rating, new Date())`.
3. `UPDATE ... WHERE id = ? AND user_id = ?` **AND** (`last_review IS NULL` if it was null,
   else `last_review = <value read>`), `.select().single()`.
4. If the update matches 0 rows → `PGRST116` → `409 "Conflict: card was modified concurrently"`.

The `409` arises **only** when request A's UPDATE commits (setting `last_review` to a non-null
timestamp) *before* request B's UPDATE runs — so B's `WHERE last_review IS NULL` matches
nothing. If instead A's whole round-trip finishes before B's `SELECT`, then B reads the new
`last_review`, computes from post-review state, and its CAS `WHERE last_review = <A's value>`
matches → `200`. Result `[200, 200]`, and the card has been reviewed **twice** — which is the
exact sequential-replay behavior that test **2.3 documents as a known regression**
(`study-review.test.ts:135-170`).

So 2.4 is a positive control whose pass condition (a caught race) depends on real wall-clock
interleaving of two async requests against a shared Postgres. `Promise.all` starts both
handlers but does not guarantee they overlap at the DB. Under full-suite load (13 parallel
test files, shared test users) the two requests can fully serialize.

**Observed:** failed once in ~6 full-suite `npm run test` runs; passed all other full runs and
all 3 isolated runs. Low-rate intermittent.

**Options for the plan (this is integration-layer, not in the CI gate — a follow-up, not a
blocker):**

1. **Relax to an invariant assertion.** Accept `[200, 409]` OR `[200, 200]`, then assert the
   thing that actually matters — no lost update / no torn write: after both settle, exactly
   one of {`repetitions === 1` (race caught) , `repetitions === 2` (sequential replay, same as
   2.3)} and `lapses`/`due_date` are internally consistent with whichever path ran. Loses the
   "CAS specifically fired" signal.
2. **Retry / loop N times**, assert the `409` path is hit at least once across iterations.
   Reduces but does not eliminate flakiness; slower.
3. **Test the CAS at the DB layer instead** — two overlapping transactions / a direct
   conditional `UPDATE` race, bypassing the HTTP handler. Deterministic; different (lower)
   layer than the rest of the file.
4. **Force overlap via an injected seam** — an optional `await`-able delay in the handler
   between SELECT and UPDATE, enabled only under test. Invasive to production code.
5. **Quarantine 2.4** (`it.skip` / a `@flaky` tag) with a comment pointing here, until a
   future phase that puts integration in CI needs it solid.

Recommendation for `/10x-plan`: option 1 or 3. Do **not** let this expand Phase 5 scope —
note it as a follow-up on the study-review change.

### E. The "typecheck" gate is not actually wired

`test-plan.md` §5 lists a gate **"lint + typecheck"** as "wymagana (już okablowana)". This is
inaccurate for the "typecheck" half:

- No `typecheck` / `check` script in `package.json`.
- `@astrojs/check@^0.9.8` **is** a dependency but is invoked nowhere (no script, not in any
  workflow).
- `npm run build` (`astro build`) does **not** run `tsc` or `astro check` — a type error that
  doesn't break bundling passes the build. `astro sync` only *generates* `.astro/` types; it
  doesn't check.
- **Lint is the only type enforcement in CI.** `eslint.config.js:14-15` extends
  `tseslint.configs.strictTypeChecked` + `stylisticTypeChecked` with `projectService: true`,
  so `npm run lint` does full type-informed analysis and catches type errors that surface as
  rule violations (`no-unsafe-*`, `no-floating-promises`, etc.).

**Implication:** "typecheck" is folded into lint, not a separate wired gate. The plan should
either (a) correct the §5 wording to say so, or (b) add `astro check` (dep already installed)
as a real `typecheck` script + CI step — that would be net-new, not "już okablowana". A true
`tsc --noEmit` / `astro check` catches things lint rules don't (unused exports, unreachable
type errors in `.astro` files, structural mismatches that never trip a rule).

### F. Branch protection & the "required" half of "required gate"

- No repo-tree config — GitHub branch protection / required status checks are server-side.
- `origin` = `https://github.com/andrzejkukurykeuropa/10x-cards.git`.
- `gh` CLI: installed (v2.93.0) but **not authenticated** (`gh auth status` → "not logged
  into any GitHub hosts"). Can't script or read branch protection without `gh auth login`
  first.
- To make the gate *required*, two independent things are needed:
  1. the workflow produces a named check (if unit tests become a **step** in job `ci`, the
     check name stays `ci`; if a **separate job**, the job name is the check name);
  2. that check name is added to `master`'s required status checks in GitHub Settings →
     Branches (manual, or `gh api .../branches/master/protection` after auth).
- **Naming caution:** if the check is later renamed (e.g. `ci` → `lint-build` + `unit-tests`),
  branch protection keeps waiting on the old name forever (blocks all merges). If the plan
  restructures jobs, it must update branch protection in the same step.
- **Job structure decision for the plan:** keep unit tests as a step inside `ci` (simplest,
  one required check) vs. split into a parallel `unit-tests` job (isolates a slow/flaky test
  concern — though integration isn't in CI anyway, so the upside is small).

### G. "Required gate" blocks merges, not deploys

Cloudflare Pages deploys are **fully independent** of GitHub Actions:
- `ci.yml:3-6`: "Deployment is handled exclusively by Cloudflare Pages Git integration
  (master branch → production, PR branches → preview URLs). Do NOT add a deploy step here."
- `context/changes/deployment/deployment-plan.md:9`: "Auto-deploy na `master` obsługuje
  wyłącznie natywna integracja Git Cloudflare Pages. Żaden zewnętrzny system CI/CD ... nie
  może deployować. CI służy tylko jako quality gate (lint + build)."
- `deployment-plan.md:11-14`: GitHub Actions CI and Cloudflare Pages deploy run **in
  parallel**, not chained. `deployment-plan.md:417-420` (Faza 7): "Upewnić się że CI nie ma
  kroku deploy — to celowe."
- Cloudflare Pages runs its own `npm run build` on its infra, triggered by the GitHub push
  webhook.

**Consequence:** a red CI run does not stop a production deploy directly — but production only
ever receives what is merged to `master`, so a **required** check that blocks the PR merge is
an effective production gate *in practice*. Preview deploys of a red PR branch will still
happen. The plan should state "required gate = merge-blocker" plainly and not imply it gates
deployment mechanically.

## Code References

- `.github/workflows/ci.yml:1-30` — current CI (lint + build only, no tests)
- `.github/workflows/ci.yml:3-6` — "do not add deploy step" comment
- `vitest.config.ts:1-12` — single config; `include` covers `.ts`+`.tsx`; `globalSetup`;
  `passWithNoTests: true`
- `tests/setup/global-setup.ts:16-36` — `.env.test` load, hard throw on missing Supabase env,
  local-URL assertion, service-role `createUser`
- `tests/setup/global-setup.ts:65-76` — `assertLocalSupabaseUrl`
- `tests/lib/fsrs.test.ts:1-3` — imports (vitest + `@/lib/services/fsrs` + type-only)
- `tests/lib/inactive-accounts.test.ts:1-2, :28` — imports + `process.env.TZ = "UTC"`
- `package.json:11-14` — `lint` / `lint:fix` / `test` / `test:watch` scripts (no `typecheck`)
- `package.json:68` — `vitest ^4.1.11`
- `eslint.config.js:14-19` — `strictTypeChecked` + `stylisticTypeChecked` + `projectService`
- `eslint.config.js:1` — file-wide `no-deprecated` disable for `tseslint.config()` (precedent)
- `src/pages/api/generate-flashcards.ts:3, :46-64` — `generateObject` import + call + generic
  `catch` → `500 {"error":"AI generation failed"}`
- `src/pages/api/admin/cleanup-inactive-accounts.ts:93-94` — the two `?? null` lines (only :94
  is flagged)
- `src/pages/api/admin/cleanup-inactive-accounts.ts:118` — `user_metadata?.` unnecessary
  optional chain; contrast `:140` same field without `?.`
- `src/lib/inactive-accounts.ts:18-22, :50-54` — `isInactiveForDeletion` / `isInWarningWindow`
  signatures (`createdAt: string | null = null`)
- `src/pages/api/study/review.ts:45-84` — SELECT → `scheduleReview` → CAS UPDATE → 409 on
  `PGRST116`
- `tests/api/study-review.test.ts:172-183` — flaky test 2.4
- `tests/api/study-review.test.ts:135-170` — test 2.3 (documented sequential-replay regression)
- `tests/api/generate-flashcards.test.ts:105-106, :120-123, :131-133, :147-149` — assertions
  check status + body only, never an error class

## Architecture Insights

- **`getViteConfig()` from `astro/config` is the project's test-config idiom** — chosen in
  Phase 1 so `astro:env/server` and the `@/*` alias resolve identically to the app with no
  extra config. Any new unit config should keep it.
- **`astro.config.mjs:21` guards the Cloudflare adapter behind `process.env.VITEST`** — an
  unplanned Phase-1 addendum; the adapter's Vite plugin sets `resolve.external` which
  collides with Vitest's `node` environment. Vitest sets `VITEST` automatically.
- **Integration tests are deliberately parallel + id-scoped.** `fileParallelism` is *not*
  disabled; the two static test users (`TEST_USER_A/B`) are shared across all files, so every
  assertion is `rows.find(r => r.id === ...)` and every created row is registered to
  `createdIds` immediately after `201` for `afterEach` cleanup (test-plan §6.2 point 6). This
  is also *why* 2.4 is flaky — the shared parallel load changes request interleaving.
- **CI is a merge gate, not a deploy gate, by design** — deployment ownership sits entirely
  with Cloudflare Pages Git integration (Module 1 Lesson 5 / `deployment-plan.md`).

## Historical Context (from prior changes)

- `context/archive/2026-09-02-auth-access-control-coverage/plan.md:138-273` — "Faza 1:
  Infrastruktura testowa". Added `vitest` + `test`/`test:watch` scripts (explicitly noting
  `vitest run` is "używane lokalnie i w przyszłej bramie CI z Fazy 5"), `vitest.config.ts`
  via `getViteConfig()`, `.env.test`(.example), `tests/setup/global-setup.ts`,
  `tests/helpers/*`. Lines 84-90: "Nie wpinamy testów do `.github/workflows/ci.yml` w tej
  fazie — to zadanie §3 Faza 5". Lines 611-621: the `astro.config.mjs` VITEST-guard addendum.
- `context/archive/2026-09-08-ai-generation-reliability/plan.md:74-78, :215-217, :269` — added
  `jsdom` + `@testing-library/{react,dom}` devDeps, broadened `vitest.config.ts` `include` to
  `{ts,tsx}`, kept global `environment: node` with per-file jsdom docblocks. `research.md:435`:
  no `fileParallelism: false` — id-scoping is the deliberate alternative.
- `context/archive/2026-09-09-study-fsrs-scheduling-integrity/follow-ups/review-fixes.md` (F1)
  — the origin of this phase's lint-debt prerequisite. Triage decision "Fix A — document the
  debt, open a separate change". Step 3 flags the `generateObject` question (verify m3l1 →
  disable or migrate).
- `context/changes/deployment/deployment-plan.md:9-14, :91-93, :417-420` — CI/deploy
  separation; Cloudflare Pages GitHub App does its own build.
- `context/foundation/infrastructure.md:84, :157` — Cloudflare Pages auto-builds every branch
  push + preview URLs.

## Related Research

- `context/archive/2026-09-02-auth-access-control-coverage/research.md` — test infra baseline
  (profil `none`, zero test files before Phase 1)
- `context/archive/2026-09-08-ai-generation-reliability/research.md:332-341` — vitest include /
  jsdom stack change
- `context/foundation/test-plan.md` §6.6 "Dług lintu blokujący §3 Faza 5" (lines ~435-446),
  §6.1 (unit-test cookbook), §6.2 (integration-test cookbook), §5 (quality-gates table)

## Open Questions

1. **Is CI currently red on `origin/master`?** The `src/components/ui/*` prettier debt
   predates `origin/master`'s tip. The plan's step 1 should be to check the last CI run and
   confirm `npm run lint:fix` + the 3 manual fixes bring it fully green — not to assume a
   green baseline. (Local `master` is 11 commits ahead of `origin/master`, all unpushed
   Phase 3–4 work; pushing it will also trigger CI.)
2. **Unit tests as a step in job `ci`, or a separate parallel job?** Step = one required
   check, simplest. Separate job = cleaner separation but more branch-protection surface.
3. **Fix the §5 "typecheck" inaccuracy by wording, or by adding a real `astro check` step?**
   The dep is installed; a real structural typecheck catches things type-aware lint doesn't.
4. **`generateObject` → `generateText`+`Output.object` migration** — accepted here as
   low-risk and test-safe, but it is a production code change riding in a "gates, no new test
   code" phase. Confirm the plan is comfortable folding it in (the alternative, `eslint-disable`,
   is explicitly ruled out by `change.md:24`).
5. **Flaky 2.4** — pick option 1 (invariant assertion) or 3 (DB-layer race test); track as a
   follow-up on the study-fsrs change, not in Phase 5 scope.
6. **`.nvmrc` (`v22.14.0`) vs `ci.yml` (`22`) mismatch** — align in the new job or leave;
   cosmetic.
