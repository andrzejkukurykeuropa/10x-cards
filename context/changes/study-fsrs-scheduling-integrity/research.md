---
date: 2026-09-09T00:17:02+02:00
researcher: Andrzej Kukuryk
git_commit: 786a76df86aa6b593744577749efabb8806705bc
branch: master
repository: 10x-cards
topic: "Study/FSRS scheduling integrity — Risk #4 (test-plan §3 Phase 3)"
tags: [research, codebase, fsrs, study, scheduling, review-endpoint, queue-endpoint, sm2-migration]
status: complete
last_updated: 2026-09-09
last_updated_by: Andrzej Kukuryk
---

# Research: Study/FSRS scheduling integrity — Risk #4

**Date**: 2026-09-09T00:17:02+02:00
**Researcher**: Andrzej Kukuryk
**Git Commit**: 786a76df86aa6b593744577749efabb8806705bc (local, not yet pushed — file:line refs are local)
**Branch**: master
**Repository**: 10x-cards

## Research Question

Rollout Phase 3 of `context/foundation/test-plan.md`: **"Study/FSRS scheduling integrity"**, covering
**Risk #4** — *Logika harmonogramowania FSRS uszkadza stan powtórek lub pokazuje karty w złej
kolejności, a użytkownik traci postęp nauki* (Wysoki × Średnie).

Risk-response intent from `change.md` and `test-plan.md` §2 #4:

- **Prove**: a completed review updates the schedule fields of the **correct** card, and the
  due-queue reflects it — repeated runs never move an already-scheduled card backward.
- **Challenge**: "the correctness of `ts-fsrs` implies our review endpoint wires it correctly."
- **Ground via research**: request/response contract of `study/review.ts` and `study/queue.ts`;
  FSRS field mapping after the SM-2→FSRS migration; the ordering guarantee of the due-card query.
- **Avoid anti-pattern**: copied production calculation (asserting the same formula the code
  computes) — derive the expected schedule independently.

## Summary

The library is wired **substantially correctly** — grade mapping, the `CardInput` shape, the
numeric-enum ↔ DB-label round-trip, and the `reps`↔`repetitions` name difference are all handled,
and a single genuine concurrent double-submit is caught with a `409`. But the "did the endpoint
wire it correctly / does the queue reflect it" surface has **four concrete integrity gaps**, three
of which map directly to the two halves of Risk #4 ("wrong order" and "loses progress"):

1. **The due-queue has no defined order at all.** `GET /api/study/queue` issues *no* `.order()`
   clause, and the client then applies a Fisher–Yates shuffle on top. "Cards in the wrong order"
   is not a latent risk — there is no order to violate. `.limit(500)` additionally truncates large
   due sets to an arbitrary, unordered 500.
2. **A sequential replay of an already-completed review re-grades the card.** The `last_review`
   compare-and-swap in `review.ts` is a *lost-update* guard, not an *idempotency* guard. A client
   retry after a `200` (dropped response, Back button, offline-queue replay) re-reads the *fresh*
   post-review row and applies a second grade. An extra `again` on a card already in `Review`
   transitions it to `Relearning` with a near-term `due_date` — i.e. **backward**. The endpoint
   never checks that the card is actually due or that it came from a queue.
3. **A client double-click fires two POSTs for the same card.** The `submitting` guard reads a
   `useRef` that is synced in a `useEffect` (not synchronously), and `disabled={state.submitting}`
   only takes effect after a re-render. Two clicks in one tick both pass. The second request gets a
   `409`, whose `catch` handler then paints a spurious error banner on the *next* card and drops
   that rating from the counts.
4. **Migration + drift subtleties worth pinning as documented snapshots**: the SM-2→FSRS migration
   hard-resets every existing card (`repetitions = 0, due_date = now()`, memory state to column
   defaults); intervals are *rolling 24h* from the button press, not calendar-day; `elapsed_days`
   is quantized to floored **UTC** calendar days inside `ts-fsrs`.

Cheapest layers per the test-plan: **unit** for the `scheduleReview` field mapping (expected
schedule derived independently), **integration** for the full review-endpoint round-trip using the
Phase 1 harness (`tests/api/study-isolation.test.ts` is the ready-made template — it already
imports both handlers).

## Detailed Findings

### A. The FSRS service — `src/lib/services/fsrs.ts`

Single 60-line module; the only scheduling logic in the repo. Library: **`ts-fsrs` `^5.4.1`**
(`package.json:41`), lock-resolved to exactly `5.4.1`, which implements the **FSRS-6** algorithm
(`node_modules/ts-fsrs/dist/index.mjs:513`).

- **Scheduler singleton** (`src/lib/services/fsrs.ts:8`):
  `export const scheduler = fsrs(generatorParameters({ enable_short_term: false }));`
  The *only* override is `enable_short_term: false`. Everything else is library default
  (`index.mjs:641-659`): `request_retention = 0.9` (`index.mjs:503`, never set by us),
  `enable_fuzz = false` (`index.mjs:505` → intervals are deterministic, no random spread),
  `maximum_interval = 36500` (`index.mjs:504`), the 21-element FSRS-6 default weight vector
  `w` (`index.mjs:520-541`, decay `w[20] = FSRS6_DEFAULT_DECAY = 0.1542`, never optimized).
  `learning_steps = ["1m","10m"]` / `relearning_steps = ["10m"]` are set but **inert** because
  `enable_short_term:false`.
- **`enable_short_term: false` → `LongTermScheduler`** (`index.mjs:1458-1459`, instead of
  `BasicScheduler`). Every grade sends the card straight to `State.Review` with a whole-day
  interval; `learningState()` just delegates to `reviewState()` (`index.mjs:1216-1218`,
  `1272-1278`). So `Learning`/`Relearning` are effectively **never persisted** even though the DB
  enum and TS union include them (`src/lib/services/fsrs.ts:4-7` documents this intent). This is
  the fix for the historical "learning_steps mapping schedules in minutes not days" pitfall (see
  Historical Context).
