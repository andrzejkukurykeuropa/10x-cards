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

## Zestaw narzędzi AI 10xDevs — Moduł 3, Lekcja 1

Rozpocznij Moduł 3, tworząc **trwałą umowę jakościową opartą na ryzyku** przed napisaniem jakiegokolwiek testu — a następnie przeprowadź każdą fazę wdrożenia przez standardowy łańcuch zmian.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategia §1–§5 zamrożona + książka kucharska §6 rośnie)
        │
        ▼  (jedna faza wdrożenia na raz, /clear między przekazaniami)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` to **stanowy orkiestrator**, a nie jednorazowy generator. Przy pierwszym uruchomieniu zapisuje fazowe wdrożenie do `context/foundation/test-plan.md`. Przy każdym kolejnym uruchomieniu ponownie wyprowadza stan z artefaktów na dysku i przedstawia następne przekazanie. Lekcja koncentruje się na **strategii i sekwencjonowaniu wdrożenia, a nie na konfiguracji**. Hooki, serwery MCP i YAML CI są konfigurowane w późniejszych lekcjach tego modułu.

### Router zadań — Od czego zacząć

| Umiejętność | Kiedy używać |
| --- | --- |
| **Strategia jakości jako plik reguł (fokus lekcji)** | |
| `/10x-test-plan` | Masz PRD (i idealnie roadmapę oraz kilka zarchiwizowanych fragmentów) i zamierzasz napisać pierwsze testy projektu, lub zauważyłeś, że testy generowane przez AI trafiają na pomocników, podczas gdy krytyczne przepływy pozostają niepokryte. Pierwsze wywołanie uruchamia odkrywanie (PRD + roadmap + archive + skan gorących punktów), 5-pytaniowy wywiad z użytkownikiem i przejście syntezy z obowiązkową kontrolą wyzwania, a następnie zapisuje `test-plan.md` w `context/foundation/` z mapą ryzyka (5–7 scenariuszy awarii), tabelą fazowego wdrożenia, tabelą stosu, tabelą bramek jakości, sekcją książki kucharskiej (`§6`, wypełnia się w miarę wysyłania faz) i sekcją przestrzeni negatywnej (czego celowo nie testujemy). Kolejne wywołania przesuwają wdrożenie o jedno przekazanie na raz. |
| `/10x-test-plan --status` | `test-plan.md` już istnieje i chcesz uzyskać kompaktową migawkę stanu wdrożenia — które fazy są `not started`, `change opened`, `researched`, `planned`, `implementing` lub `complete`, i jakie jest następne działanie. Nie wykonuje żadnej pracy; bezpieczne do uruchomienia w dowolnym momencie. |
| `/10x-test-plan --refresh` | `test-plan.md` już istnieje i jedno z: pojawiło się nowe ryzyko z top-3 z roadmapy lub archiwum, data `checked:` narzędzia jest starsza niż trzy miesiące, zmienił się stos technologiczny projektu, lub §7 przestrzeń negatywna nie odpowiada już temu, w co wierzy zespół. Otwiera nowy folder zmian `test-plan-refresh-<RRRR-MM-DD>` zamiast edytować przewodnik na miejscu. |

### Łańcuch wdrożenia — co dzieje się po napisaniu przewodnika

Tabela §3 *Phased Rollout* przewodnika jest stanem orkiestratora. Dla każdego wiersza innego niż `complete` orkiestrator wybiera następne przekazanie na podstawie tego, które artefakty istnieją w `context/changes/<change-id>/`:

| Stan na dysku | Następne przekazanie | Status zmienia się na |
| --- | --- | --- |
| brak folderu zmian | `/10x-new <change-id>` | `change opened` |
| tylko `change.md` | `/10x-research` (z krótkim opisem ryzyk do weryfikacji) | `researched` |
| `+ research.md` | `/10x-plan` (z kosztami × sygnałem + ograniczeniami aktualizacji książki kucharskiej) | `planned` |
| `+ plan.md` z oczekującymi elementami `## Progress` | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` w pełni `[x]` | Oznacz wiersz §3 jako `complete`; przejdź do następnego oczekującego wiersza | — |

Każde przekazanie jest **punktem STOP**. Orkiestrator kopiuje następne polecenie do schowka, prosi użytkownika o `/clear` i uruchomienie go, a następnie kończy działanie. Ponownie wywołaj `/10x-test-plan` (bez argumentów), aby przejść dalej.

### Reguły priorytetyzacji opartej na ryzyku

