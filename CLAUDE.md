# Rules for AI

This file provides guidance to AI Agent when working with code in this repository.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering (`output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.
- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` (copy `.env.example` to `.env` for Node, or `.dev.vars` for Cloudflare local dev)
- Local Supabase: `npx supabase start` (requires Docker)
- Cloudflare local dev: secrets go in `.dev.vars` (gitignored)
- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint + build on every push and PR to master. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets for the build step.

<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 3, Lekcja 3

Lekcja 3 dotyczy **haków** — przekształcania bram jakości z Lekcji 1 i testów z Lekcji 2 w automatyczne, deterministyczne sprawdzenia, które uruchamiają się, gdy agent pracuje. Hak działa poza modelem, więc przetrwa kompresję kontekstu, zmiany instrukcji i „zapominanie” przez model. Konkretna korzyść z haków agentowych: sprawdzenie `PostToolUse` może przekazać swój wynik z powrotem do kontekstu agenta, dzięki czemu agent samodzielnie naprawia trywialne błędy (formatowanie, brakujący import, zły typ) w następnej iteracji, zamiast abyś odkrywał je minuty później.

```
context/foundation/test-plan.md  (§4 Bramy jakości: jakie sprawdzenie, wymagane kiedy)
        │
        ▼  (przypisz każdą bramę do najtańszej warstwy, która nadal daje sygnał)
   per-edit (haki agenta)  →  pre-commit (haki git)  →  pre-push  →  CI
        │ lint, format, testy zakresowe          │ staged       │ cięższe    │ integracja
        ▼
   kod wyjścia + stdout  →  additionalContext  →  agent reaguje w następnej turze
```

### Router zadań — Która warstwa dla tego sprawdzenia

| Chcesz | Zrób to |
| --- | --- |
| Reaguj natychmiast, gdy agent edytuje plik | Hak per-edit (dopasowanie `PostToolUse` `Write\|Edit` w twoim asystencie kodowania AI). Odpowiedni do szybkich sprawdzeń: lint/format i testy zakresowe na plikach obszarów ryzyka. Jest to **jedyna** warstwa, która może przekazać informację zwrotną agentowi w trakcie sesji. |
| Uruchom tylko testy, które zależą od edytowanego pliku | Przeanalizuj ścieżkę ze standardowego wejścia haka (`jq -r .tool_input.file_path`) i uruchom tryb testów powiązanych twojego runnera (`vitest related "$FILE" --run`, `jest --findRelatedTests $FILE`). Ogranicz to do tego, czy plik jest obszarem ryzyka w `test-plan.md`; nie uruchamiaj testów przy każdej edycji pomocnika lub konfiguracji. |
| Wykryj zmiany, które ominęły agenta (edycje ręczne, commit kolegi z zespołu) | Hak git pre-commit (Lefthook lub Husky+lint-staged) na plikach staged: lint + typecheck i testy na staged plikach ryzyka. |
| Uruchom cięższe sprawdzenia, zanim kod opuści maszynę | Pre-push: pełne sprawdzenie typów lub szerszy zestaw testów. Wszystko, co jest zbyt wolne dla per-edit, przenosi się tutaj. |
| Zdecyduj, gdzie należy dana brama | Zapytaj: czy jest wystarczająco szybka (kilka sekund) dla per-edit, czy powinna poczekać na commit/push/CI? Wolne sprawdzenia blokują pętlę agenta przy każdej edycji — przenieś je o warstwę wyżej. |
| Użyj tego samego haka w różnych narzędziach | Wzór trigger → matcher → handler → signal jest taki sam w Cursor, Codex, Windsurf i Copilot; zmienia się tylko plik konfiguracyjny i nazwy zdarzeń. Zobacz tabelę między narzędziami poniżej. |

### Cykl życia haka — uniwersalny wzorzec

Haki każdego narzędzia składają się z czterech kroków:

1.  **Trigger** — zdarzenie w narzędziu (np. agent właśnie zapisał plik: `PostToolUse`).
2.  **Matcher** — filtr decydujący, czy ten hak ma się uruchomić (nazwa narzędzia, np. `Write`/`Edit`, typ pliku lub wzorzec nazwy).
3.  **Handler** — akcja, która się uruchamia, zazwyczaj polecenie shella.
4.  **Signal** — wynik wraca do narzędzia. Kod wyjścia mówi o sukcesie/porażce; stdout może przepływać do kontekstu agenta jako informacja zwrotna.

### Kody wyjścia i pętla sprzężenia zwrotnego

-   **0** — sukces; hak przeszedł, kontynuuj.
-   **2** — błąd blokujący; agent widzi informację zwrotną i powinien zareagować.
-   **cokolwiek innego** — błąd nieblokujący; logowany, ale nie przerywa pracy.

W przypadku blokującej awarii, stdout przepływa do kontekstu agenta (w twoim asystencie kodowania AI poprzez `additionalContext`, ograniczony do 10 000 znaków; inne narzędzia mają podobne mechanizmy z własnymi limitami). Dlatego agent może sam się korygować: widzi konkretną wiadomość — brakujący typ, niezaimportowany moduł, źle sformatowana linia — a nie tylko „coś się nie powiodło”.

Granica: agent niezawodnie naprawia **trywialne** korekty samodzielnie. Gdy test zawiedzie z powodu błędnej logiki biznesowej, hak to ujawnia, ale agent może nie zdiagnozować prawdziwej przyczyny — mówi „coś jest nie tak” i próbuje trywialnej poprawki. Jeśli to nie rozwiąże się w jednej lub dwóch próbach, sygnał wraca do ciebie, a problem może zasługiwać na własny identyfikator zmiany z pełnym przepływem pracy `/10x-new → /10x-research → /10x-plan → /10x-implement`.

### Trzy warstwy lokalne (plus CI)

| Warstwa | Wykrywa | Czas |
| --- | --- | --- |
| Per-edit (haki agenta) | Formatowanie, proste błędy typów, nieudane testy jednostkowe na plikach ryzyka. Jedyna warstwa, która dostarcza agentowi informacje zwrotne w trakcie pracy. | ms–s |
| Pre-commit (haki git) | Co umknęło per-edit: edycje ręczne, pliki zmienione poza hakiem, sprawdzenia zbyt wolne dla per-edit. Działa na plikach staged. | s |
| Pre-push | Cięższe sprawdzenia przed wypchnięciem do zdalnego repozytorium (pełne sprawdzenie typów, szerszy zestaw testów). | s–min |
| CI | Problemy z integracją, zależności między modułami, sprawdzenia wymagające infrastruktury niedostępnej lokalnie. | min |

Warstwy lokalne **nie** zastępują CI — CI pozostaje kluczową weryfikacją dla współdzielonego stanu repozytorium i środowisk, których nie kontrolujesz. Ale każda warstwa lokalna, która wykryje błąd, to o jedną podróż w obie strony CI mniej. Nie potrzebujesz wszystkich warstw od pierwszego dnia: zacznij od jednego haka per-edit (lint) i jednej bramy commit, dodawaj warstwy, gdy zobaczysz, co umyka. Bramy jakości w `test-plan.md §4` decydują, które sprawdzenia warto zautomatyzować i na której warstwie; plan może zasadnie odroczyć haki per-edit, jeśli stosunek koszt/sygnał nie jest jeszcze odpowiedni.

### Kluczowe zasady

-   Utrzymuj szybkie haki per-edit. Jeśli sprawdzenie trwa dłużej niż kilka sekund, przenieś je do commit, push lub CI — wolny hak per-edit blokuje pętlę agenta przy każdej edycji. Lint/format są idealne dla per-edit; pełne sprawdzenie typów jest często bramą commit w większych projektach.
-   Uruchamiaj testy zakresowe, a nie całą suite, na edycję — tylko testy związane z edytowanym plikiem i tylko wtedy, gdy ten plik jest obszarem ryzyka w `test-plan.md`.
-   `related` to podpolecenie, a nie flaga (`vitest related`, a nie `--related`). Użyj `--run`, aby hak zakończył działanie zamiast wchodzić w tryb obserwacji.
-   `PostToolUse` uruchamia się raz na użycie narzędzia; trzy edycje w jednej turze uruchamiają go trzy razy niezależnie — nie ma wbudowanej agregacji.
-   Narzędzie do haków git (Lefthook vs Husky+lint-staged) to szczegół implementacji; zasada jest taka sama — uruchamiaj sprawdzenia na plikach staged przed commitem. Jeśli Husky już działa, nie migruj.
-   **Wstrzykiwanie kontekstu nie jest uniwersalne.** Twój asystent kodowania AI, Cursor, Codex i Copilot (w VS Code) mogą przekazać wynik haka agentowi; Windsurf nie może — może blokować (exit 2), ale nie może powiedzieć agentowi, co poszło nie tak.

### Ten sam wzorzec w każdym narzędziu

| Narzędzie | Zdarzenia | Handlery | Wstrzykiwanie kontekstu | Konfiguracja |
| --- | --- | --- | --- | --- |
| Twój asystent kodowania AI | ~30 | command, http, mcp_tool, prompt, agent | tak | `katalog konfiguracji narzędzia AI/settings.json` |
| Cursor | ~18 | command, prompt | tak | `.cursor/hooks.json` |
| Codex | 10 | command | tak | `.codex/hooks.json` |
| Windsurf | 12 | command | **nie** | `.windsurf/hooks.json` |
| Copilot | ~13 | command, http, prompt | tak (VS Code) | `.github/hooks/*.json` |

### Granice lekcji

-   Ta lekcja konfiguruje tylko haki i lokalne warstwy jakości. Zakres obejmuje JSON haka, `lefthook.yml` oraz warstwowanie per-edit/commit/push.
-   Nie pisz testów E2E, nie konfiguruj Playwright/MCP ani nie uruchamiaj scenariuszy przeglądarki. To jest Lekcja 4.
-   Nie uruchamiaj przepływu pracy debugowania od błędu do poprawki do testu regresji. To jest Lekcja 5.
-   Nie zmieniaj strategii ryzyka ani definicji bram jakości. To jest Lekcja 1 (`/10x-test-plan`); odczytaj bieżący stan za pomocą `/10x-test-plan --status`.
-   Nie pisz kodu testów jednostkowych/integracyjnych od zera tutaj. To jest Lekcja 2 — haki tylko *uruchamiają* testy, które te lekcje wyprodukowały.
-   Nie twórz potoków CI/CD. To jest Moduł 1 Lekcja 5 / Moduł 2 Lekcja 5; haki to lokalne warstwy przed CI.

### Ścieżki używane w tej lekcji

-   `katalog konfiguracji narzędzia AI/settings.json` — konfiguracja haka (`~/.claude/settings.json` globalnie, `katalog konfiguracji narzędzia AI/settings.json` projektu, `katalog konfiguracji narzędzia AI/settings.local.json` lokalne nadpisania). Inne narzędzia używają własnego pliku konfiguracyjnego (patrz tabela).
-   `lefthook.yml` — konfiguracja haka git pre-commit (lint + typecheck + testy na `{staged_files}`).
-   `context/foundation/test-plan.md` — §4 bramy jakości decydują, które sprawdzenia zautomatyzować i na której warstwie; obszary ryzyka decydują, które edycje wymagają testów zakresowych.

<!-- END @przeprogramowani/10x-cli -->