- **`flashcardToCardInput(row, now)`** (`src/lib/services/fsrs.ts:28-41`): builds the `ts-fsrs`
  `CardInput`. `due: row.due_date ?? now` (NULL due ⇒ "review now"); `elapsed_days: 0` and
  `learning_steps: 0` are hardcoded (harmless — `AbstractScheduler.init()` recomputes
  `elapsed_days` from `last_review` vs `now`, `index.mjs:361-369`); `state` passed as the raw DB
  string and converted by `ts-fsrs` `TypeConvert.state()` (DB enum labels match `StateType`
  exactly, so the round-trip is safe).
- **Grade mapping** (`src/lib/services/fsrs.ts:10-15`):
  `again→Again(1), hard→Hard(2), good→Good(3), easy→Easy(4)`.
- **`scheduleReview(row, rating, now)`** (`src/lib/services/fsrs.ts:46-59`): calls
  `scheduler.next(flashcardToCardInput(row, now), now, RATING_TO_GRADE[rating])`, uses **only**
  `result.card` (the `.log` / review-log is **discarded** — there is no review-history table), and
  maps back to:
  `due_date: card.due.toISOString()`, `stability`, `difficulty`, `scheduled_days`,
  `repetitions: card.reps` (**name differs**), `lapses`, `state: State[card.state]` (numeric enum
  → DB label via the reverse map), `last_review: card.last_review ? …toISOString() : null`
  (non-null after any grade, because `init()` stamps `last_review = now`).

### B. Three-way field mapping (ts-fsrs `Card` ↔ DB column ↔ `src/types.ts`)

`Flashcard` type at `src/types.ts:3-18`; `FsrsState` union (`"New"|"Learning"|"Review"|"Relearning"`)
at `src/types.ts:1` (a **type-only** union, not a runtime enum — deliberate, `types.ts` has zero
runtime enums). `FlashcardDto = Omit<Flashcard,"user_id">` (`src/types.ts:20`) — **all FSRS fields
are sent to the browser**.

| ts-fsrs `Card` | DB column (type) | `src/types.ts` | Read | Write |
|---|---|---|---|---|
| `due` | `due_date timestamptz NULL` | `due_date: string \| null` | `fsrs.ts:30` | `fsrs.ts:51` |
| `stability` | `stability double precision NOT NULL DEFAULT 0 CHECK (>= 0)` | `stability: number` | `fsrs.ts:31` | `fsrs.ts:52` |
| `difficulty` | `difficulty double precision NOT NULL DEFAULT 0 CHECK (0..10)` | `difficulty: number` | `fsrs.ts:32` | `fsrs.ts:53` |
| `scheduled_days` | `scheduled_days integer NOT NULL DEFAULT 0` | `scheduled_days: number` | `fsrs.ts:35` | `fsrs.ts:54` |
| `reps` | `repetitions integer NOT NULL DEFAULT 0` | `repetitions: number` | `fsrs.ts:37` | `fsrs.ts:55` — **`reps` ⟷ `repetitions`** |
| `lapses` | `lapses integer NOT NULL DEFAULT 0 CHECK (>= 0)` | `lapses: number` | `fsrs.ts:38` | `fsrs.ts:56` |
| `state` | `state fsrs_state NOT NULL DEFAULT 'New'` | `state: FsrsState` | `fsrs.ts:38` (str→enum) | `fsrs.ts:56` (`State[card.state]` enum→str) |
| `last_review` | `last_review timestamptz NULL` | `last_review: string \| null` | `fsrs.ts:39` | `fsrs.ts:57` |
| `elapsed_days` (deprecated) | not persisted | — | hardcoded `0` | not written |
| `learning_steps` | not persisted | — | hardcoded `0` | not written |

Column subsets: `SRS_COLUMNS` (`review.ts:11`) read before scheduling = the 8 FSRS fields (this
is exactly the `FsrsRow` `Pick` in `fsrs.ts:17-20`); `STUDY_QUEUE_COLUMNS` (`review.ts:9`,
`queue.ts:7-8`, verbatim
`"id, question, answer, due_date, stability, difficulty, state, lapses, last_review, scheduled_days, repetitions"`)
returned to client.

DB indexes: `flashcards_due_date_idx` on `due_date` (added with the SM-2 fields),
`flashcards_user_id_idx` on `user_id`. There is **no unique constraint** related to reviews and
**no `version` / optimistic-lock column** beyond the app-level reuse of `last_review` as a CAS token.

### Shared auth context for both endpoints

- Supabase client (`src/lib/supabase.ts:5-24`): `createServerClient(SUPABASE_URL, SUPABASE_KEY, …)`
  bound to request cookies. `SUPABASE_KEY` is the **anon/publishable** key; the service-role key is
  a separate `SUPABASE_SERVICE_ROLE_KEY` used only by admin routes (`.env.example:4-5`). So both
  study endpoints run **as the authenticated user — RLS is in force.**
- `context.locals.user` is resolved in `src/middleware.ts:6-16` via `supabase.auth.getUser()`.
  `/study` is in `PROTECTED_ROUTES` (`src/middleware.ts:4`) but the API routes under `/api/**` are
  **not** — each endpoint re-checks `context.locals.user` itself and returns `401`.
- RLS on `flashcards` (`supabase/migrations/20260610000000_create_flashcards.sql:29-46`):
  per-operation policies; SELECT `USING (auth.uid() = user_id)`, UPDATE
  `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`.

### C. `GET /api/study/queue` — `src/pages/api/study/queue.ts`

- `GET`, `prerender = false` (`queue.ts:5`). Input: `mode` query param,
  `z.enum(["due","all"]).catch("due")` (`queue.ts:10`, `:23`) — any missing/invalid value
  silently becomes `"due"`. Response: bare JSON array of rows (`queue.ts:39`). Status: `401`
  no user (`:15`), `503` no client (`:20`), `500` DB error (`:36`), `200` (`:40`).
- Read only, RLS in force (cookie-bound anon client, `src/lib/supabase.ts:5-24`) **plus** an
  explicit `.eq("user_id", user.id)` (`queue.ts:25`).
