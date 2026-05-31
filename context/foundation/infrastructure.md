---
project: 10xCards
researched_at: 2026-05-31T22:00:00+02:00
recommended_platform: Cloudflare Workers + Pages
runner_up: Render
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6
  runtime: Cloudflare Workers (workerd / edge)
  database: Supabase (external)
  adapter: "@astrojs/cloudflare v13+"
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

Cloudflare is the only platform that natively supports the existing stack (`@astrojs/cloudflare` v13 — the only Astro 6–compatible adapter) without requiring a runtime or adapter change. It is completely free at the expected MVP traffic (10k–100k req/month), has a mature CLI (`wrangler`), per-product `llms.txt` docs, and an official multi-server MCP suite. Interview answers (cost minimisation, stateless requests, single-region OK) all reinforce this choice.

---

## Platform Comparison

| Platforma | CLI-first | Managed/Serverless | Docs dla agenta | Stabilne API deploy | MCP | Koszt MVP |
|---|---|---|---|---|---|---|
| **Cloudflare Workers/Pages** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | 🆓 $0 |
| **Render** | ⚠️ Partial | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ~$7/mies. |
| **Railway** | ⚠️ Partial | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Partial | $5/mies. |
| **Fly.io** | ⚠️ Partial | ✅ Pass | ⚠️ Partial | ⚠️ Partial | ❌ Fail | ~$3/mies. |
| **Vercel** | — | — | — | — | — | ❌ ELIMINATED |
| **Netlify** | — | — | — | — | — | ❌ ELIMINATED |

**Eliminated (hard filter)**: Vercel (`@astrojs/vercel` peerDep `^5.0.0`) and Netlify (`@astrojs/netlify` peerDep `^5.0.0`) — neither adapter supports Astro 6 as of research date (2026-05-31). Deploying to either would require pinning to Astro 5.x.

**Criterion notes:**
- *CLI-first (Partial for Render/Railway/Fly)*: all three lack a dedicated `rollback` CLI command — rollback is performed via dashboard UI or API.
- *Docs (Partial for Fly.io)*: Fly.io has no `llms.txt`; docs are Markdown on GitHub (`superfly/docs`) but without an index file.
- *MCP (Partial for Railway)*: Railway MCP server is explicitly "work in progress — actively adding tools."
- *Cloudflare rollback*: performed via `wrangler versions list` + `wrangler versions deploy <id>@100` — no single `rollback` command, but fully scriptable.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Fully aligned with the existing stack: the project already uses `@astrojs/cloudflare` v13 (the only Astro 6–compatible adapter), `wrangler` CLI is already in dev dependencies, and `.dev.vars` / `wrangler.jsonc` are part of the bootstrapped starter. Free plan covers ~3M requests/month (well above MVP range). Per-product `llms.txt` and an official multi-server MCP suite (3800+ stars) make it the most agent-friendly option. Primary risk: 10ms CPU limit on free plan may require a $5/month upgrade once AI generation endpoints are added.

#### 2. Render

Runner-up. Official MCP server (GA, May 2025), `llms.txt` + per-page `.md` docs, and an official Astro SSR quickstart guide. Requires changing the adapter from `@astrojs/cloudflare` to `@astrojs/node` (full runtime switch). Paid Starter tier (~$7/month) needed to avoid 15-minute idle spin-down on free tier. CLI rollback is API-only (not a CLI command). Strong choice if Cloudflare edge constraints (Node.js API subset, CJS packages) become blockers.

#### 3. Railway

$5/month Hobby plan with $5 included compute — a lightweight Astro SSR app will likely stay within the allowance. `llms.txt` + per-page markdown docs are agent-friendly. Requires adapter switch to `@astrojs/node`. MCP server is "work in progress." Rollback is dashboard UI only (no CLI command, no stable image-based approach like Fly). Good DX for a solo developer but slightly less agent-operable than Cloudflare or Render.

