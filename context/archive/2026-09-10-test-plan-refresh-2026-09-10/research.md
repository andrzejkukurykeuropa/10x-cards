---
date: 2026-09-10T21:35:00+02:00
researcher: AndrzejKukuryk
git_commit: 8109f23d00abf660656e41c15586d48ad7d525a5
branch: master
repository: 10x-cards
topic: "Verify the test-stack facts in change.md so test-plan.md §4 / §8 / §6.6 can be refreshed accurately"
tags: [research, codebase, test-plan, vitest, ci, tooling-refresh]
status: complete
last_updated: 2026-09-10
last_updated_by: AndrzejKukuryk
---

# Research: Verify the test-stack facts for the test-plan §4/§8/§6.6 refresh

**Date**: 2026-09-10T21:35:00+02:00
**Researcher**: AndrzejKukuryk
**Git Commit**: 8109f23d00abf660656e41c15586d48ad7d525a5 (HEAD, **not pushed**; last pushed = e78ce3e — permalinks below use e78ce3e, none of the referenced files changed in 8109f23)
**Branch**: master
**Repository**: 10x-cards

## Research Question

`change.md` for `test-plan-refresh-2026-09-10` proposes a bookkeeping-only refresh: the phased rollout (§3 Phases 1–5, all `complete`) added a full Vitest suite that the frozen §4 "Stos" still describes as profile `none` / "no test runner". Before `/10x-plan` writes the update, verify against the current codebase every fact the refresh will assert in §4 (stack table + grounding-tools table), §8 (Rejestr Aktualności), and §6.6 (the three "requires `--refresh`" flags), plus the §6.1 point 1 "single config" wording. This is a §8 stack-change trigger ("new test runner"), **not** a new rollout phase — no risk re-rating, no test code.

## Summary

Every material claim in `change.md`'s "Reality (Phase 1 discovery 2026-09-10)" section is confirmed by the codebase, with small numeric corrections:

- **Test-base profile is `meaningful`**, not `none`. **13 test files, 111 test cases** (`change.md` said "~120"). Breakdown: `tests/api/` **8 files / 38 tests** (`change.md` said "7"), `tests/components/` 2 files / 8 tests (jsdom), `tests/lib/` 2 files / **59 tests** (fsrs 22 + inactive-accounts 37), `tests/middleware.test.ts` 6 tests. `tests/helpers/` 4 files, `tests/setup/` 1 file.
- **Runner: Vitest `^4.1.11`** via `astro/config` `getViteConfig()`, **two config files** as described.
- **devDependencies added by the rollout confirmed**: `jsdom ^30.0.1`, `@testing-library/react ^16.3.3`, `@testing-library/dom ^10.4.1`, `dotenv ^17.4.2`.
- **CI job `ci`** runs `npm ci → npx astro sync → npm run lint → npm run test:unit → npm run build`. Integration/component tests are **not** in CI.
- **AI provider mock seam** = `ai/test` `MockLanguageModelV3` + `@ai-sdk/groq` mock, in `tests/helpers/ai-mock.ts` — confirmed.
- **Grounding tools this session**: WebSearch / WebFetch **available**; no docs/Context7 MCP; no Playwright MCP; no provider (GitHub/Cloudflare/Supabase) MCP; no `.mcp.json` in repo. Matches `change.md`.

One item **outside `change.md`'s stated scope** surfaced and needs a scope decision in `/10x-plan`: the endpoint's AI call was migrated `generateObject` → `generateText` + `Output.object` in Phase 5, but **§6.4 of the guide still describes the contract as `generateObject`** (3 mentions). §2 also says `generateObject` but §2 is explicitly frozen / do-not-touch.

## Detailed Findings

### §4 "Stos" — current reality vs. frozen text

Frozen text ([test-plan.md:87-106](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L87-L106)) says: *"W tym projekcie nie istnieje dziś żadne narzędzie testowe — `package.json` nie ma runnera testów, nie ma pliku konfiguracji testów ani żadnych plików `*.test.*` … profil bazy testowej `none`."* Every layer row = "brak jeszcze". **All false now.**

**Runner & configs:**

