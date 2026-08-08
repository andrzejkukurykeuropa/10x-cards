<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Usuwanie konta i retencja danych (RODO)

- **Plan**: context/changes/account-deletion-retention/plan.md
- **Scope**: Phase 1-4 (full plan)
- **Date**: 2026-08-08
- **Verdict**: APPROVED (all findings triaged and fixed)
- **Findings**: 2 critical, 3 warnings, 2 observations — all FIXED

## Verdicts (post-triage)

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (fixed) |
| Scope Discipline | PASS |
| Safety & Quality | PASS (fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (build verified post-fix) |

## Findings

### F1 — Never-signed-in accounts are deleted immediately

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/inactive-accounts.ts:17-19
- **Detail**: `isInactiveForDeletion(lastSignInAt)` returns `true` whenever `lastSignInAt === null` (and also for any unparsable timestamp), regardless of `now`. Supabase leaves `last_sign_in_at` as `null` until a user's first sign-in — this includes freshly invited accounts, accounts created via `admin.createUser` awaiting confirmation, or accounts stuck mid-signup. On the very next `cleanup-inactive-accounts` run (daily, per the GitHub Actions schedule), any such account is classified as 24+ months inactive and permanently deleted, even though it may be hours old. This contradicts the plan's stated intent ("konta nieaktywne przez 24+ miesiące").
- **Fix A ⭐ Recommended**: Fall back to `candidate.created_at` when `last_sign_in_at` is null, applying the same 24-month threshold to account age instead of treating null as "infinitely inactive".
  - Strength: Matches the plan's actual intent (age/inactivity-based deletion) and requires no new persistence — `created_at` is already returned by `admin.listUsers()`.
  - Tradeoff: An account that signs up and never logs in will still be deleted after 24 months, which is arguably correct GDPR storage-limitation behavior.
  - Confidence: HIGH — `created_at` is a standard field on Supabase Auth user objects returned by `listUsers()`.
  - Blind spot: Doesn't handle the OAuth edge case where `last_sign_in_at` is set at creation time (not applicable here since app doesn't use OAuth per current codebase).
- **Fix B**: Treat `null` `last_sign_in_at` as "not eligible" (skip / never classify as inactive) until it's set.
  - Strength: Simplest, smallest diff — one-line change.
  - Tradeoff: Never-logged-in accounts accumulate forever, silently defeating the storage-limitation goal for that account class.
  - Confidence: MEDIUM — safe short-term but likely reintroduces the retention problem the feature exists to solve.
  - Blind spot: No data on how many real accounts would be affected in production.
- **Decision**: FIXED via Fix A — `isInactiveForDeletion`/`isInWarningWindow` now accept a `createdAt` fallback parameter; call site in `cleanup-inactive-accounts.ts` passes `candidate.created_at` alongside `last_sign_in_at`.

### F2 — Production schedule never performs real deletions/warnings (dryRun default mismatch)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/admin/cleanup-inactive-accounts.ts:44, .github/workflows/cleanup-inactive-accounts.yml:14-20
- **Detail**: The plan specifies `dryRun` ("true"/"false", default "false"). The implementation instead computes `dryRun = searchParams.get("dryRun") !== "false"`, so *any* request without an explicit `dryRun=false` — including the scheduled GitHub Actions `curl` call, which passes no query string at all — runs in dry-run mode. The daily cron therefore never actually deletes inactive accounts or sends warning e-mails in production; it silently no-ops forever.
- **Fix**: Change the default to match the plan (`dryRun = searchParams.get("dryRun") === "true"`) and update the workflow's curl call to be explicit anyway (append `?dryRun=false`) as defense in depth.
  - Strength: Restores the plan's documented default and makes the production workflow's intent explicit and self-documenting; either change alone fixes the bug, doing both prevents recurrence if one is reverted.
  - Tradeoff: None meaningful — this is a straightforward correction back to spec.
  - Confidence: HIGH — plan text is unambiguous about the default, and the workflow's missing query param confirms the bug is live.
  - Blind spot: None significant.
- **Decision**: FIXED — `dryRun` default changed to `searchParams.get("dryRun") === "true"`; workflow curl call now appends `?dryRun=false` explicitly.

### F3 — Session sign-out silently skipped if session client is unavailable

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/account.ts:25-28
- **Detail**: Plan step 5 says "po sukcesie, użyj zwykłego klienta sesji (createClient) do signOut()" unconditionally. The implementation instead does `if (supabase) { await supabase.auth.signOut(); }`, silently doing nothing if `createClient()` returns null. The account is already deleted at that point so this isn't a security hole, but the skip is unlogged — if it ever triggers, there's no visibility that the sign-out step didn't run.
- **Fix**: Log a `console.error`/`console.warn` when `supabase` is null so the skipped sign-out is observable, matching the logging discipline used elsewhere in this file.
- **Decision**: FIXED — added `console.error` logging in the else branch when the session client is unavailable.

