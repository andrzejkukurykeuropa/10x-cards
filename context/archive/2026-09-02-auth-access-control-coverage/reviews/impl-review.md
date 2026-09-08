<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pokrycie testami dostępu/autoryzacji (Faza 1 wdrożenia testów)

- **Plan**: `context/changes/auth-access-control-coverage/plan.md`
- **Scope**: Phase 1-4 of 4 (full plan)
- **Date**: 2026-09-03
- **Verdict**: REJECTED
- **Findings**: 1 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Test global-setup can silently target the wrong Supabase project with service-role actions

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `tests/setup/global-setup.ts:12` (`loadEnv({ path: ".env.test" })`), `tests/helpers/test-session.ts:61-67` (`cleanupFlashcards` service-role client)
- **Detail**: `dotenv`'s `config()` does not override variables already present in `process.env` by default. `global-setup.ts` reads generic `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` names — the same names the production build and CI use (per repo's CI notes, `SUPABASE_URL`/`SUPABASE_KEY` are required repository secrets for the build step). If a test run ever happens in a shell/CI job where those variables are already exported for a real (staging/prod) Supabase project, `.env.test` is silently ignored and this suite creates users / deletes `flashcards` rows against the real project using the service-role key — a destructive, unrecoverable action. This is not hypothetical: `test-plan.md` §3 Phase 5 ("Quality-gates wiring") explicitly plans to wire this test suite into CI, where real project secrets are already present in the job environment before `globalSetup` runs.
- **Fix**: Before any admin call in `global-setup.ts`, assert the resolved `SUPABASE_URL` points at the local instance (e.g. hostname is `127.0.0.1`/`localhost`, or matches the local `supabase/config.toml` project ref) and throw immediately if not; additionally load `.env.test` with `{ path: ".env.test", override: true }` so a local `.env.test` always wins over any inherited shell/CI variable for local runs.
  - Strength: Fails fast and loudly before any destructive call, closing the gap before Phase 5 wires this into CI.
  - Tradeoff: One more environment check to maintain; needs a documented "what does local look like" constant.
  - Confidence: HIGH — the risk is structural (env var precedence), not implementation-specific, and the guard is a small, isolated addition.
  - Blind spot: Have not confirmed the exact local Supabase URL/ref format is stable across `supabase start` runs on all contributors' machines.
- **Decision**: FIXED — added `assertLocalSupabaseUrl()` guard (throws unless hostname is `127.0.0.1`/`localhost`) called from `global-setup.ts` before user creation and from `test-session.ts` before both `signInAsTestUser()` and `cleanupFlashcards()`'s service-role client construction; `.env.test` now loaded with `override: true`. Verified: `npm run test` (23/23 passing) and `npx eslint tests` (clean).

### F2 — Default Vitest file parallelism plus shared, persistent test users risks cross-file races

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `vitest.config.ts:5-10`
- **Detail**: `vitest.config.ts` does not set `fileParallelism: false` or a single-threaded pool. By default Vitest runs test files concurrently. This suite deliberately shares two persistent accounts (`TEST_USER_A`/`TEST_USER_B`) and one real `flashcards` table across `flashcards-isolation.test.ts` and `study-isolation.test.ts` (both create/delete rows for the same two users). Today's assertions are ID-scoped so a single clean run passed, but concurrent file execution against the same live Postgres instance is a latent source of flaky failures as the suite grows (e.g. two files racing to create/cleanup rows for the same user at the same time).
- **Fix**: Set `test.fileParallelism = false` in `vitest.config.ts` for this integration suite (acceptable given `testTimeout: 15000` already anticipates slower, serialized runs), or scope this via `poolOptions.threads.singleThread: true`.
- **Decision**: SKIPPED

### F3 — Sign-in helper duplicates the production Supabase client factory instead of reusing it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `tests/helpers/test-session.ts:23-37` vs. `src/lib/supabase.ts:5-21`
- **Detail**: The plan's "Krytyczne szczegóły implementacji" section specifies session replay must use "tą samą fabryką `createClient()` co produkcja" (the same `createClient()` factory as production). The implementation instead re-calls `createServerClient()` directly with its own in-memory cookie wiring, rather than importing and calling the actual exported `createClient(requestHeaders, cookies)` from `src/lib/supabase.ts`. Behavior matches today, but if `src/lib/supabase.ts` changes (e.g. additional client options, different null-handling), the test helper will not automatically follow, silently reintroducing exactly the kind of production/test mismatch the plan's critical detail was written to prevent.
- **Fix**: Refactor `signInAsTestUser()` to call the real `createClient()` from `src/lib/supabase.ts`, passing a `Headers` built from the in-memory cookie store and an `AstroCookies`-compatible object with a 3-arg `.set(name, value, options)` (see F6 — the two fixes are complementary).
  - Strength: Restores the "same factory as production" guarantee the plan explicitly relied on; removes a maintenance footgun.
  - Tradeoff: Requires extending `createCookieJar()`'s `.set()` signature first (F6) and adapting the `Headers`/`AstroCookies` shapes exactly.
  - Confidence: HIGH — `src/lib/supabase.ts`'s `createClient` signature is small and the test helper already reimplements its internals faithfully.
  - Blind spot: Have not verified whether `AstroCookies`' concrete type has methods beyond `.set()` that the real `createClient()` call site requires at the type level (may need a cast, as `api-context.ts` already does for `APIContext`).
