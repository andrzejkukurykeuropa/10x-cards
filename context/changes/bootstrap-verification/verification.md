---
bootstrapped_at: 2026-05-27T21:05:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

`10x-astro-starter` to opinionowany starter dla solo developera budującego web-applikację po godzinach w 6 tygodni. Supabase dostarcza auth (e-mail + hasło z FR-001/FR-002) i bazę PostgreSQL bez dodatkowej konfiguracji, co eliminuje największe ryzyko MVP — utratę danych fiszek (guardrail PRD). Astro + TypeScript + Zod zapewniają pełne typowanie i konwencje folderów, które agent AI rozumie bez dodatkowych instrukcji. Cloudflare Pages obsługuje streaming, więc wywołania AI/LLM (FR-003) mogą zwracać odpowiedzi strumieniowo do przeglądarki; integrację z OpenAI lub Anthropic dodaje się jako jedną zależność npm (np. `ai` SDK od Vercel). Jedyne znane tarcie: edge runtime wymaga, by logika generowania fiszek zmieściła się w limicie czasu workera — przy standardowych modelach tekstowych to nie jest problem dla 6-tygodniowego MVP.

## Pre-scaffold verification

| Signal      | Value                                                    | Severity | Notes                                        |
| ----------- | -------------------------------------------------------- | -------- | -------------------------------------------- |
| npm package | not run                                                  | —        | cmd_template uses git clone; npm check skipped |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | 10 days ago; from card docs_url              |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold`

**Strategy**: klonowanie repozytorium startera bez zachowywania jego historii git, następnie przeniesienie plików do bieżącego katalogu.

**Exit code**: 0

**Files moved to cwd**:
- `.github/workflows/` → merged into existing `.github/` (no collision — cwd had only `skills/`, `prompts/`, `copilot-instructions.md`)
- `.husky/`, `.vscode/`, `public/`, `src/`, `supabase/` — moved directly
- `.env.example`, `.gitignore`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `CLAUDE.md`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`, `wrangler.jsonc` — moved directly

**Preserved from cwd** (not touched by scaffold):
- `context/` — fully preserved (PRD, tech-stack, shape-notes)
- `idea-notes.md` — preserved
- `.github/skills/`, `.github/prompts/`, `.github/copilot-instructions.md` — preserved

**`.scaffold` siblings created**: none (no collisions detected)

**`.gitignore` merge**: not needed (no pre-existing `.gitignore` in cwd)

## Post-scaffold audit

**Command**: `npm audit`

**Result**: 10 vulnerabilities found

| Severity | Count |
| -------- | ----- |
| critical | 0     |
| high     | 1     |
| moderate | 9     |
| low      | 0     |

**Notable findings**:
- `yaml` — vulnerable to Stack Overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp)
- Various `@babel/*` deprecated plugin warnings (non-blocking)
- `node-domexception` deprecated (non-blocking)

**Action**: WARN-AND-CONTINUE. No critical vulnerabilities. Run `npm audit fix` to address moderate issues without breaking changes. `npm audit fix --force` may introduce breaking changes — review before running.

## Hints recorded but not acted on (v1)

The following hints from the hand-off are visible in this log but not processed by the bootstrapper in v1:

- `hints.ci_provider: github-actions` — CI workflow files not generated; deferred to future M1L4 skill
- `hints.ci_default_flow: auto-deploy-on-merge` — deferred to M1L4
- `hints.has_auth: true` — Supabase auth is included in the starter; no additional wiring done by bootstrapper
- `hints.has_ai: true` — AI/LLM integration not pre-wired; add `ai` SDK manually (see PRD FR-003)
- `hints.team_size: solo` — informational only
- `hints.self_check_answers: null` — standard path; no self-check was run

## Next steps

1. Configure Supabase: copy `.env.example` → `.env` and fill in `SUPABASE_URL` + `SUPABASE_ANON_KEY` from your Supabase project dashboard.
2. Configure Cloudflare: update `wrangler.jsonc` with your Cloudflare account and project name.
3. Add AI integration: `npm install ai` + configure OpenAI/Anthropic key in `.env`.
4. Run `npm audit fix` to address moderate vulnerabilities.
5. Run `npm run dev` to verify local development server starts.
6. Future: run `/10x-bootstrapper` M1L4 skill to generate `AGENTS.md` / `CLAUDE.md` and CI workflow files.