---

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **10ms CPU limit on free plan** — SSR pages doing JWT verification (Supabase auth) + HTML rendering can exceed 10ms of CPU. Network I/O (awaiting Supabase) does not count toward CPU, but the rendering itself might. Mitigation: upgrade to Workers Paid ($5/month) once the generation endpoint is added.
2. **Node.js API subset** — `workerd` does not support `child_process`, `cluster`, HTTP/2, `node:sqlite`. CJS packages using `require()` require Vite pre-compilation. Errors can surface at runtime rather than build time, making them harder to catch in CI.
3. **Breaking change in adapter v13** — `Astro.locals.runtime` is removed; env, cf, caches, ctx all require new access patterns. Tutorial code for Astro 5 / adapter v12 will silently or noisily fail.
4. **Edge runtime vendor lock-in** — migrating to a long-running Node.js process (e.g., a background worker, PDF processing) requires swapping the entire adapter and rewriting all wrangler configuration and bindings.
5. **`wrangler tail` is sampled** — under sustained traffic (>1000 RPS) logs are sampled; a developer may miss the majority of error events. Workers Logs API (persistent, 3-day free retention) is the reliable fallback.

### Pre-Mortem — How This Could Fail

The 10xCards MVP launches on Cloudflare Pages free plan. For the first weeks, everything is smooth — `wrangler deploy` in 30 seconds, global CDN, zero cost. Problems begin when the AI flashcard generation endpoint is added: calling the OpenAI API and parsing the JSON response exceeds the 10ms CPU limit; Workers start returning `CPU time limit exceeded`. Upgrading to Workers Paid ($5/month) resolves this but reveals a second issue: a text-processing npm package used for input sanitisation relies on CJS internally. The build passes — Vite bundles it — but at runtime `workerd` throws a cryptic error without a stack trace, because `wrangler tail` is sampling and only showing 1 in 10 events. Three days of debugging later, the root cause is found. Meanwhile, an attempt to port the Supabase middleware pattern from a community tutorial fails silently — the tutorial was written for adapter v12 where `Astro.locals.runtime.env` existed; in v13 that path throws undefined. The fix requires a full refactor of the env-access pattern throughout the codebase. Six months in, a cron-based review reminder feature is scoped — but Durable Objects (the only stateful primitive) requires the Paid plan and significant architectural work not anticipated in the original MVP design.

### Unknown Unknowns

- **`.dev.vars` vs `wrangler secret` must both be set** — secrets must exist locally in `.dev.vars` AND in production via `wrangler secret put`. Omitting the production step causes silent `undefined` for env vars after deploy.
- **Bundle size limit** — Astro 6 + React 19 + shadcn/ui + Tailwind 4 may approach the 3MB free-plan limit. Verify with `wrangler deploy --dry-run` before first production deploy; upgrade to Paid for the 10MB limit if needed.
- **`astro:env/server` maps to `wrangler.jsonc` vars** — the starter uses `astro:env/server` for `SUPABASE_URL`/`SUPABASE_KEY`, which must be declared under `vars` (non-secret) or `secret_vars` in `wrangler.jsonc`. Missing this mapping produces `undefined` at runtime with no build error.
- **`Response` immutability in Workers** — Workers `Response` objects are immutable after construction. Middleware must use Astro's `context.cookies.set()` API, never directly mutate response headers. The starter handles this correctly, but any hand-written middleware must follow the same pattern.
- **Cloudflare Pages vs Workers deploy surface** — `astro dev` in Astro 6 uses the real `workerd` runtime (not Node.js). However, `astro preview` does not simulate Pages routing; use `wrangler pages dev dist/` for an accurate preview of routing behaviour.

---

## Operational Story