- Ryzyka to **scenariusze awarii w kategoriach użytkownika / biznesowych**, a nie nazwy testów. „Wylogowany użytkownik uzyskuje dostęp do płatnych treści za pomocą nieaktualnego tokena” to ryzyko; „testowanie formularza logowania” nie jest.
- 5 do 7 ryzyk. Mniej jest zbyt ogólne; więcej sprawia, że priorytetyzacja jest bezużyteczna.
- Wpływ i prawdopodobieństwo to oceny użytkownika/biznesowe, a nie złożoność techniczna.
- Każde ryzyko ma swoje źródło: sekcja PRD, zarchiwizowany fragment, wpis w roadmapie, pytanie z wywiadu fazy 2, **katalog** gorących punktów z liczbą zmian lub ograniczenie stosu technologicznego. Brak wymyślonych ryzyk.
- **Sygnał, nie wiedza.** §2 cytuje *dowody, które podniosły ryzyko*, nigdy plik jako „miejsce, w którym występuje awaria”. Kotwice plik:linia, nazwy funkcji, nazwy schematów i nazwy modułów są zabronione w §2 — należą do danych wyjściowych `/10x-research`, generowanych dla każdej fazy wdrożenia na podstawie bieżącego kodu. Plan jest specyfikacją QA; nie jest audytem kodu.
- Pokrycie nie jest metryką. **Pokrycie ryzyka** jest metryką.

### Reguły mapowania dwuwarstwowego

- Najpierw warstwa klasyczna: najtańszy test, który daje prawdziwy sygnał, wygrywa. Promuj do e2e tylko wtedy, gdy żadna tańsza warstwa nie pokrywa ryzyka.
- Druga warstwa AI-native, i tylko tam, gdzie dodaje sygnał, którego klasyczne testy nie dają tanio.
- Każdy wiersz AI-native ma linię **„Kiedy NIE używać”**. Jeśli nie możesz jej napisać, usuń wiersz.
- Każda nazwa narzędzia ma datę `checked: <RRRR-MM-DD>`. Nazwy narzędzi są przykładami kategorii, a nie rekomendacjami.
- Obie warstwy muszą być niepuste w ostatecznym przewodniku, jeśli projekt tego wymaga. Tylko klasyczne to plan z 2020 roku; tylko AI-native to szum. Fazy AI-native nie są obowiązkowe — włącz je tylko wtedy, gdy uzasadnienie uzasadniało je pod względem kosztów × sygnału.

### Reguły bramek jakości

- Wymagane bramki (lint, typecheck, unit+integration, e2e na krytycznych przepływach) muszą odpowiadać rzeczywistym krokom CI. Jeśli wymagana bramka nie jest jeszcze podłączona, oznacz ją jako `required after §3 Phase <N>` i pozwól nazwanej fazie wdrożenia ją podłączyć.
- Hook post-edycji jest **zalecany lokalnie**, a nie jako substytut CI.
- Wielomodalny przegląd wizualny jest **selektywny**, stosowany do 1–3 krytycznych ekranów, a nie do każdej strony.
- Awaryjne rozwiązanie oparte na wizji (Anthropic Computer Use lub OpenAI CUA) jest zarezerwowane dla powierzchni niedostępnych z DOM; drogie na akcję.

### Wzorce książki kucharskiej (§6) — wypełniają się z czasem

`test-plan.md` to zarówno fazowa strategia, jak i **rosnąca książka kucharska**. §6 zaczyna się jako miejsca docelowe (`TBD — zobacz §3 Phase <N>`) i wypełnia się stopniowo — plan każdej fazy wdrożenia kończy się podfazą, która aktualizuje odpowiedni wpis §6 (lokalizacja, nazewnictwo, test referencyjny, polecenie uruchomienia). Po zakończeniu Modułu 3, §6 staje się kanoniczną odpowiedzią na pytanie „jak dodać test dla X w tym projekcie?” — i to, co `/10x-tdd` czyta w Lekcji 2.

### Granice lekcji

- Nie pisz kodu testowego. To jest Lekcja 2 (`/10x-tdd` i tworzenie testów jednostkowych).
- Nie konfiguruj hooków, cyklu życia hooków ani hooków debugowania. To jest Lekcja 3.
- Nie konfiguruj serwerów MCP, API Playwright, kodu e2e ani kodu scenariuszy wielomodalnych. To jest Lekcja 4.
- Nie uruchamiaj przepływu od błędu do poprawki do testu regresji. To jest Lekcja 5.
- Nie twórz potoków CI/CD od podstaw ani nie pisz YAML GitHub Actions. Przewodnik nazywa bramki; konfiguracja jest własnością Modułu 1 Lekcji 5 i Modułu 2 Lekcji 5.
- Nie benchmarkuj modeli wielomodalnych. Cytuj kryteria (koszt, opóźnienie, przyjazność dla agenta), nigdy ranking.
- Nie czytaj bazy kodu w poszukiwaniu wiedzy (grafy wywołań, schematy, „który plik jest właścicielem tej awarii”). To jest zadanie `/10x-research`, dla każdej fazy wdrożenia.

### Ścieżki używane w tej lekcji

- `context/foundation/test-plan.md` — umowa jakościowa tworzona i utrzymywana przez `/10x-test-plan`
- `context/foundation/prd.md` — główne źródło ryzyka
- `context/foundation/roadmap.md` — ważenie prawdopodobieństwa
- `context/foundation/tech-stack.md` — dane wejściowe stosu (jeśli istnieją)
- `context/archive/<change-id>/plan.md` — zaimplementowana powierzchnia ryzyka
- `context/changes/<change-id>/` — folder zmian dla każdej fazy wdrożenia (jeden na wiersz w §3)

<!-- END @przeprogramowani/10x-cli -->