- `vitest ^4.1.11` in `devDependencies` — [package.json:69](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/package.json#L69)
- Scripts — [package.json:13-15](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/package.json#L13-L15):
  - `test`: `vitest run` (full suite, uses `vitest.config.ts`)
  - `test:watch`: `vitest`
  - `test:unit`: `vitest run --config vitest.config.unit.ts`
- **`vitest.config.ts`** (integration layer) — [full file](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/vitest.config.ts): `getViteConfig({ test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"], globalSetup: ["tests/setup/global-setup.ts"], testTimeout: 15000, passWithNoTests: true }})`. The `.tsx` in `include` and the `globalSetup` are the Phase 2 additions.
- **`vitest.config.unit.ts`** (unit layer) — [full file](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/vitest.config.unit.ts): same `getViteConfig`, `environment: "node"`, `include: ["tests/lib/**/*.test.ts"]`, **no `globalSetup`**, `passWithNoTests: true`, **no `testTimeout` override**. Added by Phase 5.
- `getViteConfig` gives both configs the Astro module graph, so `astro:env/*` and the `@/*` alias resolve in tests with no extra config — as §6.1/§6.2 already state.

**globalSetup** — [tests/setup/global-setup.ts](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/tests/setup/global-setup.ts): loads `.env.test` via `dotenv` (`override: true`), requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, `assertLocalSupabaseUrl()` refuses any non-`127.0.0.1`/`localhost` host, then creates `TEST_USER_A`/`TEST_USER_B` idempotently. This is why the integration layer needs `npx supabase start` and a local `.env.test` (`.env.test.example` is tracked, dated 2026-09-08).

**devDeps the refresh must record in the stack table** — [package.json:46-71](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/package.json#L46-L71):

| Package | Version | Role |
|---|---|---|
| `vitest` | `^4.1.11` | runner, both layers |
| `jsdom` | `^30.0.1` | DOM env for `tests/components/*.test.tsx` |
| `@testing-library/react` | `^16.3.3` | component render/query |
| `@testing-library/dom` | `^10.4.1` | RTL peer |
| `dotenv` | `^17.4.2` | `.env.test` loader in `globalSetup` |
| `supabase` | `^2.23.4` | already a devDep (CLI) |

**API/provider mock** (stack table row "mockowanie API") — `ai ^6.0.208` ([package.json:32](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/package.json#L32)) ships `ai/test` `MockLanguageModelV3`; provider seam is `@ai-sdk/groq ^3.0.42` ([package.json:19](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/package.json#L19)). Helper: [tests/helpers/ai-mock.ts](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/tests/helpers/ai-mock.ts) — `buildMockModel({ text | error | hang })`, `flashcardsJson(n)`, `makeApiCallError()`, `makeAbortError()`. Supabase is mocked only in the sense that integration tests call handlers directly against a **real local** Supabase (no `msw`). No network-level HTTP mock library is installed.

**e2e / accessibility / AI-native rows**: still genuinely absent — no Playwright, no axe, no AI-native test tooling in `package.json`. Those §4 rows ("nieuwzględnione w tym wdrożeniu" / "nieocenione") remain accurate and should stay.

### §4 grounding-tools table — current session

Frozen text ([test-plan.md:102-106](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L102-L106)) — all four lines "niedostępne / nieużyte w bieżącej sesji", `sprawdzono: 2026-08-09`.

This session (2026-09-10):

| Tool class | Status now | vs. 2026-08-09 |
|---|---|---|
| Docs (Context7 / docs MCP) | **not available** — no `mcp__context7*` / docs MCP tools; no `.mcp.json` in repo | unchanged |
| Web search / fetch | **available** — `WebSearch` + `WebFetch` are usable this session | **changed** (was unavailable) |
| Runtime / browser (Playwright MCP) | **not available** — no `mcp__playwright*`; `claude-in-chrome` skill exists but no Playwright MCP server | unchanged |
| Provider / platform (GitHub / Cloudflare / Supabase MCP) | **not available** — none present. `gh` CLI works from Bash but that is not an MCP grounding tool | unchanged |

Refresh should stamp `checked: 2026-09-10` and flip only the web-search line to "available".

### §8 Rejestr Aktualności

Frozen text ([test-plan.md:511-522](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L511-L522)) — all three dates `2026-08-09`; strategy §1–§5 "last reviewed 2026-08-09". Refresh should move "Wersje stosu ostatnio zweryfikowane" and "Referencje narzędzi… zweryfikowane" to `2026-09-10` and note the test stack is now documented (profile `meaningful`). Strategy review date: `change.md` says the refresh interview confirmed **no** strategy change — leaving §1–§5's "last reviewed" as-is is defensible, but the refresh *is* touching §4 and §5 is already marked reviewed 2026-09-10 in the header note (line 10). Recommend: bump the "Strategia (§1–§5)" line to 2026-09-10 with a note that only §4/§5 wording changed, risks §1–§3/§7 untouched. **This is a `/10x-plan` judgment call, not a codebase fact.**

### §6.6 — the three "requires `--refresh`" flags

Three flags in §6.6 explicitly defer stack-table work to this refresh:

1. **Phase 2 flag** — [test-plan.md:358-362](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L358-L362): jsdom / RTL / `@testing-library/dom` as devDeps + `.tsx` added to `include` → "**§4 wymaga `/10x-test-plan --refresh`**". **Confirmed accurate** — those are exactly the diffs. Debt paid once §4 records them.
2. **Phase 3 flag** — [test-plan.md:405-409](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L405-L409): `tests/lib/` directory = new unit layer (node, no Supabase/mock) → "**§4 nadal wymaga `/10x-test-plan --refresh`**". **Confirmed** — `tests/lib/fsrs.test.ts` + `tests/lib/inactive-accounts.test.ts` exist, 59 tests, node env.
3. **Phase 5 flag** — [test-plan.md:469-473](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L469-L473): second config `vitest.config.unit.ts` → "kolejna zmiana stosu… do odnotowania przy `/10x-test-plan --refresh`". **Confirmed** — file exists.

All three become removable once §4 documents the two-config setup, the two layers, and the jsdom/RTL/dotenv devDeps. Note: Phase 4's §6.6 entry ([test-plan.md:432-434](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L432-L434)) explicitly says **"§4 NIE wymaga `--refresh` po tej fazie"** (TZ pin is one line in a test file) — correct, leave it.

### §6.1 point 1 — "single config" wording

[test-plan.md:131-135](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L131-L135): *"Runner: Vitest przez `getViteConfig()`; `include` w `vitest.config.ts` już obejmuje `tests/**`."* — reads as if there is one config. After the refresh this should acknowledge that **`tests/lib/**` is covered by *both* configs**: `vitest.config.ts` (`tests/**/*.test.{ts,tsx}`, with `globalSetup`) and `vitest.config.unit.ts` (`tests/lib/**/*.test.ts`, no `globalSetup`) — so a `tests/lib/` test must run clean under **both** `npm run test` and `npm run test:unit` (i.e. must not depend on `globalSetup` having run). Run commands in §6.1 (`npx vitest run tests/lib/<m>.test.ts`, [line 175](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L175)) still work but `npm run test:unit` should be offered as the canonical "just the fast layer" command.

### CI job — confirmed

[.github/workflows/ci.yml](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/.github/workflows/ci.yml): single job `ci` on `push` + `pull_request` to `master`:
`actions/checkout@v4` → `actions/setup-node@v4` (`node-version: 22.14.0`, `cache: npm`) → `npm ci` → `npx astro sync` → `npm run lint` → `npm run test:unit` → `npm run build` (with `SUPABASE_URL` / `SUPABASE_KEY` secrets). No integration/component step. This matches §5's gate table ([test-plan.md:110-117](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L110-L117)), which was already corrected by Phase 5. **§5 needs no change from this refresh** (change.md agrees — §5 is not in the to-do list).

### Test inventory (for any count the refresh cites)

`npx vitest list` (full) = **111 tests / 13 files**; `npx vitest list --config vitest.config.unit.ts` = **59 tests**.

| File | Tests | Env | Layer | Needs Supabase |
|---|---|---|---|---|
| `tests/api/auth-gating.test.ts` | 8 | node | integration | yes |
| `tests/api/auth-session-integrity.test.ts` | 2 | node | integration | yes |
| `tests/api/flashcards-isolation.test.ts` | 4 | node | integration | yes |
| `tests/api/generate-flashcards.test.ts` | 12 | node | integration (AI mock) | no |
| `tests/api/generate-flashcards-config.test.ts` | 1 | node | integration (AI mock) | no |
| `tests/api/generate-flashcards-rate.test.ts` | 2 | node | integration (AI mock) | no |
| `tests/api/study-isolation.test.ts` | 3 | node | integration | yes |
| `tests/api/study-review.test.ts` | 6 | node | integration | yes |
| `tests/components/FlashcardGenerator.test.tsx` | 5 | jsdom | component | no |
| `tests/components/StudySession.test.tsx` | 3 | jsdom | component | no |
| `tests/lib/fsrs.test.ts` | 22 | node | unit | no |
| `tests/lib/inactive-accounts.test.ts` | 37 | node | unit | no |
| `tests/middleware.test.ts` | 6 | node | integration | yes |

`change.md` cited "13 test files, ~120 tests … tests/api/ (7)". Corrections: **111 tests**, **8** api files. Internal §6 references are accurate: §6.1 says fsrs "22 testy" (✓) and inactive-accounts "37 testów" (✓); §6.2 says Phase 1 = "5 plików / 23 testów" — ✓ (auth-gating 8 + auth-session-integrity 2 + flashcards-isolation 4 + study-isolation 3 + middleware 6 = 23). §6.4 says Phase 2 shipped `generate-flashcards*.test.ts` + `FlashcardGenerator.test.tsx` — ✓.

### Out-of-scope finding: `generateObject` is stale in §6.4

Phase 5 migrated the endpoint's AI call from `generateObject` to `generateText` + `Output.object` — [src/pages/api/generate-flashcards.ts:3,48-61](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/src/pages/api/generate-flashcards.ts#L48-L61) (`import { generateText, Output } from "ai"`; `const { output } = await generateText({ … output: Output.object({ schema: flashcardsOutputSchema }) })`). Phase 5's own §6.6 entry records this ([test-plan.md:463](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L463)).

But the guide still says `generateObject` in:
- **§2** risk table + Risk Response Guidance ([test-plan.md:46](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L46), [:63](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L63)) — **frozen, do not touch** per `change.md`.
- **§6.4** cookbook — [test-plan.md:291](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L291), [:300](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L300), [:302](https://github.com/andrzejkukurykeuropa/10x-cards/blob/e78ce3e8ce7085d75a03f71f80ad755924656cbe/context/foundation/test-plan.md#L302). `generateObject` is used as the noun for the buffered contract and for the "never mock `ai`/`generateObject`" rule. The *conceptual* claim still holds (`Output.object` runs the same real zod validation — the code comment at `generate-flashcards.ts:60-61` says exactly this, and `ai-mock.ts:17` still narrates it as `generateObject`). Only the API name is stale.
- Test-code comments (`tests/api/generate-flashcards.test.ts:9,75,182`, `tests/helpers/ai-mock.ts:17`) — **test code, out of scope** (doc-only change).

**`change.md`'s to-do list does not mention §6.4.** Decision for `/10x-plan`: either (a) keep this refresh strictly to §4/§8/§6.6/§6.1 and log §6.4 as a separate follow-up, or (b) widen scope by one bullet to swap `generateObject` → "`generateText` + `Output.object`" in §6.4's three prose spots (cheap, same file, same "test-stack currency" rationale). Recommend (b) — it is the same class of staleness this refresh exists to fix, and leaving §6.4 wrong while fixing §4 is inconsistent. §2 stays frozen regardless.

## Code References

- `package.json:13-15` — `test` / `test:watch` / `test:unit` scripts
- `package.json:32,19` — `ai ^6.0.208`, `@ai-sdk/groq ^3.0.42`
- `package.json:46-71` — devDeps: `vitest ^4.1.11`, `jsdom ^30.0.1`, `@testing-library/react ^16.3.3`, `@testing-library/dom ^10.4.1`, `dotenv ^17.4.2`, `supabase ^2.23.4`
- `vitest.config.ts` — integration layer: node, `tests/**/*.test.{ts,tsx}`, `globalSetup`, `testTimeout: 15000`
- `vitest.config.unit.ts` — unit layer: node, `tests/lib/**/*.test.ts`, no `globalSetup`
- `tests/setup/global-setup.ts` — `.env.test` loader, local-only Supabase guard, test-user seeding
- `tests/helpers/ai-mock.ts` — `MockLanguageModelV3` + `@ai-sdk/groq` seam
- `tests/helpers/{api-context,test-session,test-users}.ts` — integration harness (4 helpers total)
- `.github/workflows/ci.yml:15-30` — job `ci`: `npm ci → astro sync → lint → test:unit → build`
- `src/pages/api/generate-flashcards.ts:3,48-61` — `generateText` + `Output.object` (was `generateObject`)
- `.nvmrc` — `22.14.0` (matches CI `node-version`)
- `context/foundation/test-plan.md:87-106` (§4 stack), `:102-106` (grounding tools), `:511-522` (§8), `:358-362`/`:405-409`/`:469-473` (§6.6 refresh flags), `:131-135` (§6.1 point 1)

## Architecture Insights

- **Two-config split is deliberate and load-bearing.** `vitest.config.ts` carries `globalSetup` (Supabase + `.env.test`); `vitest.config.unit.ts` omits it so `tests/lib/**` runs in seconds in CI with zero external deps. A `tests/lib/` test is run by **both** configs, so it must never rely on `globalSetup` side effects. The refresh's §4 rewrite should make this the headline distinction.
- **Mock boundary discipline**: the seam is the provider (`@ai-sdk/groq`), never `ai`. Real `generateText`/`Output.object` runs real zod validation in tests. The Phase 5 API migration preserved this exactly (`generate-flashcards.ts:60-61` comment), so the refresh does not need to touch the *substance* of §6.4, only the API noun.
- **CI gate is `lint + test:unit + build` only** — integration/component tests are local-only by design (`npx supabase start` + known-flaky `study-review.test.ts` 2.4). §5 already reflects this post-Phase-5; the refresh leaves §5 alone.
- **No MCP servers configured in-repo** (`.mcp.json` absent). Grounding-tool availability is purely a per-session property; the only 2026-09-10 change vs. 2026-08-09 is web search/fetch becoming available.

## Historical Context (from prior changes)

- `context/archive/2026-09-09-quality-gates-wiring/` — Phase 5. Added `vitest.config.unit.ts` + `test:unit`, wired the CI step, made `ci` a required status check on `master` (`enforce_admins: false`, repo switched public), migrated `generateObject → generateText + Output.object`, zeroed 49 pre-existing lint errors. This is the change that created the second config the refresh must document.
- `context/archive/2026-09-08-ai-generation-reliability/` — Phase 2. Introduced `jsdom` / `@testing-library/*` devDeps and `.tsx` in `include`; raised the first §6.6 "§4 requires `--refresh`" flag.
- `context/archive/2026-09-09-study-fsrs-scheduling-integrity/` — Phase 3. Created `tests/lib/` (unit layer); raised the second flag. Has a follow-up `follow-ups/review-fixes.md` (F1) referenced from §6.6.
- `context/archive/2026-09-09-account-lifecycle-safety-net/` — Phase 4. Added `tests/lib/inactive-accounts.test.ts` (37 tests) + TZ-pin pattern; explicitly declared **no** `--refresh` needed.
- `context/archive/2026-09-02-auth-access-control-coverage/` — Phase 1. Bootstrapped `vitest.config.ts`, `tests/helpers/*`, `tests/setup/global-setup.ts`, the 5-file/23-test integration base.
- The working tree currently has an **uncommitted comment-only edit** to `tests/lib/inactive-accounts.test.ts` (6 insertions / 3 deletions, clarifying the mutual-exclusivity loop comment) — a leftover Phase 4 polish, unrelated to this refresh. `/10x-plan` and `/10x-implement` should not fold it into this doc-only change.

## Related Research

- `context/archive/2026-09-08-ai-generation-reliability/research.md` — the "buffered, not streaming" finding and the `generateObject` boundary analysis that §2/§6.4 wording derives from.
- `context/archive/2026-09-09-quality-gates-wiring/research.md` — CI wiring + lint-debt analysis.
- `context/archive/2026-09-09-study-fsrs-scheduling-integrity/research.md` — `tests/lib/` unit-layer rationale.

## Open Questions

1. **§6.4 scope** — swap `generateObject` → `generateText` + `Output.object` in §6.4's three prose spots as part of this refresh (recommended), or log as a separate follow-up? `change.md`'s to-do list is silent on §6.4.
2. **§8 strategy-review date** — bump "Strategia (§1–§5) ostatnio przejrzana" to 2026-09-10 (with a "wording only, risks untouched" note), or leave at 2026-08-09 since no risk changed? Judgment call for `/10x-plan`.
3. **Count precision** — the refresh should cite **111 tests / 13 files / 59 unit** if it cites numbers at all; `change.md`'s "~120" and "tests/api/ (7)" are slightly off. Prefer describing layers over hard totals (totals drift every phase).
4. Nothing in scope requires web research — all facts are local. The grounding-tools table entry is a session-state observation, not a claim needing external verification.
