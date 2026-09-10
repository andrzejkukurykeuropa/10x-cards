---
change_id: test-plan-refresh-2026-09-10
title: Refresh test-plan §4/§8/§6.6 to reflect the Vitest suite added by the rollout
status: archived
created: 2026-09-10
updated: 2026-09-10
archived_at: 2026-09-10T20:02:32Z
---

## Notes

Open a change folder to refresh context/foundation/test-plan.md — stack-change refresh (§8 trigger: new test runner), NOT a new rollout phase.

Scope (bookkeeping only): the rollout (§3 Phases 1–5, all `complete`) added a full Vitest test suite that the frozen §4 "Stos" still describes as profile `none` / "no test runner". Bring §4, §8, and §6.6 current with reality.

What is stale in the guide today:
- §4 "Stos": says profile `none`, "package.json has no test runner, no test config, no *.test.* files anywhere". Every layer row = "brak jeszcze".
- §4 stack grounding tools table: all "not available in current session", checked 2026-08-09.
- §8 Rejestr Aktualności: all dates 2026-08-09.
- §6.6: three paragraphs flagging "§4 requires /10x-test-plan --refresh".

Reality (Phase 1 discovery 2026-09-10):
- Test-base profile: `meaningful`. 13 test files, ~120 tests across tests/api/ (7), tests/components/ (2, jsdom), tests/lib/ (2, node), tests/middleware.test.ts, tests/helpers/ (4).
- Runner: Vitest ^4.1.11 via astro/config getViteConfig(). Two configs:
  - vitest.config.ts — env node, include tests/**/*.test.{ts,tsx}, globalSetup tests/setup/global-setup.ts, testTimeout 15000. Integration layer; needs `npx supabase start`; jsdom enabled per-file.
  - vitest.config.unit.ts — env node, include tests/lib/**/*.test.ts, NO globalSetup. Unit layer; 59 tests, no Supabase; npm script `test:unit`.
- devDeps added by rollout: jsdom ^30.0.1, @testing-library/react ^16.3.3, @testing-library/dom ^10.4.1, dotenv ^17.4.2.
- AI provider mock: ai/test MockLanguageModelV3 + @ai-sdk/groq seam (tests/helpers/ai-mock.ts).
- CI job `ci`: npm ci → astro sync → lint → test:unit → build. Integration NOT in CI.
- Grounding tools this session: Context7/docs MCP none; WebSearch/WebFetch AVAILABLE (changed vs 2026-08-09); Playwright MCP none; provider MCP none.

To do in this refresh:
1. §4: rewrite stack table to `meaningful` with real tools/versions, distinguishing the two Vitest configs (unit vs integration).
2. §4: update grounding-tools table (checked: 2026-09-10; WebSearch now available).
3. §8: dates → 2026-09-10; note the test stack is now documented.
4. §6.6: remove the three "requires --refresh" flags (debt paid).
5. §6.1 point 1: reconcile the "single config" wording now that a second config exists.

Do NOT touch:
- §1 (strategy), §2 (risk map + Risk Response Guidance), §3 (all phases `complete`), §7 (negative-space). The refresh interview confirmed no new risks, no incidents, no change of mind on §7.
- Do NOT add a rollout phase — all risks #1–#6 are covered.
- Do NOT write test code — document update only.
- Hot-spot scan raised NO new likelihood signal (only tests changed) — no basis to change §2 ratings.

After creating the folder, follow the downstream continuation rule (/10x-research next).