- Due predicate (`queue.ts:27-29`):
  `query.or(\`due_date.is.null,due_date.lte.${new Date().toISOString()}\`)` — a card is due if
  `due_date IS NULL` (never-reviewed) or `due_date <= now`. **"now" = server clock** at request
  time; no client-supplied time param anywhere.
- **Ordering: there is NO `.order(...)` call.** The chain is
  `.select(...).eq(...).or(...).limit(500)`. Result order is whatever Postgres returns
  (physical-scan order), no tie-breaker, non-deterministic.
- `.limit(500)` (`queue.ts:31`) is a hard cap with no pagination — a user with >500 due cards gets
  an arbitrary unordered subset of 500 and the rest are invisible.
- No snapshot token / cursor is returned; nothing ties a later review back to the queue that
  produced it.

### D. `POST /api/study/review` — `src/pages/api/study/review.ts`

- `POST`, `prerender = false` (`review.ts:6`). Schema (`review.ts:13-16`):
  `z.object({ id: z.uuid(), rating: z.enum(["again","hard","good","easy"]) })`.
- Status codes: `401` (`:21`), `503` (`:26`), `422` bad JSON (`:33`) or zod failure with
  `z.treeifyError` (`:38-40`), `404` card not found for this user (`selectError.code ===
  "PGRST116"`, `:53-54`), `500` select/schedule/update error (`:58, :67, :88`), `409`
  `"Conflict: card was modified concurrently"` (`updateError.code === "PGRST116"` on the UPDATE,
  `:81-84`), `200` with the full updated row (`:91-92`).
- **Read** (`review.ts:45-50`): `.select(SRS_COLUMNS).eq("id", id).eq("user_id", user.id).single()`.
- **Compute** (`review.ts:63`): `scheduleReview(current, rating, new Date())` runs **in JS between
  the two DB round-trips** — wrapped in try/catch → `500` (historical fix F3).
- **Write** (`review.ts:72-78`): `.update(updates).eq("id", id).eq("user_id", user.id)` then
  a compare-and-swap predicate:
  `current.last_review === null ? .is("last_review", null) : .eq("last_review", current.last_review)`,
  then `.select(STUDY_QUEUE_COLUMNS).single()`. Update is **strictly keyed to the target `id` +
  `user_id`** (+ RLS + the CAS). `updates` sets exactly the 8 FSRS fields; the
  `set_flashcards_updated_at` trigger also bumps `updated_at`.
- **No DB transaction.** SELECT and UPDATE are two independent PostgREST calls.

#### D.1 Concurrent double-submit (two tabs / true parallel) — PROTECTED
Both requests read state `S0` with `last_review = L0`. First UPDATE succeeds, moves `last_review`
to `L1`. Second UPDATE's `.eq("last_review", L0)` matches 0 rows → `PGRST116` → `409`
(`review.ts:80-85`). No lost update, no double application. This is the historical F2 fix
(`context/archive/2026-08-02-study-session/reviews/impl-review.md`).

#### D.2 Sequential replay of a completed review — NOT PROTECTED (core Risk #4 gap)
After a `200`, the row is in post-review state `S1` with `last_review = L1`. A second request for
the same `id` (client retry after a dropped response, user hits Back and re-rates, offline-queue
replay) re-reads `S1`, computes a **fresh** FSRS schedule from `S1`, and its CAS predicate
`.eq("last_review", L1)` still matches (nothing changed since this read) → the UPDATE **succeeds**
and the card is graded a second time.

- The endpoint **never checks that the card was due** (`due_date <= now`) or that it appeared in a
  queue. A card can be graded arbitrarily many times back-to-back.
- Directional effect: a duplicate `again` on a card already advanced into `Review` with
  `due_date = now + N days` transitions it to `Relearning` with a near-term `due_date` — the
  schedule moves **backward** and the user loses progress. Repeated `good`/`easy` duplicates
  inflate `stability`/`due_date` forward. Either way the schedule is corrupted by the replay.
- `last_review` has ms precision (`new Date()`, `review.ts:63`), so two genuinely sequential
  reviews always get distinct CAS tokens — the lock never coalesces them.

#### D.3 TOCTOU window and stale-queue interaction
The window is SELECT (`review.ts:45`) → compute in JS (`:63`) → UPDATE (`:78`), with no
`FOR UPDATE` / RPC / transaction. A concurrent writer that changes `last_review` in that window is
caught by the CAS → `409`. A concurrent change that does **not** touch `last_review` (e.g. a
question/answer edit via `flashcards/[id].ts`) is **not** detected — but it also doesn't affect
scheduling fields. Between `GET /api/study/queue` and a later `POST /api/study/review` there is no
coupling and no locking: `review.ts` ignores whatever the client sends beyond `id` and re-reads
the row fresh, so a stale queue from another tab submitting a review for an already-reviewed card
either fails the CAS (if its own read is stale) or succeeds against fresh state and re-grades
(§D.2).

### E. `StudySession.tsx` — the client (`src/components/StudySession.tsx`, 299 lines, self-contained)

Mounted once via `<StudySession client:load />` at `src/pages/study.astro:19`. No
`src/components/hooks/` dir exists; no study child components (only `Button` from
`src/components/ui/button` is imported). All logic is in this one file.

**State shape**: one `useState<SessionState>` (`:47`), a discriminated union on `status` —
`mode-select | loading | error | empty | session | summary` (`:7-23`). The `session` payload:
`{ mode, queue: FlashcardDto[], index: number, revealed, submitting, submitError, ratingCounts:
Record<StudyRating, number>, confirmingExit }` (`:12-22`); `summary` payload: `{ reviewed,
ratingCounts }` (`:23`). Current card = `state.queue[state.index]` (render `:235`); progress label
`Karta {state.index + 1} z {state.queue.length}` (`:242`). Plus `stateRef = useRef(state)` (`:49`)
mirrored by `useEffect(…, [state])` (`:50-52`).

- **Queue load**: `handleSelectMode(mode)` (`:54-81`), fired only on click of a mode button
  (`:149-151`), `fetch(\`/api/study/queue?mode=${mode}\`)` (`:58`). Not in any `useEffect` — no
  auto-load, no StrictMode double-fetch. `data.length === 0` → `{status:"empty"}`.
