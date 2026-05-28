# Repository Guidelines

Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui. Deployed to Cloudflare Workers via `@astrojs/cloudflare`.

## Hard Rules

- Use `cn()` from `@/lib/utils` for all Tailwind class merging — never concatenate class strings manually.
- Astro components for static content and layouts; React only when client interactivity is required. No Next.js directives (`"use client"` etc.). Extract React hooks to `src/components/hooks/`.
- All API routes must export `const prerender = false`. Use uppercase `GET`/`POST` exports and validate input with zod.
- Every new Supabase table must have RLS enabled with granular per-operation, per-role policies.
- Shared types go in `src/types.ts`. Services and helpers in `src/lib/` (or `src/lib/services/`).

## Project Structure

`src/layouts/` — Astro layouts. `src/pages/` — routes; `src/pages/api/` — API endpoints. `src/components/` — Astro & React components; `src/components/ui/` — shadcn/ui (new-york variant). `src/lib/` — Supabase client (`supabase.ts`), utilities (`utils.ts`), services. `src/middleware.ts` — auth guard. `src/types.ts` — shared entities and DTOs. `supabase/migrations/` — SQL migrations named `YYYYMMDDHHmmss_description.sql`. Path alias `@/*` → `./src/*`.

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime)
- `npm run build` — production build; requires `SUPABASE_URL` + `SUPABASE_KEY`
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (Astro + Tailwind plugins)

CI (`.github/workflows/ci.yml`) runs `lint` then `build` on every push and PR to `master`. Pre-commit: husky + lint-staged runs eslint on `*.{ts,tsx,astro}` and prettier on `*.{json,css,md}`.

## Auth

`src/middleware.ts` runs on every request and attaches the resolved user to `context.locals.user`. Add paths to `PROTECTED_ROUTES` there to require authentication. Supabase SSR client in `src/lib/supabase.ts` uses cookie-based sessions with `astro:env/server` secrets.

## Environment

Local Node dev: copy `.env.example` → `.env`. Local Cloudflare dev: copy `.env.example` → `.dev.vars`. Required vars: `SUPABASE_URL`, `SUPABASE_KEY`. Start local Supabase with `npx supabase start` (requires Docker).

## Commits

Prefix every commit message with the current module and lesson number: `m1l4: <description>`. Example: `m1l4: add flashcard generation endpoint`. Use imperative mood for the description.

Stage all changes before committing: `git add -A`. Do not cherry-pick individual files unless explicitly asked.

## New shadcn/ui Components

Install with `npx shadcn@latest add [name]`. Components land in `src/components/ui/`.
