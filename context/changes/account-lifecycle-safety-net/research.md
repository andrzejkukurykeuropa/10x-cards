---
date: 2026-09-09T22:35:00+02:00
researcher: AndrzejKukuryk
git_commit: e8303702a5918ff5bde7e78a97315d5d051cd31c
branch: master
repository: 10x-cards
topic: "Account-lifecycle safety net — selection-logic edge cases for the inactive-account cleanup job (test-plan §3 Faza 4, Ryzyko #6)"
tags: [research, codebase, inactive-accounts, retention, cleanup-job, unit-tests, phase-4]
status: complete
last_updated: 2026-09-09
last_updated_by: AndrzejKukuryk
---

# Research: Account-lifecycle safety net (test-plan §3 Faza 4, Ryzyko #6)

**Date**: 2026-09-09T22:35:00+02:00
**Researcher**: AndrzejKukuryk
**Git Commit**: e8303702a5918ff5bde7e78a97315d5d051cd31c
**Branch**: master
**Repository**: 10x-cards

## Research Question

Faza 4 wdrożenia z `context/foundation/test-plan.md` — „Account-lifecycle safety net".
Ugruntuj Ryzyko #6: *zadanie czyszczenia nieaktywnych kont usuwa dane niewłaściwego
użytkownika lub uruchamia się wobec aktywnych / granicznych kont*. Konkretnie:

- Gdzie faktycznie leży „zapytanie selekcji" i jaka jest jego dokładna semantyka progu?
- Jak liczony jest próg 24-miesięcznej nieaktywności (kalendarzowo vs dni), jak
  traktowane są strefy czasowe, daty graniczne, `null last_sign_in_at`, niepoprawny
  znacznik czasu?
- Czy zadanie jest idempotentne przy ponownym uruchomieniu (usuwanie ORAZ e-mail
  ostrzegawczy)?
- Jaka jest najtańsza warstwa testowa, która daje prawdziwy sygnał, przy poszanowaniu
  negative-space z §7 (żadnego testu efektu ubocznego usuwania end-to-end)?

## Summary

**„Zapytanie selekcji" nie jest zapytaniem SQL.** Selekcja składa się z dwóch części:

1. **Iteracja po użytkownikach** — `admin.auth.admin.listUsers({ page, perPage: 50 })`
   w pętli offsetowej wewnątrz handlera POST
   (`src/pages/api/admin/cleanup-inactive-accounts.ts:77-163`). To *nie* jest
   deterministyczne przy jednoczesnym usuwaniu inline — udokumentowane jako
   „self-healing" (komentarz `:72-76`), bo zadanie biegnie codziennie.
2. **Klasyfikacja per konto** — dwie **czyste funkcje** w
   `src/lib/inactive-accounts.ts`: `isInactiveForDeletion()` (`:18-37`) i
   `isInWarningWindow()` (`:50-72`). Przyjmują wstrzykiwalne `now: Date`, nie mają
   żadnych zależności (Supabase, sieć, zegar systemowy jako argument domyślny).

**Testowalna powierzchnia dla Fazy 4 to dokładnie te dwie czyste funkcje** — warstwa
`tests/lib/` (§6.1 test-planu), środowisko `node`, zero mocka. To jest w pełni zgodne
z §7 negative-space: żadnego `listUsers`, żadnego `deleteUser`, żadnego efektu
ubocznego. Endpoint POST celowo pozostaje bez testu integracyjnego.

**Klasyfikatory są solidnie zaprojektowane**, ale mają konkretne, celowe (i jedno
niecelowe) zachowania brzegowe, które unit testy powinny zamrozić:

| Wejście | `isInactiveForDeletion` | `isInWarningWindow` | Status |
|---|---|---|---|
| oba `null` (nigdy nie zalogowany, brak `created_at`) | `true` (usuń) | `false` | celowe (F1 fix — patrz niżej) |
| `last_sign_in_at = null`, `created_at` świeże | fallback na `created_at` → `false` | fallback na `created_at` | **celowe, F1 CRITICAL fix** |
| niepoprawny znacznik czasu (`NaN`) | `true` (usuń) | `false` | celowe — „w razie wątpliwości usuń", warto **jawnie** zamrozić i zakwestionować |
| dokładnie na granicy 24 mies. (`lastActivity === threshold`) | `true` (`<=`) | `false` (`>` deletionThreshold) | celowe — granica należy do „usuń" |
| dokładnie na granicy 23 mies. | `false` | `true` (`<=` warningStart) | celowe |
| aktywne konto (logowanie wczoraj) | `false` | `false` | happy-path — **kontrola pozytywna obowiązkowa** |
| wzajemna wykluczalność dla tego samego wejścia | dokładnie jedno z {delete, warn, neither} | nigdy oba `true` | celowe (docstring `:42-49`) — **własność do asercji** |

**Idempotencja:**
- *Usuwanie* — idempotentne z natury: klasyfikacja jest bezstanowa i re-wyprowadzana
  z `last_sign_in_at`/`created_at` przy każdym uruchomieniu; zalogowanie się usuwa
  konto ze zbioru. Gałąź usuwania **nie** sprawdza żadnego markera.
- *E-mail ostrzegawczy* — idempotentny **tylko dzięki markerowi**
  `user_metadata.retention_warning_sent_at` (F5 WARNING fix). Bez markera magic-link
  szedł codziennie przez ~30 dni. Marker **nigdy nie jest czyszczony** przy logowaniu
  → luka cyklu życia (patrz Open Questions).

## Detailed Findings

### Klasyfikatory — `src/lib/inactive-accounts.ts` (SUT dla Fazy 4)

Plik: 72 linie, dwa czyste eksporty, zero importów.

- Stałe (`:8-9`): `DELETION_THRESHOLD_MONTHS = 24`, `WARNING_THRESHOLD_MONTHS = 23`.
- **`isInactiveForDeletion(lastSignInAt: string | null, createdAt: string | null = null, now: Date = new Date()): boolean`** (`:18-37`):
  - `reference = lastSignInAt ?? createdAt` (`:23`).
  - `reference === null` → `return true` (`:24-26`) — nigdy-zalogowany bez `created_at` traktowany jako do usunięcia.
  - `Number.isNaN(lastActivity.getTime())` → `return true` (`:29-31`) — niepoprawny znacznik czasu → usuń.
  - `threshold = new Date(now); threshold.setMonth(threshold.getMonth() - 24)` (`:33-34`) — **arytmetyka kalendarzowa**, nie 730 dni.
  - `return lastActivity.getTime() <= threshold.getTime()` (`:36`) — granica należy do „usuń".
- **`isInWarningWindow(lastSignInAt, createdAt = null, now = new Date()): boolean`** (`:50-72`):
  - `reference === null` → `return false` (`:56-58`) — już objęte przez `isInactiveForDeletion`.
  - `NaN` → `return false` (`:61-63`).
  - `warningStart = now - 23 mies.`, `deletionThreshold = now - 24 mies.` (`:65-69`), obie kalendarzowo.
  - `return lastActivity <= warningStart && lastActivity > deletionThreshold` (`:71`) — półotwarte okno `(24mies, 23mies]`.
  - Docstring (`:42-49`) gwarantuje wzajemną wykluczalność z `isInactiveForDeletion` dla tego samego wejścia.

**Sygnał podnoszący ryzyko** (nie kotwica): 3 commity/30 dni na tym pliku +
`cleanup-inactive-accounts.ts` (test-plan `:50`); PRD Guardrail „dane fiszek nie mogą
być tracone" (`prd.md:38`); historia F1 (CRITICAL) — pierwsza wersja tej funkcji
kasowała każde nigdy-niezalogowane konto (patrz Historical Context).

### Punkt wywołania — `src/pages/api/admin/cleanup-inactive-accounts.ts`

- `prerender = false` (`:7`).
- Bramka 1: `!CLEANUP_ENDPOINT_SECRET` → `503` (`:42-44`).
- Auth: `timingSafeEqual(authHeader ?? "", "Bearer " + secret)` — stała-czasowo, Web
  Crypto (workerd-compatible, nie Node `crypto`), `:20-32`, `:46-49`. Mismatch → `401`
  (F6 fix).
