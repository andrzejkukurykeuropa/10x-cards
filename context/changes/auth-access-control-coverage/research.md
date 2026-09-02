---
date: 2026-09-02T22:12:40+02:00
researcher: AndrzejKukuryk
git_commit: 2cfbe51
branch: master
repository: andrzejkukurykeuropa/10x-cards
topic: "Auth and access-control coverage (test-plan.md §3 Phase 1, risks #1 and #3)"
tags: [research, codebase, auth, middleware, rls, access-control, supabase]
status: complete
last_updated: 2026-09-02
last_updated_by: AndrzejKukuryk
---

# Research: Auth and access-control coverage

**Date**: 2026-09-02T22:12:40+02:00
**Researcher**: AndrzejKukuryk
**Git Commit**: 2cfbe51
**Branch**: master
**Repository**: andrzejkukurykeuropa/10x-cards

## Research Question

Ground `context/foundation/test-plan.md` §3 Phase 1 ("Auth and access-control coverage",
risks #1 and #3) in the current codebase: how does session authentication /
route protection work, how is per-user data isolation enforced (RLS +
application code), where are the highest-risk bypass paths, and what test
coverage currently exists — to prepare a concrete test plan for this phase.

## Summary

- Auth/session resolution happens once per request in `src/middleware.ts`,
  which attaches a Supabase `User` or `null` to `context.locals.user` and
  redirects unauthenticated requests away from three protected page prefixes
  (`/dashboard`, `/study`, `/settings`). It does **not** protect any `/api/*`
  route — each API endpoint must check `context.locals.user` itself.
- Per-user data isolation is enforced **twice**: by Postgres RLS policies on
  the single user-owned table (`flashcards`, all four operations covered),
  and redundantly by explicit `.eq("user_id", user.id)` filters in every
  flashcard/study API route. No collection/deck or generation-record tables
  exist yet, so RLS scope is currently limited to `flashcards`.
- The only RLS-bypassing client (`createAdminClient()` / service-role key) is
  used solely for account deletion and inactive-account cleanup — not for
  flashcard access — so it's a secondary, not primary, risk for #3.
- Zero test files or test tooling exist anywhere in the repo today, confirming
  the test-plan's `none` baseline for this phase.
- Prior changes (flashcard schema, collection edit/delete, study session,
  account deletion/retention) already established the RLS-per-operation and
  app-level `user_id` filtering pattern this phase should verify, not
  reinvent.

## Detailed Findings

### 1. Session middleware & route protection (risk #1)

- `PROTECTED_ROUTES = ["/dashboard", "/study", "/settings"]` (`src/middleware.ts:4`).
- Runs on every request via Astro's `onRequest` (`src/middleware.ts:6`); builds
  the SSR Supabase client from request headers/cookies (`src/middleware.ts:7`).
- Calls `supabase.auth.getUser()`; sets `context.locals.user` to the resolved
  user or `null` (`src/middleware.ts:9-13`). If Supabase is unconfigured,
  `createClient()` returns `null` and `locals.user` is explicitly `null`
  (`src/middleware.ts:14-16`).
- Protection check is **prefix matching** on pathname
  (`src/middleware.ts:18`) — so `/dashboard/foo` matches, but so would a
  hypothetical `/dashboard-anything` (edge case worth a test).
- Unauthenticated + protected → redirect to `/auth/signin`
  (`src/middleware.ts:19-21`); otherwise `next()` (`src/middleware.ts:24`).
- **Gap**: no explicit handling of a rejected `getUser()` promise — an error
  would abort middleware rather than degrade to `user: null`
  (`src/middleware.ts:10-13`).
- API routes are **not** in `PROTECTED_ROUTES`; they rely entirely on their
  own `context.locals.user` check (see consumer list below).

### 2. Supabase SSR client & cookies

- `src/lib/supabase.ts:3` reads `SUPABASE_URL`/`SUPABASE_KEY` from
  `astro:env/server`; returns `null` if either is missing
  (`src/lib/supabase.ts:5-7`).
- Cookies are parsed from the raw `Cookie` header via `parseCookieHeader`
  (`src/lib/supabase.ts:10-15`) with **no try/catch** for malformed cookies.
- Cookie writes (sign-in, refresh, sign-out) flow through a shared `setAll()`
  callback into Astro's `cookies.set()` (`src/lib/supabase.ts:16-20`) — this
  is the single choke point for session state changes across all auth flows.

### 3. Auth API contracts (`src/pages/api/auth/*`)

- **signin.ts**: `POST` only; reads `email`/`password` from form data
  (`:4-7`); redirects to `/auth/signin?error=...` on missing config or
  Supabase error (`:10-12`, `:16-18`); redirects to `/` on success (`:20`).
- **signup.ts**: same shape; passes `emailRedirectTo: <origin>/api/auth/confirm`
  (`:14-17`); redirects to `/auth/confirm-email` on success (`:23`).
- **signout.ts**: `POST` only; calls `signOut()` if configured but **ignores
  errors** and always redirects to `/` (`:6-9`) — sign-out is not
  observably distinguishable from a no-op failure.
- `src/pages/api/auth/confirm.ts` is intentionally unprotected (email
  confirmation deep link) and is not in `PROTECTED_ROUTES`.

### 4. Pages consuming `Astro.locals.user`

- `dashboard.astro` destructures `user` from `Astro.locals` and renders
  `user?.email` with **no independent auth check or redirect**
  (`src/pages/dashboard.astro:6,16-18`) — protection is 100% delegated to
  middleware. If middleware were ever bypassed/misconfigured for this route,
  the page would silently render with an undefined email instead of failing
  closed.
- `signin.astro` / `signup.astro` only read the `error` query param; they do
  not inspect `Astro.locals.user`.

### 5. RLS policies (risk #3)

Only one user-owned table exists: `flashcards`
(`supabase/migrations/20260610000000_create_flashcards.sql`).

- RLS enabled at `:29`; `user_id uuid NOT NULL REFERENCES auth.users(id)` at `:12`.
- All four operations have a policy, each constrained to `auth.uid() = user_id`:
  SELECT (`:31-33`), INSERT (`:35-37`), UPDATE (`:39-42`), DELETE (`:44-46`).
- No operation is missing; no other user-owned table exists yet (no
  collections/decks/generation-record tables in any migration).

### 6. Service-role (RLS-bypassing) client usage

- `src/lib/supabase-admin.ts:12-19` (`createAdminClient()`) uses
  `SUPABASE_SERVICE_ROLE_KEY` and explicitly documents that it bypasses RLS
  (`:5-9`).
- Used only in:
  - `src/pages/api/account.ts:19` — self-deletion of the *currently
    authenticated* user (`admin.auth.admin.deleteUser(user.id)`), gated by
    an authenticated-user check at `:8-10`.
  - `src/pages/api/admin/cleanup-inactive-accounts.ts:48-51,84,105,136-138` —
    inactive-account enumeration/deletion/warning-metadata updates, gated by
    a bearer-secret check (`:25-45`) and `isInactiveForDeletion()` classification
    (`src/lib/inactive-accounts.ts:20-27`).
- **Neither path directly reads/writes another user's `flashcards` rows** —
  cascading deletion (`ON DELETE CASCADE` on `flashcards.user_id`) removes a
  deleted account's own cards. This is the highest-risk bypass surface but is
  currently scoped narrowly.

### 7. Application-level authorization (defense in depth beyond RLS)

Every flashcard/study API route double-enforces ownership beyond RLS:

- `src/pages/api/flashcards.ts:27` (GET `.eq("user_id", user.id)`), `:69-74`
  (POST sets `user_id: user.id`).
- `src/pages/api/flashcards/[id].ts:50-56` (PATCH), `:89-94` (DELETE) — both
  filter by `.eq("id", id).eq("user_id", user.id)`.
- `src/pages/api/study/queue.ts:25` — `.eq("user_id", user.id)`.
- `src/pages/api/study/review.ts:48` (read), `:72-77` (update, plus an
  optimistic-lock condition on `last_review` that is a concurrency guard,
  not an authorization check).

`context.locals.user` consumers (i.e., routes that must be exercised for
auth-bypass tests): `src/pages/api/account.ts:8`,
`src/pages/api/flashcards.ts:13,43`, `src/pages/api/generate-flashcards.ts:24`,
`src/pages/api/study/queue.ts:13`, `src/pages/api/study/review.ts:19`,
`src/pages/api/flashcards/[id].ts:17,74`.

### 8. Existing test coverage

- No `*.test.*`/`*.spec.*` files anywhere outside dependencies; no
  Vitest/Jest config; no `test` script in `package.json`. Confirms the
  test-plan's `none` baseline (`context/foundation/test-plan.md` §4).

## Code References

- `src/middleware.ts:1-24` - route-protection + user resolution
- `src/lib/supabase.ts:1-20` - SSR client construction, cookie parse/write
- `src/pages/api/auth/signin.ts:1-21`, `signup.ts:1-24`, `signout.ts:1-10` - auth contracts
- `src/pages/dashboard.astro:1-32` - protected page relying purely on middleware
- `supabase/migrations/20260610000000_create_flashcards.sql:12,29-46` - RLS policies
- `src/lib/supabase-admin.ts:2-19` - service-role client (RLS bypass)
- `src/pages/api/account.ts:8-19` - self-deletion via admin client
- `src/pages/api/admin/cleanup-inactive-accounts.ts:25-138` - inactive-account cleanup via admin client
- `src/lib/inactive-accounts.ts:10-83` - pure classification helpers, no client
- `src/pages/api/flashcards.ts:13,27,43,69-74` - list/create, user-scoped
- `src/pages/api/flashcards/[id].ts:17,50-56,74,89-94` - update/delete, user-scoped
- `src/pages/api/study/queue.ts:13,25` - queue read, user-scoped
- `src/pages/api/study/review.ts:19,48,72-77` - review read/update, user-scoped

## Architecture Insights

- **Belt-and-suspenders authorization**: the app never relies on RLS alone —
  every data-access route also filters by `user.id` in application code. A
  good test pattern is therefore two-layered: (a) verify the app-level filter
  rejects/returns-empty for a non-owner, and (b) verify RLS itself would deny
  a raw cross-user query if the app-level filter were ever removed/forgotten
  (regression insurance against exactly that class of mistake).
- **Route protection vs. API protection are different mechanisms**: page
  routes are covered by middleware prefix-matching; API routes are covered
  ad hoc per-endpoint via `locals.user` checks. Any new API route is at risk
  of forgetting this check — middleware provides no safety net for `/api/*`.
- **Single choke point for cookies** (`src/lib/supabase.ts` `setAll()`) means
  an integration test hitting the real cookie flow (signin → protected page →
  signout) exercises signin, session persistence, and signout cookie clearing
  in one pass — likely the cheapest way to cover risk #1's "session integrity"
  concern end-to-end without e2e tooling.

## Historical Context (from prior changes)

- `context/archive/2026-06-10-flashcard-schema/plan.md:5,17-18,41,48,56,73,88-106`
  — established the RLS-per-operation pattern this phase should verify.
- `context/archive/2026-07-07-collection-edit-delete/plan.md:5,9,26,41,71-72,176,181-183`
  — confirms the app-level `.eq("user_id", user.id)` convention alongside RLS.
- `context/archive/2026-08-02-study-session/plan.md:5,187,324-325,416`
  — `/study` is a protected page; unauthenticated → redirect to `/auth/signin`.
- `context/archive/2026-08-04-account-deletion-retention/plan.md:9,15-16,57,90-92,133,150,206,222,239,241,286-297`
  and `.../reviews/impl-review.md:23-40,56-64,66-83,90-110`
  — service_role restricted to server-side admin ops; prior review flagged
  edge cases (null `last_sign_in_at`, silent sign-out failures, pagination
  during deletion, warning-email dedup, timing side-channel on secret compare)
  that remain relevant context for risk #3/#6 boundary but are **not** in this
  phase's scope (risks #1/#3 only).
- `context/foundation/prd.md:98-100` — Access Control: "flat model — every
  logged-in user only accesses their own flashcards; unauthenticated users
  get no access beyond signup/signin."
- `context/changes/deployment/deployment-plan.md:17,160,409` — reiterates
  service_role bypasses RLS and must never be exposed client-side.

## Related Research

None yet — this is the first research document for this change.

## Open Questions

- Should the prefix-matching bug risk (`/dashboard-anything` matching
  `/dashboard`) be covered as a regression test, or is it out of scope for
  this phase (no known route collides with it today)?
- `signout.ts` swallows `signOut()` errors — is "always redirect to `/`"
  the intended contract, or should failed sign-out be observable? Worth a
  test either way to lock in current behavior.
- No collections/decks or generation-record tables exist yet, so risk #3
  coverage is currently limited to `flashcards`; revisit if those tables land
  before this phase is implemented.