### F4 — Deletions during paginated `listUsers()` iteration can skip accounts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/cleanup-inactive-accounts.ts:54-84
- **Detail**: The endpoint pages through `admin.listUsers({ page, perPage })` and deletes matching accounts inline, in the same loop. Offset/page-based pagination over a list that shrinks as accounts are deleted mid-iteration can shift later pages forward, causing some eligible accounts to be skipped in a given run.
- **Fix A ⭐ Recommended**: Accept the risk as self-healing — since the job runs daily via cron, any account skipped in one run is picked up (and still correctly classified) on the next run; document this behavior with a code comment.
  - Strength: Zero implementation cost; matches the plan's explicit choice not to add complexity like a job queue for this "small scale" project.
  - Tradeoff: A skipped account's actual deletion date can lag the 24-month threshold by up to one extra day per skip; acceptable for a storage-limitation job with no real-time requirement.
  - Confidence: MEDIUM — depends on how often deletions actually cause a page-shift skip in practice (rare unless many accounts cross the threshold in the same run).
  - Blind spot: Not measured against real production account volumes.
- **Fix B**: Collect all candidate user IDs across all pages first (read-only pass), then process deletions/warnings in a second pass over the collected list.
  - Strength: Eliminates the skip risk entirely.
  - Tradeoff: Doubles memory usage for the user list and adds complexity; still doesn't fully protect against accounts created between pass 1 and pass 2 (edge case, acceptable).
  - Confidence: MEDIUM — straightforward but changes the endpoint's structure more than the plan called for.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added a code comment documenting the accepted self-healing behavior (daily cron re-processes any skipped account).

### F5 — Warning e-mail resent daily throughout the entire 23-24 month window

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/cleanup-inactive-accounts.ts:92-112
- **Detail**: `isInWarningWindow` re-evaluates purely from `last_sign_in_at` on every run, with no record of whether a warning was already sent. Since the cron runs daily and the window spans ~30 days, an account in the window receives a fresh magic-link warning e-mail every single day until it logs in or crosses into deletion — a poor user experience and noisy for the Supabase Auth mailer.
- **Fix A ⭐ Recommended**: Persist a `retention_warning_sent_at` marker in the user's `user_metadata` via `admin.updateUserById()` after a successful warning send, and skip re-sending if already set within the window.
  - Strength: No new database table needed (the plan explicitly excludes a `deletion_audit_log`); `user_metadata` is already an admin-writable field on the same Supabase Auth user object.
  - Tradeoff: Slightly more admin API calls per warned account (one extra `updateUserById` per send).
  - Confidence: MEDIUM — clean approach, but adds a small amount of state the original plan didn't scope.
  - Blind spot: Doesn't reset the marker if account activity later re-enters the warning window a second time (unlikely in practice since logging in exits the window entirely).
- **Fix B**: Accept as a known limitation — document that repeated warnings are expected/intentional (arguably even desirable, functioning as a daily reminder).
  - Strength: Zero implementation cost, stays exactly within the plan's stated scope (no new persisted state).
  - Tradeoff: Users may find daily emails annoying; slightly increases Supabase's magic-link e-mail volume.
  - Confidence: MEDIUM — acceptable for an MVP at "small scale", per `prd.md`.
  - Blind spot: No user feedback data on whether daily reminders are perceived as helpful or spammy.
- **Decision**: FIXED via Fix A — added a `retention_warning_sent_at` marker in `user_metadata`, written via `admin.updateUserById()` after a successful `signInWithOtp` send; subsequent runs skip re-sending while the marker is present.

### F6 — Naive string comparison for cleanup endpoint bearer secret

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/cleanup-inactive-accounts.ts:27
- **Detail**: The `Authorization` header is checked with a plain `!==` comparison against the expected bearer value. This is a minor timing side-channel compared to a constant-time comparison, though the practical risk on a Cloudflare Worker is low.
- **Fix**: Compare using a constant-time check (e.g. `crypto.timingSafeEqual` after normalizing/padding lengths, or Web Crypto equivalent available in the Workers runtime).
- **Decision**: FIXED — replaced naive `!==` comparison with a constant-time `timingSafeEqual` helper (Web Crypto compatible, works in the Cloudflare Workers runtime).

### F7 — Cleanup response body leaks user IDs into CI logs

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/cleanup-inactive-accounts.yml:12-20, src/pages/api/admin/cleanup-inactive-accounts.ts (response body)
- **Detail**: `curl --show-error` prints the response body (including `deleted`/`warned` arrays of user IDs) into the GitHub Actions run log by default. This puts user identifiers into CI logs, which may be visible to anyone with repo/workflow-log access.
- **Fix**: Have the workflow discard/redirect the response body (e.g. `-o /dev/null`) or have the endpoint return only counts by default, exposing full ID lists only via an explicit verbose flag.
- **Decision**: FIXED — workflow curl call now uses `-o /dev/null` (with `--silent --show-error` to still surface real errors), discarding the response body from CI logs while `--fail` still fails the job on non-2xx.