- `createAdminClient()` → `null` → `503` (`:51-54`); anon client dla OTP → `null` →
  `503` (`:56-61`).
- `dryRun = searchParams.get("dryRun") === "true"` — **domyślnie `false`** (`:63`,
  F2 CRITICAL fix — wcześniej `!== "false"` → produkcyjny cron zawsze no-op).
- Pętla `:77-163`: `listUsers({ page, perPage: 50 })`; błąd → `500` (`:79-83`);
  koniec na pustej lub krótkiej stronie (`:86-88`, `:159-161`).
- Per konto (`:90-157`):
  - `lastSignInAt = candidate.last_sign_in_at ?? null` (`:93`),
    `createdAt = candidate.created_at ?? null` (`:94`).
  - `isInactiveForDeletion(...)` → `deleteUser(candidate.id)` (`:103`); błędy do
    `errors[]` z `action: "delete"` (`:108-113`); `continue`.
  - inaczej `isInWarningWindow(...) && candidate.email` (`:117`):
    `alreadyWarned = Boolean(candidate.user_metadata?.retention_warning_sent_at)`
    (`:118`) → jeśli tak, `continue` (`:119-124`); inaczej
    `anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`
    (`:132-135`), potem `admin.auth.admin.updateUserById(id, { user_metadata: {
    ...candidate.user_metadata, retention_warning_sent_at: new Date().toISOString() }})`
    (`:139-141`); `markError` tylko logowany (`:142-148`).
- Odpowiedź `200 { processed, deleted, warned, errors, dryRun }` (`:165-168`) — tablice
  ID.
- Komentarz `:72-76`: offset-pagination + inline delete może pominąć konto w danym
  przebiegu; zaakceptowane jako self-healing (dzienny cron) — F4 fix.

### Runtime / harmonogram

- `src/lib/supabase-admin.ts` — `createAdminClient(): SupabaseClient | null`; zwraca
  `null` gdy brak `SUPABASE_URL` lub `SUPABASE_SERVICE_ROLE_KEY` (`:13-15`); klient z
  `auth: { autoRefreshToken: false, persistSession: false }` (`:16-21`); `service_role`
  **omija RLS**.
- `astro.config.mjs` `env.schema` (`:27-38`): `SUPABASE_URL`, `SUPABASE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CLEANUP_ENDPOINT_SECRET` — wszystkie
  `envField.string({ context: "server", access: "secret", optional: true })`. `optional`
  ⇒ każdy konsument null-checkuje i degraduje do `503`.
- `.github/workflows/cleanup-inactive-accounts.yml`: `schedule: cron "0 3 * * *"`
  (03:00 **UTC** — GitHub Actions cron zawsze UTC, brak override) + `workflow_dispatch`.
  Pojedynczy `curl --fail --silent --show-error -o /dev/null -X POST` z
  `Authorization: Bearer ${{ secrets.CLEANUP_ENDPOINT_SECRET }}` do
  `${{ secrets.PRODUCTION_URL }}/api/admin/cleanup-inactive-accounts?dryRun=false`.
  Body odpowiedzi (ID użytkowników) jest odrzucane (`-o /dev/null`, F7 fix) — brak
  jakiejkolwiek obserwowalności wyniku poza logami Cloudflare Workers.

### Kaskada usuwania

- Jedyna tabela danych użytkownika to `flashcards` (pola FSRS to kolumny na niej, nie
  osobna tabela — migracje `20260708000000_add_sm2_fields_to_flashcards.sql`,
  `20260802000000_migrate_flashcards_sm2_to_fsrs.sql`).