- **Client-side ordering**: a one-time **Fisher–Yates `shuffle(data)`** at `:70` (`shuffle` at
  `:35-42`) when the session is created. Displayed order therefore never matches the server
  response (which is itself unordered — §C). No re-sort after a grade; `queue` array is created
  once and never mutated, only `index` increments (`:119-132`).
- **No in-session requeue**: a card rated `again` is treated exactly like `good`/`easy` —
  `index++`, never re-inserted. Session length is fixed at `queue.length` from the start
  (`reviewed: latest.queue.length`, `:131`). (Deliberate — `study-session/plan.md:50-57`.)
- **Submit**: `handleRate(rating)` (`:99-140`) → `fetch("/api/study/review", { method:"POST",
  body: JSON.stringify({ id: card.id, rating }) })` (`:107-113`). **No optimistic update** —
  `submitting:true` (`:104`) only sets a spinner; `index`/`ratingCounts` advance strictly after
  `res.ok`. The success response body is **ignored** (client never reads `res.json()` on success).
- **On failure** (`catch`, `:133-139`): banner `{submitError} — wybierz ocenę ponownie poniżej.`
  (`:278-280`). No auto-retry. Card stays at the same `index`, `revealed` stays `true`, buttons
  re-enable, user manually re-rates → fresh POST for the **same `card.id`** (feeds §D.2). Any
  non-2xx (`409`, `404`, `422`, `5xx`) is thrown and handled identically as a generic error.

#### E.1 Double-click race (Risk #4 — "wrong order" / lost rating)
The guard is `if (current.status !== "session" || current.submitting) return;` (`:101`), reading
`stateRef.current`. But `stateRef` is synced in a `useEffect` (`:49-52`,
`useEffect(() => { stateRef.current = state; }, [state])`) — **on commit, not synchronously** —
and `disabled={state.submitting}` (`:289`) also only applies after a re-render. Two clicks in the
same tick (e.g. on two different rating buttons) both read `submitting:false` and **both fire
`fetch`**. Server: first UPDATE commits, second's CAS misses → `409`. Client: the success handler
advances `index` (from possibly-stale `stateRef.current` at `:115`), then the `409` `catch` runs
`setState` on `prev` — now the **next** card — painting a spurious error banner on it and dropping
that rating from `ratingCounts`. Promise-resolution order is nondeterministic. Correct fix would be
a synchronously-set `useRef` flag at the top of `handleRate`.

#### E.2 Post-await stale-ref on the success path
`:115` `const latest = stateRef.current;` relies on the passive effect having flushed during the
network round-trip (normally true — network ≫ effect latency — but a timing assumption, not a
guarantee). `nextIndex = latest.index + 1` is derived from it.

### F. The SM-2 → FSRS migration

Three migrations touch the schedule (naming `YYYYMMDDHHmmss_*.sql`):

1. `supabase/migrations/20260610000000_create_flashcards.sql` — creates `flashcards` with **no
   scheduling fields** (just `id, user_id, question, answer, created_at, updated_at`, lines 11-18).
   RLS enabled, per-operation policies (lines 29-46): SELECT/UPDATE `USING (auth.uid() = user_id)`,
   UPDATE adds `WITH CHECK (auth.uid() = user_id)`.
2. `supabase/migrations/20260708000000_add_sm2_fields_to_flashcards.sql` — SM-2 phase: adds
   `due_date timestamptz NULL`, `easiness_factor NUMERIC(4,2) DEFAULT 2.50`, `interval integer
   DEFAULT 0`, `repetitions integer DEFAULT 0`; `CREATE INDEX flashcards_due_date_idx ON
   flashcards (due_date)`.