- **Preview deploys**: Cloudflare Pages automatically builds every branch push and creates a preview URL (`<branch>.<project>.pages.dev`). Preview URLs are public by default — protect with Cloudflare Access (Zero Trust) if the app contains sensitive data before launch.
- **Secrets**: Environment variables go in `wrangler.jsonc` (`vars`) for non-sensitive values and via `wrangler secret put KEY` for sensitive values (stored in Cloudflare Secrets vault). Local dev uses `.dev.vars` (gitignored). The `astro:env/server` schema in `astro.config.mjs` declares which vars are expected — mismatch causes a build error, not a silent failure.
- **Rollback**: `npx wrangler versions list` to find previous version ID → `npx wrangler versions deploy <OLD-ID>@100` to revert 100% of traffic. No single `rollback` command; the sequence is 2 commands. Wrangler stores up to 100 versions. Database migrations (Supabase) do not roll back automatically — plan for forward-only migrations.
- **Approval**: Destructive operations requiring a human: rotating `SUPABASE_KEY` (service role), dropping a Supabase table, purging Cloudflare KV namespaces. An agent may perform unattended: `wrangler deploy`, `wrangler secret put` (non-primary secrets), `wrangler tail` (read-only), `wrangler versions list`.
- **Logs**: Real-time: `npx wrangler tail --format pretty` (sampled under high traffic). Persistent: Workers Logs API via Dashboard > Workers > Logs (3-day retention free, 7-day paid). MCP-based: Cloudflare Observability MCP server at `https://observability.mcp.cloudflare.com/mcp`.

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| CPU time exceeded (10ms free limit) on AI endpoint | Devil's Advocate | H | M | Upgrade to Workers Paid ($5/mo) before adding generation endpoint |
| CJS npm package breaks at runtime in workerd | Devil's Advocate | M | M | Run `wrangler deploy --dry-run` in CI; add `optimizeDeps.include` for known CJS packages |
| `Astro.locals.runtime` usage from tutorials (v12 pattern) | Devil's Advocate | M | M | Treat all community examples for Astro ≤5 as suspect; always check adapter migration guide |
| Secrets missing in production (`.dev.vars` only) | Unknown Unknowns | M | H | Add `wrangler secret list` as a pre-deploy CI check |
| Bundle size exceeds 3MB free limit | Unknown Unknowns | L | M | Run `wrangler deploy --dry-run` in CI; upgrade to Paid plan if needed |
| `wrangler tail` sampling misses errors in prod | Devil's Advocate | M | M | Use Workers Logs API or Cloudflare Observability MCP for audit-quality log access |
| Pages preview URLs expose pre-launch app publicly | Pre-Mortem | M | L | Enable Cloudflare Access on the Pages project before sharing preview URLs |
| Supabase region latency (external DB) | Research Finding | L | L | Match Supabase project region to `wrangler.jsonc` `compatibility_date` region; use Supabase connection pooling |

---

## Getting Started

1. **Verify adapter version**: Confirm `@astrojs/cloudflare` is v13+ in `package.json` (required for Astro 6). If on v12, run `npm install @astrojs/cloudflare@latest` and follow the [v13 migration guide](https://docs.astro.build/en/guides/integrations-guide/cloudflare/#upgrading-to-v13-and-astro-6).

2. **Set up Cloudflare account + authenticate**:
   ```bash
   npx wrangler login
   ```

3. **Configure secrets for production**:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

4. **Verify bundle size before first deploy**:
   ```bash
   npm run build
   npx wrangler deploy --dry-run
   ```

5. **Deploy to production**:
   ```bash
   npx wrangler deploy
   # or via Cloudflare Pages CI: push to master → auto-deploy
   ```

6. **(Optional) Install Cloudflare MCP server** for agent-assisted operations:
   Add to your MCP client config:
   ```json
   {
     "mcpServers": {
       "cloudflare-docs": {
         "command": "npx",
         "args": ["mcp-remote", "https://docs.mcp.cloudflare.com/mcp"]
       },
       "cloudflare-observability": {
         "command": "npx",
         "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/mcp"]
       }
     }
   }
   ```

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (Cloudflare Workers does not use Docker)
- CI/CD pipeline setup (GitHub Actions integration with Cloudflare Pages is auto-configured by Pages Git integration)
- Production-scale architecture (multi-region HA, Durable Objects for stateful workloads)
- Cost modelling beyond 100k requests/month