- `supabase/migrations/20260610000000_create_flashcards.sql:13`:
  `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- `admin.auth.admin.deleteUser()` kasuje wiersz `auth.users` → FK cascade kasuje
  fiszki. **Brak triggera `on_auth_user_deleted` / `handle_delete_user`** (grep po
  wszystkich `*.sql` potwierdza) — jedyny trigger to `set_flashcards_updated_at BEFORE
  UPDATE`.
- RLS: 4 polityki `USING (auth.uid() = user_id)` na `flashcards`
  (`20260610000000_create_flashcards.sql:29-46`); service-role je omija (BYPASSRLS).
  Zadanie czyszczące i tak nie odpytuje `flashcards` bezpośrednio.

### Ścieżka usuwania inicjowanego przez użytkownika (kontrast, poza zakresem Fazy 4)

- `src/components/AccountDeletion.tsx` — dialog: wpisz `"USUŃ"` (`:14`) + checkbox
  (`:27`) → `fetch("/api/account", { method: "DELETE" })` (`:49`).
- `src/pages/api/account.ts` `DELETE`: `locals.user` wymagane inaczej `401` (`:8-10`);
  `createAdminClient()` → `null` → `503`; `deleteUser(user.id)` → błąd `500`;
  best-effort `signOut()` (F3 fix dodał `console.error` w gałęzi else); `204`.
- Ta sama kaskada `auth.users` → `flashcards`. Bez ostrzeżenia, bez dryRun.

### Warstwa testów jednostkowych (`tests/lib/`) — konwencje do wykorzystania w planie

- `vitest.config.ts`: `getViteConfig()` z `astro/config`; `environment: "node"`;
  `include: ["tests/**/*.test.{ts,tsx}"]` (nowy plik łapany automatycznie);
  `globalSetup: ["tests/setup/global-setup.ts"]` (tworzy userów Supabase z `.env.test`
  — biegnie zawsze, ale nic nie robi dla czystej logiki; **cała suita** wymaga
  `.env.test`, który już istnieje); `testTimeout: 15000`; `passWithNoTests: true`.
  Brak `setupFiles`, brak `fileParallelism` override (Vitest default = on).
- `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`. `vitest ^4.1.11`.
  Pojedynczy plik: `npx vitest run tests/lib/inactive-accounts.test.ts` — **nie wymaga
  `npx supabase start`**.
- `tests/lib/` zawiera dziś **tylko** `fsrs.test.ts` (22 testy) — nowy plik będzie
  drugi.
- **Wzorzec z `tests/lib/fsrs.test.ts`** (203 linie): `import { describe, expect, it }
  from "vitest"`; SUT z `@/lib/...`; docblock `/** SCOPE ... test-plan §3 Faza X,
  Ryzyko #N ... ZASADA ASERCJI */`; **zamrożony `const NOW = new Date("2026-01-15T10:00:00.000Z")`**
  na poziomie modułu, przekazywany jako ostatni arg do każdego wywołania SUT;
  data-driven przez `for (const x of [...]) { it(\`...\`, () => {}) }`; brak `vi`, brak
  mocka, brak `jsdom`, brak helperów.
- **ESLint** (`eslint.config.js`, flat, `tseslint.configs.strictTypeChecked`): **brak
  override dla `tests/**`** — testy dostają pełny strict. `!` (non-null assertion)
  **zabronione** → wzorzec throwing-helper `toMs(iso: string | null)`
  (`fsrs.test.ts:44-48`). `x as T` zawężające null też zabronione.
  `no-unnecessary-condition` ON → nie strażuj `null` na typie nienullowalnym (ale
  parametry SUT są `string | null`, więc guardy `=== null` w asercjach są OK).
  `no-deprecated` ON (nieistotne tutaj — `Date` nie jest deprecated). `npm run lint`
  jest **czerwony** (49 błędów w `src/`); weryfikuj **tylko** przez
  `npx eslint tests/lib/inactive-accounts.test.ts` (zielone dla `tests/**`).
- Żaden istniejący test nie dotyka `src/lib/inactive-accounts.ts` (grep po `tests/` —
  0 trafień). Endpoint `cleanup-inactive-accounts.ts` nie ma testu (celowo — §7).

## Code References

- `src/lib/inactive-accounts.ts:8-9` — stałe progów (24 / 23 miesiące)
- `src/lib/inactive-accounts.ts:18-37` — `isInactiveForDeletion` (SUT #1): fallback
  `created_at`, `null`→true, `NaN`→true, granica `<=`, `setMonth(-24)` kalendarzowo
- `src/lib/inactive-accounts.ts:50-72` — `isInWarningWindow` (SUT #2): półotwarte okno
  `(24mies, 23mies]`, `null`→false, `NaN`→false, wzajemna wykluczalność
- `src/pages/api/admin/cleanup-inactive-accounts.ts:63` — `dryRun` domyślnie `false`
  (F2 fix)
- `src/pages/api/admin/cleanup-inactive-accounts.ts:72-76` — komentarz self-healing
  offset-pagination (F4 fix)
- `src/pages/api/admin/cleanup-inactive-accounts.ts:90-115` — gałąź usuwania (bez
  markera, idempotentna z natury)
- `src/pages/api/admin/cleanup-inactive-accounts.ts:117-148` — gałąź ostrzeżenia +
  marker `retention_warning_sent_at` (F5 fix)
- `src/lib/supabase-admin.ts:13-21` — `createAdminClient()` null-guard + config
- `astro.config.mjs:27-38` — `env.schema` (4 sekrety, wszystkie `optional`)
- `.github/workflows/cleanup-inactive-accounts.yml:7-8` — `cron "0 3 * * *"` (UTC)
- `supabase/migrations/20260610000000_create_flashcards.sql:13` — FK
  `ON DELETE CASCADE`
- `vitest.config.ts:1-12` — konfiguracja runnera (node, include, globalSetup)
- `tests/lib/fsrs.test.ts:1-48` — wzorzec warstwy `tests/lib/` (imports, `NOW`, `toMs`)
- `eslint.config.js:15-18` — `strictTypeChecked`, brak override `tests/**`

## Architecture Insights

- **Selekcja = czysta funkcja + brzydka pętla.** Cała logika progu jest już
  wyekstrahowana do czystego, wstrzykiwalnego modułu (`src/lib/inactive-accounts.ts`).
  To był świadomy ruch w archiwalnym planie („testowalność przez `dryRun` + czyste
  helpery" zamiast frameworka testowego). Faza 4 realizuje ostatni krok, którego plan
  z 2026-08 nie zrobił: prawdziwe unit testy tych helperów.
- **„W razie wątpliwości usuń".** `null` reference (oba argumenty) i niepoprawny
  znacznik czasu obie prowadzą do `isInactiveForDeletion → true`. Fallback na
  `created_at` (F1) ratuje realny przypadek (świeże / zaproszone konta), ale gdy i
  `created_at` jest `null` lub oba są śmieciem — konto ginie. To jest jawny wybór
  projektowy wart **jawnego testu** (asercja `true` + komentarz „dokumentujemy wybór
  »fail-closed to delete«"), a nie cichego pominięcia.
- **Dwie warstwy idempotencji.** Usuwanie jest idempotentne bo bezstanowe. Ostrzeżenie
  jest idempotentne tylko dzięki markerowi w `user_metadata` — stan trzymany poza
  bazą, w Supabase Auth. Klasyfikator (`isInWarningWindow`) sam **nie wie** o markerze;
  „już wysłane" żyje w endpointcie (`:118`). Unit test klasyfikatora **nie może** i
  **nie powinien** testować dedupu e-maila — to poza czystą funkcją.
- **Arytmetyka kalendarzowa, porównanie instant-based.** `setMonth(-24)` na lokalnym
  `Date`, potem porównanie `.getTime()` (UTC ms). Znaczniki z Supabase to ISO UTC.
  Ryzyko strefy czasowej jest niskie *w praktyce*, ale test-plan `:67` jawnie wymienia
  „strefa czasowa" jako założenie do zakwestionowania — plan powinien zawrzeć co
  najmniej jeden test z `now` i `lastActivity` po dwóch stronach północy UTC/lokalnej
  oraz test z 29-lutego jako datą graniczną (`setMonth` na 31 → przeskok miesiąca).
- **Granularność testu = właściwość, nie wartość** (anty-wzorzec §2 #6 / reguła §6.1
  pkt 4). Nie odtwarzaj `setMonth`. Asertuj: kierunek (konto starsze niż próg →
  `true`), wzajemna wykluczalność (nigdy oba `true` dla tego samego wejścia),
  przynależność do półotwartego okna, symetrię fallbacku (`last_sign_in_at=null`
  zachowuje się identycznie jak podanie tej samej wartości w `created_at`), zachowanie
  na dokładnej granicy (`lastActivity === threshold` → należy do „usuń").

## Historical Context (from prior changes)

Źródło: `context/archive/2026-08-04-account-deletion-retention/` (slice **S-06**,
zarchiwizowane 2026-08-08, PR #7). Brak `research.md` w tym folderze — badanie RODO
poszło inline do roadmapy.

- `context/archive/2026-08-04-account-deletion-retention/plan-brief.md:26-38` —
  tabela decyzji: **24 miesiące** (RODO art. 5(1)(e) storage limitation; praktyka
  CNIL/Discord 2023 ≈ 2–3 lata). Sugestia użytkownika „30 dni" **odrzucona** jako
  pomylenie deadline'u realizacji żądania (art. 12/17) z progiem nieaktywności.
- `plan.md:268-275` — jawnie: arytmetyka kalendarzowa `Date#setMonth(-24)`, **nie**
  stała 730 dni / 24×30.44.
- `plan.md:57-59, 320-328` — okno ostrzegawcze 23–24 miesiące; zbiory ostrzeżeń i
  usunięć **wzajemnie wykluczalne** (`plan.md:104-106`).
- `plan-brief.md:30`, `roadmap.md:214` — sygnał nieaktywności = `last_sign_in_at`
  (nie aktywność sesji nauki); prostszy wariant wybrany świadomie.
- `plan.md:64-77`, `plan-brief.md:49-55` — **jawnie NIE zrobione**: brak frameworka
  testowego (Vitest/Jest), weryfikacja tylko przez `dryRun` + ręcznie; brak
  `deletion_audit_log`; brak zewnętrznego dostawcy e-mail. **Faza 4 test-planu
  zamyka pierwszą z tych luk dla warstwy jednostkowej.**
- `context/archive/2026-08-04-account-deletion-retention/reviews/impl-review.md`
  (2026-08-08, APPROVED po triażu, commit `3cd5bb0`) — 7 findingów, wszystkie
  bezpośrednio dotyczą logiki selekcji:
  - **F1 CRITICAL** (`impl-review.md:23-40`) — `null`/niepoprawny `last_sign_in_at`
    → natychmiastowe usunięcie każdego nigdy-niezalogowanego konta. Fix A: parametr
    `createdAt` fallback. **To jest dokładnie klasa błędu, którą Faza 4 ma na stałe
    zamrozić testem regresji.**
  - **F2 CRITICAL** (`impl-review.md` / `:63`) — `dryRun` liczone jako `!== "false"`
    → produkcyjny cron (bez query stringa) zawsze biegł dry-run → zadanie nigdy nic
    nie usuwało. Fix: `=== "true"` + workflow dorzuca `?dryRun=false`.
  - **F4 WARNING** — offset-pagination pomija konto przy inline delete → komentarz
    self-healing (`cleanup-inactive-accounts.ts:72-76`).
  - **F5 WARNING** — e-mail ostrzegawczy wysyłany codziennie ~30 dni. Fix:
    `user_metadata.retention_warning_sent_at`.
  - **F6 WARNING** — naiwne `!==` porównanie sekretu (timing side-channel) →
    `timingSafeEqual` (Web Crypto).
  - F3 (silent signOut skip), F7 (curl loguje ID do logów Actions) — poza logiką
    selekcji.
- `plan-brief.md:77-83` — otwarte ryzyka: (a) szablon Magic Link jest współdzielony —
  jeśli kiedyś dojdzie logowanie magic-link, treść ostrzeżenia retencyjnego będzie
  wymagała rozróżnienia; (b) definicja „24 miesiące" musi pozostać spójna między
  `isInactiveForDeletion` a `isInWarningWindow`, żeby nie powstała luka/nakładka
  między oknami.
- `roadmap.md:42` (S-06, status `done`), `roadmap.md:203-216` (blok szczegółowy — bez
  nagłówka `###`, luka formatowania), `roadmap.md:256` (sekcja „done", „Lesson: —").
- Dług lintu (po archiwum): `src/lib/inactive-accounts.ts`,
  `src/pages/api/admin/cleanup-inactive-accounts.ts`,
  `src/components/AccountDeletion.tsx` są wśród plików robiących `npm run lint`
  czerwonym; 2 ręczne fixy `no-unnecessary-condition` w
  `cleanup-inactive-accounts.ts` (linie `:94` `created_at ?? null`, `:118`
  `user_metadata?.`). Śledzone w
  `context/changes/study-fsrs-scheduling-integrity/follow-ups/review-fixes.md` (F1) i
  `test-plan.md:373-384`. **Blokuje §3 Fazę 5, nie Fazę 4** — ale plan Fazy 4 nie
  powinien dokładać nowych naruszeń.

## Related Research

- `context/archive/2026-09-08-ai-generation-reliability/research.md` — poprzednia faza
  test-planu (Ryzyko #2/#5), wzorzec „świadoma regresja" i granica mocka dostawcy.
- `context/archive/2026-09-02-auth-access-control-coverage/research.md` — Faza 1
  (Ryzyko #1/#3), wzorzec testu integracyjnego dwóch tożsamości.
- `context/changes/study-fsrs-scheduling-integrity/` — Faza 3 (Ryzyko #4), wzorzec
  warstwy `tests/lib/` (`fsrs.test.ts`), reguła „asertuj właściwość, nie wartość".
- `context/foundation/test-plan.md` §2 (wiersz #6), §3 (wiersz 4), §6.1, §7.

## Open Questions

1. **Marker `retention_warning_sent_at` nigdy nie jest czyszczony przy logowaniu.**
   Scenariusz: konto ostrzeżone → użytkownik loguje się (wychodzi z okna) → ~23
   miesiące później znów nieaktywne → `alreadyWarned` = `true` (stały marker) → drugi
   e-mail **stłumiony** → konto usunięte po 24 miesiącach **bez świeżego ostrzeżenia**.
   To jest realna luka guardrailu „prawo do bycia poinformowanym", ale leży w
   endpointcie, **nie w czystej funkcji** — poza zakresem testowej Fazy 4 (§7).
   Zanotować jako kandydata na osobny `/10x-new` (naprawa produkcyjna), nie jako test.
2. **Zachowanie `setMonth` na końcu miesiąca.** `new Date("2026-03-31"); d.setMonth(d.getMonth()-1)`
   → 2026-03-03 (przeskok, bo luty nie ma 31). Dla progu 24-miesięcznego zdarza się
   to przy `now` = 31. dnia miesiąca, gdzie miesiąc `now-24` ma < 31 dni. Plan
   powinien zdecydować, czy to udokumentować testem jako „znane / akceptowalne ±1–3
   dni" (spójne z tolerancją self-healing z F4), czy zgłosić jako usterkę. Rekomendacja:
   udokumentować, nie eskalować — mieści się w istniejącej tolerancji dziennej.
3. **Brak testu spójności między oknami.** `plan-brief.md:82` wymienia „brak luki/nakładki
   między oknami" jako ryzyko. Najsilniejszy pojedynczy test Fazy 4: dla siatki
   `lastActivity` wokół obu granic — dokładnie jedno z `isInactiveForDeletion` /
   `isInWarningWindow` / (żadne) jest prawdziwe, nigdy oba. To jest asercja
   *właściwości*, nie *wartości*, i łapie każdą przyszłą zmianę stałych progów.
4. **`dryRun` a klasyfikatory** — `dryRun` nie zmienia klasyfikacji, tylko efekt
   uboczny. Klasyfikatory nie mają o nim pojęcia. Potwierdzenie: żaden test Fazy 4 nie
   dotyka `dryRun` (to byłby test endpointu → §7).