3. `supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql` — SM-2→FSRS:
   - `CREATE TYPE fsrs_state AS ENUM ('New','Learning','Review','Relearning')` (guarded by
     `pg_type` check).
   - **Drops** `easiness_factor`, `interval`. **Keeps** `due_date`, `repetitions` (semantics
     change to FSRS `reps`).
   - **Adds** `stability` (`CHECK >= 0`, default 0), `difficulty` (`CHECK 0..10`, default 0 —
     `CHECK` must allow 0 because `createEmptyCard()` sets `difficulty: 0`), `state` (default
     `'New'`), `lapses` (`CHECK >= 0`, default 0), `last_review timestamptz NULL`, `scheduled_days`
     (default 0).
   - **Hard reset of every existing row, no backfill**:
     `UPDATE flashcards SET repetitions = 0, due_date = now();` — comment: *"no SM-2 review history
     worth preserving in MVP."* Memory state falls to column defaults (`stability=0, difficulty=0,
     state='New', lapses=0, last_review=NULL, scheduled_days=0`). Every pre-existing card becomes a
     brand-new FSRS card due immediately.
- **No CHECK enforces the `state` ↔ `stability`/`difficulty` invariant.** A row with `state !=
  'New'` but `(0,0)` memory (or a partial `0`/non-`0` pair) would make `ts-fsrs` `next_state`
  throw `FSRSValidationError("Invalid memory state")` (`index.mjs:951-955`). Nothing in the current
  codebase can produce that state, but there is no DB guardrail.

### G. Drift analysis (only `POST /api/study/review` ever schedules)

- **"now"**: `new Date()` in the route (`review.ts:63`) — server wall clock on Cloudflare Workers
  (UTC). Consistent single timestamp per request. `init()` sets `last_review = now`, `reps += 1`
  (exactly +1 per successful review).
- **Interval → due**: pure ms arithmetic, `new Date(review_time.getTime() + interval * 86_400_000)`
  (`index.mjs:115-119`). **No normalization to midnight.** A card graded at 18:00 is due at 18:00
  N days later. Queue predicate `due_date.lte.<now>` ⇒ "1 day" = literally 24h from the button
  press — a **rolling-interval** design, not calendar-day. Worth pinning as a documented snapshot.
- **`scheduled_days`**: `clamp(max(1, round(stability * modifier)), 1, 36500)`; `enable_fuzz:false`
  ⇒ deterministic; `LongTermScheduler` enforces strict `again < hard < good < easy` ordering via
  `+1` bumps (`index.mjs:1244-1259`). Always integer ≥ 1, stored losslessly.
- **Rounding**: `ts-fsrs` internally `roundTo(x, 8)` (8 decimals, `index.mjs:223-226`, applied in
  `next_recall_stability` etc. `index.mjs:871,892,911`); `double precision` columns ⇒ no additional
  loss beyond FSRS's own 8-dp quantization.
- **First review of a `New` card** (`index.mjs:939-944`): `stability = init_stability(g)` (clamped
  to `INIT_S_MAX = 100`, `index.mjs:515-516,777`), `difficulty = clamp(init_difficulty(g), 1, 10)`
  (`index.mjs:841-845`) — note the library clamps difficulty to `1..10` while the DB `CHECK` is
  `0..10`, so post-review values are always well inside the DB constraint. The `(0,0)` memory of a
  freshly migrated/created card hits the "fresh card" init branch (`index.mjs:939-944`: `if (d === 0
  && s === 0)`).
- **`elapsed_days` quantization**: for a `Review`-state card, `init()` computes
  `dateDiffInDays(last_review, now)` = `floor((UTC_midnight(now) − UTC_midnight(last)) / 86400000)`
  (`index.mjs:227-242`) — **floored UTC calendar-day difference**. Consequences: (a) elapsed time
  feeding the forgetting curve is quantized to whole *UTC* days, so a user in a far-from-UTC
  timezone reviewing "next morning" can register `elapsed_days` of 0 or 2; (b) same-day repeat
  reviews give `elapsed_days = 0` and still move `stability` (grade ≥ 2 path,
  `index.mjs:958-975`). Upstream `ts-fsrs` behavior, not a repo bug — but it means a few hours of
  "now" drift around UTC midnight changes the computed schedule.
- **Timezone**: everything stored/compared as UTC ISO strings; `timestamptz` columns; no local-tz
  handling anywhere in `src/` (confirmed: no `Intl`/`toLocale*`/offset math in `StudySession.tsx`,
  `study.astro`, or any API route).

### H. Other consumers of the schedule fields (inventory)

- `src/pages/api/flashcards.ts:71` — `INSERT` sets only `user_id, question, answer`; all FSRS
  columns take DB defaults (`New` / `0` / NULL due). So new cards enter the queue via the
  `due_date IS NULL` branch.
- `src/pages/api/generate-flashcards.ts` — proposals only, **no INSERT**.
- `src/pages/api/flashcards/[id].ts` — PATCH of `question`/`answer` by convention; does not touch
  schedule fields (verify during planning if a schedule test depends on it).
- `tests/api/study-isolation.test.ts` — **existing** test. Imports `GET as studyQueueGet` from
  `@/pages/api/study/queue`, `POST as studyReviewPost` from `@/pages/api/study/review`, creates a
  card via `POST` from `@/pages/api/flashcards`, submits `{ id, rating: "good" }`, asserts on
  returned schedule fields. This is an **authz** test (other user's review leaves fields
  unchanged, lines 66-109; owner-reviews-own → 200 with `last_review` non-null, lines 96-111).
  **There is currently no test that verifies grade → stability/difficulty/due/interval output.**

## Code References

- `src/lib/services/fsrs.ts:8` — scheduler singleton, `enable_short_term: false` only override
- `src/lib/services/fsrs.ts:10-15` — `RATING_TO_GRADE` map
- `src/lib/services/fsrs.ts:17-20` — `FsrsRow` `Pick` (= `SRS_COLUMNS`)
- `src/lib/services/fsrs.ts:28-41` — `flashcardToCardInput`; hardcoded `elapsed_days:0`,
  `learning_steps:0`; `due: row.due_date ?? now`
- `src/lib/services/fsrs.ts:46-59` — `scheduleReview`; `.log` discarded; `reps`→`repetitions`,
  `State[card.state]`→label
- `src/types.ts:1` — `FsrsState` type-only union; `src/types.ts:3-20` — `Flashcard` / `FlashcardDto`
- `src/lib/supabase.ts:5-24` — SSR client, `SUPABASE_KEY` = anon key
- `src/middleware.ts:4,6-16` — `PROTECTED_ROUTES` (`/study`, not `/api/**`); `getUser()` → `locals.user`
- `src/pages/api/flashcards.ts:71` — INSERT sets only `user_id, question, answer`
- `src/pages/api/study/queue.ts:10,23` — `mode` = `z.enum(["due","all"]).catch("due")`
- `src/pages/api/study/queue.ts:25-31` — select / `.eq("user_id")` / `.or(due_date.is.null,…lte.now)` / `.limit(500)`, **no `.order()`**
- `src/pages/api/study/review.ts:13-16` — request schema
- `src/pages/api/study/review.ts:45-50` — SELECT current row by `id` + `user_id`
- `src/pages/api/study/review.ts:63` — `scheduleReview(current, rating, new Date())` in try/catch
- `src/pages/api/study/review.ts:70-85` — `last_review` CAS predicate + `409` on `PGRST116`
- `src/components/StudySession.tsx:35-42,70` — `shuffle` + one-time Fisher–Yates on the queue
- `src/components/StudySession.tsx:49-52` — `stateRef` synced via `useEffect` (root of §E.1)
- `src/components/StudySession.tsx:99-140` — `handleRate`: submit, advance-on-`res.ok`, `catch`
- `src/components/StudySession.tsx:101,289` — `submitting` guard + `disabled` (both post-commit)
- `src/pages/study.astro:19` — `<StudySession client:load />`
- `supabase/migrations/20260708000000_add_sm2_fields_to_flashcards.sql` — SM-2 fields + due index
- `supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql` — drop SM-2, add FSRS, hard reset
- `supabase/migrations/20260610000000_create_flashcards.sql:29-46` — RLS per-operation policies
- `tests/api/study-isolation.test.ts:16-28,66-111` — existing harness usage + template for Phase 3
- `vitest.config.ts` — `getViteConfig`, `environment:"node"`, `include: tests/**/*.test.{ts,tsx}`, `globalSetup` only
- `node_modules/ts-fsrs/dist/index.mjs:513` — `FSRSVersion = "v5.4.1 using FSRS-6.0"`
- `node_modules/ts-fsrs/dist/index.mjs:503-505,520-541` — defaults (`request_retention 0.9`,
  `enable_fuzz false`, `w` vector, `w[20]=0.1542`)
- `node_modules/ts-fsrs/dist/index.mjs:1458-1459` — `LongTermScheduler` selection
- `node_modules/ts-fsrs/dist/index.mjs:115-119` — `date_scheduler` (ms arithmetic, no midnight norm.)
- `node_modules/ts-fsrs/dist/index.mjs:227-242` — `dateDiffInDays` floored-UTC quantization
- `node_modules/ts-fsrs/dist/index.mjs:361-370` — `AbstractScheduler.init()` (`reps += 1`, `last_review = now`)
- `node_modules/ts-fsrs/dist/index.mjs:939-944` — fresh-card init branch (`d === 0 && s === 0`)
- `node_modules/ts-fsrs/dist/index.mjs:951-955` — `FSRSValidationError("Invalid memory state")`
- `node_modules/ts-fsrs/dist/index.mjs:1244-1259` — `LongTermScheduler` `again < hard < good < easy` `+1` bumps

## Architecture Insights

- **Mapping layer, not a wrapper class.** All FSRS logic is three pure functions in one module;
  the endpoint owns the read → compute → write orchestration and all error handling. The library
  is exercised for real on every review (no mock in production).
- **`enable_short_term: false` is load-bearing.** It collapses the 4-state model to a 2-state
  (`New` → `Review`) day-grained model and side-steps the `learning_steps`/`elapsed_days`
  `CardInput` requirements the DB can't satisfy. A test that flips this flag would see minute-grained
  intervals — a good "wired correctly" assertion boundary.
- **The only concurrency control is an app-level CAS on `last_review`.** No DB transaction, no
  `SELECT … FOR UPDATE`, no RPC. It correctly stops *parallel* double-submits but not *sequential*
  replays — the distinction is the crux of Risk #4's "loses progress" half.
- **The queue is a stateless point-in-time read with no ordering contract and a silent 500-row
  cap.** "Show cards in the right order" has no server-side definition to test against; the
  honest test pins the *absence* of a guarantee as a labeled regression (per §2 #4 anti-pattern
  guidance and the Phase-1/2 "labeled regression" convention).
- **Migration discarded all history by design.** Any schedule test starts from `state='New'`,
  which is also the only state `POST /api/flashcards` can create — so an integration test can
  build a realistic multi-review history only by calling `review.ts` repeatedly.
- **Anti-patterns that transfer from Phases 1-2** (per `test-plan.md:62,64`, `plan.md:355`,
  `ai-generation-reliability/plan.md:373-374`): (a) no implementation-mirror assertions — assert
  the observable HTTP contract (status + JSON body / persisted row), never "which line ran";
  (b) the real boundary must run — Phase 2 mocked only `@ai-sdk/groq` so real `generateObject` +
  zod still executed. The Phase-3 analogue: **do not mock `ts-fsrs`**, and do not re-run
  `scheduler.next` in the test to produce the "expected" value (that is the §2 #4 "skopiowana
  kalkulacja produkcyjna" anti-pattern) — derive the expected schedule independently.

## Historical Context (from prior changes)

- `context/archive/2026-08-02-study-session/plan.md:64-77` — **two documented "wired correctly"
  pitfalls** that Phase 3 should assert against:
  1. Missing `learning_steps` / deprecated `elapsed_days` in `CardInput` → without
     `enable_short_term:false` + `learning_steps:0/elapsed_days:0`, `Learning`/`Relearning` cards
     schedule in **minutes not days**, *silently* (`plan-brief.md:65`).
  2. `due_date IS NULL` for freshly created cards → the `queue?mode=due` `.or()` must treat NULL as
     "due now" or new cards never appear (`plan-brief.md:66`).
- `context/archive/2026-08-02-study-session/reviews/impl-review.md`:
  - **F2 (fixed)** — lost update in `review.ts`: parallel requests computed from the same stale
    state, last UPDATE dropped a rating. Fix = the `last_review` optimistic lock + `409`.
  - **F3 (fixed)** — `scheduleReview()` now in try/catch → `console.error` + `500`.
  - **F4 (fixed)** — `stateRef` was mutated during render; moved to `useEffect` (this is the exact
    code that now creates the §E.1 double-click gap — the effect-sync fixed a render-purity bug but
    is not a synchronous guard).
  - **F5 (SKIPPED, observation)** — no `.order()` in `GET /api/study/queue`; `.limit(500)` may
    systematically drop the oldest overdue cards for large collections. Deferred to future
    pagination work. → **still open; pin as labeled regression in Phase 3.**
  - **F1 (fixed)** — `state` must be a type-only string union in `src/types.ts`, not a runtime
    `enum` (rest of `types.ts` has zero runtime enums).
- `context/archive/2026-08-02-fsrs-schema-migration/` — migration F-03/F-04 rationale;
  `fsrs-schema-migration/plan.md:24`: `difficulty` `CHECK` must be `0..10` (not `1..10`) because
  `createEmptyCard()` sets `difficulty: 0` and the migration resets rows to it. F-03
  (`srs-schema`) impl-review F1: `interval` is a PostgreSQL **reserved word** — kept anyway, on
  the condition that S-04 uses the Supabase JS client, never raw SQL, to touch it. (The
  SM-2→FSRS migration later dropped `interval` entirely.)
- `context/archive/2026-08-02-study-session/research.md:41-55` + `ts-fsrs.md` — `ts-fsrs` (FSRS-6)
  chosen over SM-2 for algorithm quality (developer decision); SM-2 npm alternatives rejected.
  `ts-fsrs` core scheduler is pure TS, **edge/Workers-safe**; the separate
  `@open-spaced-repetition/binding` (WASM weight optimizer) is **not** edge-supported and is
  explicitly out of scope (`ts-fsrs.md:52-55`). `ts-fsrs` `Card` model (`ts-fsrs.md:9-21`):
  `due, stability, difficulty, elapsed_days (deprecated), scheduled_days, learning_steps, reps,
  lapses, state, last_review?`. `scheduler.next(card, now, Rating)` returns `{ card, log }` and
  **throws `FSRSValidationError`** on a bad rating/card/date — "to handle in the API route"
  (`ts-fsrs.md:48-50`). `repeat()` (preview all four outcomes) is deliberately unused.
- `context/archive/2026-09-08-ai-generation-reliability/research.md` §E (lines 253-261) — the
  `Flashcard` schema has **no `source`/provenance column**; AI-generated and manually created
  cards are indistinguishable in the DB. (Relevant if a schedule test wants to assert on card
  origin — it can't.)
- `context/archive/2026-08-04-ux-improvements/` (S-05) — added "Zakończ sesję" button + confirm
  panel to `StudySession.tsx` (no schema/endpoint change; `confirmingExit` state). impl-review:
  the button must be `disabled` while `state.submitting` (fixed). Manual test row
  (`plan.md:162,184`): ratings made before an early exit must be reflected in the SRS schedule on
  re-entry.
- `context/archive/2026-08-08-ui-improvements/` (S-07) — added a Topbar to `study.astro` only, no
  scheduling logic. `context/archive/2026-08-04-account-deletion-retention/` (S-06) — account
  deletion cascades to `flashcards` incl. FSRS fields; not scheduling logic.
- `context/foundation/lessons.md` — currently holds a single, **unfilled-template** lesson
  ("Scope creep w integracji layoutu", `Rule`/`Applies to` still `[uzupełnij]`). Not
  scheduling-related, but the study-session impl-review F1 hit that same "layout restructure
  beyond declared scope" pattern in `dashboard.astro`.
- **Phase 1 harness** (`context/archive/2026-09-02-auth-access-control-coverage/`, cookbook
  `test-plan.md` §6.2):
  - Runner: `vitest.config.ts` verbatim — `getViteConfig({ test: { environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"], globalSetup: ["tests/setup/global-setup.ts"],
    testTimeout: 15000, passWithNoTests: true } })`. `getViteConfig` from `astro/config` resolves
    the full Astro/Vite config, so `astro:env/server` and the `@/*` alias work with no extra
    wiring. **No `setupFiles`, only `globalSetup`.** Only test dep is `vitest` (+ jsdom / RTL /
    `@testing-library/dom` added in Phase 2). No `msw`, no `nock` — mocking is at the module
    boundary via `vi.mock`.
  - `astro.config.mjs` changed to `adapter: process.env.VITEST ? undefined : cloudflare({...})`
    (`plan.md` addendum 611-621, impl-review F5) — permanent, because the Cloudflare adapter's
    Vite plugin sets `resolve.external` for the worker env and conflicts with Vitest's node env.
  - **`tests/helpers/test-users.ts`** — two constant, never-randomized users:
    `TEST_USER_A = { email: "test-user-a@10x-cards.test", password: "Test-User-A-Password-123!" }`,
    `TEST_USER_B` analogous (`…-b@…` / `Test-User-B-Password-123!`).
  - **`tests/setup/global-setup.ts`** (Vitest `globalSetup`, outside the Vite module graph):
    `loadEnv({ path: ".env.test", override: true })` via `dotenv` — `override: true` is a
    **CRITICAL safety fix (impl-review F1)** so an inherited shell/CI `SUPABASE_URL` can't win.
    Builds a service-role client from `process.env`. `createTestUserIfMissing()` uses
    `admin.auth.admin.createUser({ …, email_confirm: true })` and treats `email_exists` /
    `/already registered|already exists/i` as success (idempotent) — raw `INSERT INTO auth.users`
    does **not** work (GoTrue password format). Exports `assertLocalSupabaseUrl(url)` — throws
    unless hostname is `127.0.0.1`/`localhost`; called before every destructive service-role path
    (impl-review F1 CRITICAL, `reviews/impl-review.md:23-35`).
  - **`tests/helpers/api-context.ts`** — `createCookieJar(initial?)` → in-memory `Map` with
    `get/set(name,value,_opts?)/delete/has/toCookieHeader()` (the unused 3rd `set` arg matches the
    real `AstroCookies` signature — impl-review F6). `buildApiContext({ method, url, headers?,
    body?, cookies?, locals?, params? }): APIContext` returns a hand-built context (`request: new
    Request(...)`, `cookies`, `locals`, `params`, `url`, `redirect()`) cast `as any as APIContext`;
    defaults `locals = { user: null }`, `params = {}`; injects `Cookie` from the jar if none given.
    **No HTTP server** — `await handler(context)` directly.
  - **`tests/helpers/test-session.ts`** — `signInAsTestUser(creds): Promise<{ cookieHeader: string;
    user: User }>` — `assertLocalSupabaseUrl`, builds a real `@supabase/ssr` `createServerClient`
    with an in-memory cookie `Map` adapter, then real `signInWithPassword()` (HTTP to local
    GoTrue). Returns the production-shaped `Cookie` header (possibly chunked
    `sb-<ref>-auth-token.N`) + `data.user`. **impl-review F3 (SKIPPED)**: this re-implements
    `src/lib/supabase.ts`'s factory instead of importing it — a known latent drift risk.
    `cleanupFlashcards(ids)` — `assertLocalSupabaseUrl`, service-role client
    (`SUPABASE_SERVICE_ROLE_KEY`, `autoRefreshToken:false`), `admin.from("flashcards").delete()
    .in("id", ids)`; no-op on `[]`.
  - Every authenticated call passes **BOTH** `headers.Cookie` **AND** `locals.user`
    (`plan.md:59-67`, `test-plan.md:141-149`) — handlers gate 401/404 on `locals.user`, the
    Supabase query runs purely off the session cookie; setting only `locals.user` queries as
    `anon` → RLS blocks everything → **false-positive** pass.
  - `cleanupFlashcards(createdIds.splice(0))` in `afterEach`; ids pushed **after** the success
    assertion (impl-review F7 flags this ordering as imperfect); id-scoped assertions; never assume
    an empty table (two persistent shared users).
  - **Mandatory positive control** when testing a denial/no-op (`test-plan.md` §6.2 pt 5,
    `plan.md:445-448`) — otherwise you only prove "nothing happened".
  - `.env.test` keys: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (all
    `http://127.0.0.1:54321`), + dummy `GROQ_API_KEY=test-dummy-key-not-real` (Phase 2). Run:
    `npx supabase start` then `npm run test`; full clean run `npx supabase db reset && npm run test`.
  - Current suite (9 files): `tests/api/{auth-gating, auth-session-integrity, flashcards-isolation,
    study-isolation, generate-flashcards, generate-flashcards-config, generate-flashcards-rate}
    .test.ts`, `tests/components/FlashcardGenerator.test.tsx`, `tests/middleware.test.ts`.
  - **`fileParallelism` is NOT disabled** — impl-review F2, deferred twice (Phase 2 punted it to
    "Phase 5 or its own change", `ai-generation-reliability/plan.md:117-119`). Phase 3 creates
    cards *and mutates their schedule* for the shared users → this is now maximally relevant.
    Consider `test.fileParallelism = false` or a single-thread pool for the Phase-3 file, or
    coordinate with Phase 5.
- **"Labeled regression" convention** — originates in Phase 1
  (`auth-access-control-coverage/plan.md:84-87`: "Nie naprawiamy zachowania aplikacji … zapisujemy
  je jako test regresyjny blokujący obecny kontrakt, a nie zmieniamy kod produkcyjny"; the
  `/dashboard-anything` prefix-match and `signout.ts` error-swallowing cases,
  `plan.md:308-314,387-401`, with a manual-verification step `plan.md:325-327` requiring the test
  description to say "dokumentujemy obecne zachowanie", not "wymagamy"). Canonicalised in Phase 2
  (`test-plan.md` §6.4 pt 7, §6.6): any test pinning current-but-undesired behavior carries a block
  comment + test name stating *"dokumentujemy …, nie wymagamy …"* and is designed to **break when
  the fix lands**. Live: `tests/api/generate-flashcards.test.ts:8-20` (file header naming SCOPE +
  risk #), per-`describe` labels `"(deliberate regression)"` (2.2-2.4, 3.1),
  `tests/api/generate-flashcards-rate.test.ts:8-16` (`// ŚWIADOMA MIGAWKA MVP — NIE jest to
  pożądany kontrakt.`, links `prd.md:110-112`).
- **`ai-generation-reliability` stale-doc precedent** — roadmap F-02 and the original test-plan
  claimed "streaming działa"; per-phase research found the endpoint is buffered `generateObject`.
  Lesson: **treat the test-plan as a QA spec and let `/10x-research` correct any stale assumption**
  (`test-plan.md:26-29`, `ai-generation-reliability/research.md:492-496`). The same applies to the
  test-plan §2 #4 row's phrase "pokazuje karty w złej kolejności" — research shows there is no
  server-side order at all.
- **Out of scope for S-04** (`study-session/plan.md:50-57`): no `ReviewLog` table/history, no
  interval preview under the rating buttons, no in-session requeue of "Again" cards (queue fetched
  once at start), no changes to `POST /api/flashcards`. These remain true today.

## Related Research

- `context/archive/2026-09-02-auth-access-control-coverage/research.md` — auth/session/RLS harness;
  `research.md:148-149` explicitly calls the `review.ts` `last_review` condition "a concurrency
  guard, not an authorization check."
- `context/archive/2026-09-08-ai-generation-reliability/research.md` — buffered-contract testing,
  module-boundary mock seam, "labeled regression" in practice; §"stale-doc warning" — **treat the
  test-plan as a QA spec and let research correct stale assumptions** (`test-plan.md:26-29`).
- `context/archive/2026-08-02-study-session/plan.md` + `plan-brief.md` — original endpoint
  contracts and the `fsrs.ts` mapping-layer spec.
- `context/archive/2026-08-02-fsrs-schema-migration/plan.md` — migration design + `CHECK`
  constraints.

## Open Questions

1. **Idempotency vs. deliberate-regression for §D.2.** Is "sequential replay re-grades the card"
   a bug to be pinned as a labeled regression (documented, test breaks when a fix lands), or does
   Phase 3 want to specify the desired contract now (e.g. `review.ts` rejects a review when
   `last_review` is within N seconds, or when `due_date > now`)? The test-plan's cost×signal rule
   and the Phase-1/2 precedent both point to **labeled regression** (no production code change in a
   test-coverage phase) — confirm during `/10x-plan`.
2. **Queue-ordering assertion target.** With no `.order()` at all, the integration test can only
   assert "the reviewed card leaves the due-queue and its `due_date` moved forward" and pin the
   *absence* of ordering as a snapshot. Is that sufficient for the "wrong order" half of Risk #4,
   or does Phase 3 also want a unit-level assertion that `scheduled_days`/`due_date` respect the
   `again < hard < good < easy` monotonicity the library guarantees?
3. **Independent expected-schedule derivation.** The §2 #4 anti-pattern forbids re-running
   `scheduler.next` in the test. Options: (a) hand-computed FSRS-6 fixtures for a few
   `(state, grade)` pairs; (b) coarser invariant assertions (`due_date > now`, `state === "Review"`,
   `repetitions` incremented by exactly 1, `stability` strictly increased for `good`/`easy`,
   `lapses` incremented for `again`). Decide the balance in `/10x-plan`.
4. **`fileParallelism`** — resolve for the Phase-3 file specifically, or fold into Phase 5
   (quality-gates wiring)?
5. **`src/pages/api/flashcards/[id].ts`** — confirm PATCH never writes schedule fields (assumed by
   convention, not verified line-by-line in this pass).
6. **Client double-click (§E.1)** — in scope for Phase 3 (a `tests/components/StudySession.test.tsx`
   in the jsdom layer added in Phase 2), or component-level and deferred? The risk source cites
   `StudySession.tsx` as the hot-spot (4 commits/30d), which argues for including it.