- **Decision**: SKIPPED

### F4 — Study isolation test asserts fewer scheduling fields than the plan promised

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `tests/api/study-isolation.test.ts:75-89`
- **Detail**: The plan's Phase 3 item 2 says the non-owner attempt must leave "pola harmonogramu FSRS fiszki A ... niezmienione" and names `due_date`, `stability` explicitly as examples, with the positive control expected to show those same fields changing. The implementation only asserts `last_review` and `state` in the negative case, and only `last_review` in the positive case — a narrower check than described (though still directionally correct, since the negative case's `404` already proves the endpoint never reached the update statement).
- **Fix**: Add assertions on `due_date`, `stability`, `difficulty`, and `scheduled_days` (unchanged for B's attempt, changed after A's successful review) alongside the existing `last_review`/`state` checks, matching the field list named in the plan.
- **Decision**: SKIPPED

### F5 — Unplanned/stale documentation: astro.config.mjs adaptation undocumented, test-plan.md rollout status stale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `astro.config.mjs:17-25`; `context/foundation/test-plan.md:78`
- **Detail**: Phase 1's "Wymagane zmiany" never listed `astro.config.mjs`, but the implementation added a `process.env.VITEST` conditional skipping the Cloudflare adapter (needed because `getViteConfig()` pulls in the full Astro config, and the adapter's Vite plugin conflicts with Vitest's `node` environment — a real, well-commented necessity, confirmed by reverting it and re-running `npm run test`, which fails without the conditional). This is a reasonable adaptation but was never captured as a plan addendum. Separately, `test-plan.md` §3's Phase 1 row still reads `implementing` even though all 4 phases and their Progress checkboxes are now complete — it should read `complete`.
- **Fix**: Add a one-line addendum note to `plan.md` (or `research.md`) documenting the `astro.config.mjs` adapter-skip necessity, and update `test-plan.md` §3's Phase 1 row status to `complete`.
- **Decision**: FIXED — added an "Addendum" section to `plan.md` documenting the `astro.config.mjs` adapter-skip necessity (verified by reverting it and re-running `npm run test`), and updated `test-plan.md` §3's Phase 1 row status to `complete`.

### F6 — Fake cookie jar's `.set()` signature is narrower than the contract the plan specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `tests/helpers/api-context.ts:17-19`
- **Detail**: The plan's Phase 1 item 6 specifies `createCookieJar()` returns an object with `.set(name, value, options)` matching what `cookies.set()` is called with in `src/lib/supabase.ts`'s `setAll()` callback. The implementation's `.set(name: string, value: string)` only accepts two parameters; it works today because JS silently drops the extra `options` argument callers pass, but the helper's declared type doesn't reflect the real call site's shape and would reject a third argument under `--strict` if a caller destructured it.
- **Fix**: Add an optional third `options` parameter to `.set()` (store it alongside the value, even if unused for serialization) so the signature matches the plan's stated contract and `src/lib/supabase.ts`'s actual call shape.
- **Decision**: FIXED — `createCookieJar().set()` now accepts an optional third `options?: AstroCookieSetOptions` parameter (imported from `"astro"`), matching the real `cookies.set()` signature. Verified: `npx tsc --noEmit` shows no new errors, `npm run test` (23/23) and `npx eslint tests` pass.

### F7 — Flashcard cleanup ID tracking is captured after the success assertion, not before

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/api/flashcards-isolation.test.ts:37-38`, `tests/api/study-isolation.test.ts:37-38`
- **Detail**: `createFlashcardAsA()` asserts `response.status === 201` before parsing the body and pushing the new id into `createdIds`. If a row is actually created but the endpoint returns an unexpected status (a bug elsewhere), the `expect` throws before the id is recorded, and `afterEach`'s `cleanupFlashcards(createdIds.splice(0))` never learns about that orphaned row.
- **Fix**: Not urgent — this only matters if the app itself regresses to returning a wrong status after a real insert; no action required now, worth a comment noting the assumption.
- **Decision**: SKIPPED

### F8 — Middleware test re-authenticates per case instead of once

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/middleware.test.ts:34-45`
- **Detail**: The parameterized "authenticated user passes through" case signs in fresh via `signInAsTestUser()` for each of the three protected routes tested, adding avoidable real HTTP round-trips to local GoTrue.
- **Fix**: Sign in once in `beforeAll` and reuse the resulting `cookieHeader` across the three path cases.
- **Decision**: SKIPPED
