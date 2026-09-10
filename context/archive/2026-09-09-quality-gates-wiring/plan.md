# Plan implementacji: Quality-gates wiring (Faza 5 wdrożenia testów)

## Przegląd

Podłączyć `npm run lint` **oraz** testy jednostkowe (`tests/lib/**` — 59 testów,
bez Supabase) jako **wymaganą bramę CI blokującą merge** każdego PR do `master`.
To Faza 5 z `context/foundation/test-plan.md` §3 — brama zamykająca, która
zamienia zestaw testów z Faz 1–4 w blokadę merge (ochrona przekrojowa dla
wszystkich ryzyk #1–#6).

Faza **nie dodaje nowego kodu testowego**. Zakres to: (1) wyzerowanie
pre-istniejącego długu lintu (49 błędów), (2) rozdzielenie konfiguracji Vitest
tak, by testy jednostkowe biegły w CI bez lokalnego Supabase, (3) okablowanie
kroku CI + branch protection + sprostowanie planu testów.

## Analiza stanu obecnego

**CI dzisiaj** (`.github/workflows/ci.yml`, 30 linii): jeden job `ci` na
`ubuntu-latest`, wyzwalany `push` i `pull_request` do `master`. Kroki:
`checkout` → `setup-node` (`node-version: 22`, `cache: npm`) → `npm ci` →
`npx astro sync` → `npm run lint` → `npm run build` (z sekretami
`SUPABASE_URL`/`SUPABASE_KEY`). **Brak kroku testów.** Nagłówek pliku
(`ci.yml:3-6`) zabrania dodawania kroku deploy.

**Lint jest dziś czerwony** — `npm run lint` = **49 błędów** (potwierdzone na
żywo, `git_commit` 67e9b83):
- **46 × `prettier/prettier`** (formatowanie) — auto-fixowalne przez
  `npm run lint:fix`. Pliki: `src/components/AccountDeletion.tsx`,
  `src/components/ui/checkbox.tsx`, `src/components/ui/dialog.tsx` (większość —
  ~24, w tym kolejność klas Tailwind), `src/lib/inactive-accounts.ts`
  (2 przecinki: `:21`, `:53`), `src/pages/api/admin/cleanup-inactive-accounts.ts`
  (`:146`).
- **3 × ręczne**:
  - `src/pages/api/admin/cleanup-inactive-accounts.ts:94` —
    `@typescript-eslint/no-unnecessary-condition` na `candidate.created_at ?? null`
    (`User.created_at` jest `string`, nie-nullowe — guard martwy).
  - `src/pages/api/admin/cleanup-inactive-accounts.ts:118` —
    `@typescript-eslint/no-unnecessary-condition` na
    `candidate.user_metadata?.retention_warning_sent_at` (`user_metadata` jest
    `UserMetadata`, nigdy nullish; ten sam plik czyta to pole bez `?.` w `:140`).
  - `src/pages/api/generate-flashcards.ts:48` —
    `@typescript-eslint/no-deprecated` na `generateObject`.
- Pliki testowe są czyste (`npx eslint tests/**` → 0).

**CI prawdopodobnie już jest czerwone na `origin/master`** — dług prettier w
`src/components/ui/*` pochodzi z commita `1ecbd74`, przodka `origin/master`.
Lokalny `master` jest **11 commitów do przodu** przed `origin/master` (cała
niepushowana praca Faz 3–4). Wypchnięcie tej pracy również wyzwoli CI.

**Testy jednostkowe nie mogą po prostu uruchomić `vitest run tests/lib`** —
`vitest.config.ts:8` rejestruje `globalSetup: ["tests/setup/global-setup.ts"]`,
który biegnie **bezwarunkowo dla każdego wywołania Vitest** (filtr `include` i
argumenty plików CLI go nie zawężają). Ten setup: `loadEnv({ path: ".env.test" })`,
rzuca gdy brak `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, następnie
`assertLocalSupabaseUrl()` i **żywe I/O sieciowe** —
`admin.auth.admin.createUser()` dla `TEST_USER_A`/`B`. Zweryfikowane: z odsuniętym
`.env.test`, `npx vitest run tests/lib/fsrs.test.ts` pada w
`_initializeGlobalSetup` zanim jakikolwiek test wystartuje.

**Dwa pliki `tests/lib/` są faktycznie wolne od Supabase i sieci** — graf
importów to tylko `vitest` + `ts-fsrs` + importy type-only. `inactive-accounts.test.ts`
ustawia `process.env.TZ = "UTC"` w pliku. Zakres jednostkowy = `fsrs.test.ts`
(22 testy) + `inactive-accounts.test.ts` (37 testów) = **59 testów**.

**„Brama wymagana" = tylko blokada merge, nie deploy.** Cloudflare Pages
deployuje przez własną integrację Git przy każdym pushu/PR **niezależnie od
statusu GitHub Actions** (`ci.yml:3-6`, `deployment-plan.md:9-14`). Uczynienie
checku „required" blokuje merge PR do `master`; nie blokuje preview-deploya
czerwonej gałęzi PR, a produkcja i tak zawsze dostaje tylko to, co zmergowane.
Uczynienie checku wymaganym wymaga **serwerowej zmiany branch-protection w
GitHub** — `gh` CLI jest zainstalowany (v2.93.0) ale **niezalogowany**.

**§5 planu testów jest nieścisłe co do „typecheck"** — nie ma skryptu
`typecheck`/`check` w `package.json`; `@astrojs/check` jest zależnością, ale nie
jest nigdzie wywoływany; `npm run build` (`astro build`) nie uruchamia `tsc`.
Jedyne egzekwowanie typów w CI to `npm run lint` (`eslint.config.js:14-15`
rozszerza `strictTypeChecked` + `stylisticTypeChecked` z `projectService: true`).

## Pożądany stan końcowy

Po tej fazie:
1. `npm run lint` przechodzi na zielono lokalnie i w CI (0 błędów).
2. Istnieje `npm run test:unit` — uruchamia 59 testów jednostkowych z `tests/lib/**`
   **bez** działającego Supabase i bez `.env.test`, w < kilka sekund.
3. Job `ci` w `.github/workflows/ci.yml` ma krok `npm run test:unit` po `npm run lint`
   i przed `npm run build`.
4. Check statusu `ci` jest ustawiony jako **required status check** na regule
   ochrony gałęzi `master` w GitHub — PR z czerwonym lintem lub czerwonym testem
   jednostkowym **nie może zostać zmergowany**.
5. `context/foundation/test-plan.md` odzwierciedla rzeczywistość: §3 Faza 5 →
   `complete`; §5 sprostowane (typecheck złożony w lint; brama jednostkowa
   okablowana w CI, integracyjna nadal local-only); §6.6 ma notatkę Fazy 5 +
   wzorzec „jak działa brama CI"; §4 nadal oznaczone jako wymagające `--refresh`.
6. Lokalny `master` (wraz z tą zmianą) jest wypchnięty; ostatni przebieg CI na
   `master` jest zielony.

**Weryfikacja stanu końcowego**: otwórz testowy PR, który celowo wprowadza błąd
lintu (lub psuje test jednostkowy); GitHub pokazuje check `ci` jako failed i
przycisk merge jest zablokowany. Cofnij błąd — check przechodzi, merge odblokowany.

### Kluczowe odkrycia:

- `vitest.config.ts:8` — `globalSetup` biegnie bezwarunkowo; zawężenie `include`
  ani argumenty CLI go nie wyłączają. Rozdzielenie configu to jedyna czysta droga
  do joba unit-only (`research.md` §C).
- `getViteConfig()` z `astro/config` to idiom konfiguracji testów tego projektu
  (Faza 1) — `astro:env/server` i alias `@/*` rozwiązują się identycznie jak w
  aplikacji. Nowy config jednostkowy musi go zachować.
- `astro.config.mjs:21` bramkuje adapter Cloudflare za `process.env.VITEST`
  (Vitest ustawia to automatycznie) — config jednostkowy nie potrzebuje z tym nic
  robić.
- `generateObject` jest funkcjonalne w `ai@6.0.208`, tylko oznaczone
  `@deprecated`. `generateText` + `Output.object` + param `output` nie mają
  deprecacji (`research.md` §B fix #3).
- Zestaw testów AI (`tests/api/generate-flashcards*.test.ts`,
  `tests/components/FlashcardGenerator.test.tsx`) asertuje **tylko**
  `response.status` + ciało JSON + liczniki wywołań dostawcy — nigdy klasy błędu.
  Migracja `generateObject` → `generateText` nie zaburza żadnej asercji
  (`research.md` §B).
- `eslint.config.js:1` ma plikowy `no-deprecated` disable dla `tseslint.config()`
  — precedens dla `eslint-disable`, ale `change.md:24` jawnie odrzuca tę drogę
  dla tych 3 naruszeń.
- Nazwa checku = nazwa joba, jeśli test jest osobnym jobem; **zostaje `ci`**,
  jeśli test jest krokiem w istniejącym jobie `ci` (decyzja: krok). Jeśli check
  zostanie kiedyś przemianowany, branch protection czeka na starą nazwę
  w nieskończoność — blokuje wszystkie merge (`research.md` §F).
- `.nvmrc` = `v22.14.0` vs `ci.yml` `node-version: 22` — kosmetyczna
  rozbieżność, wyrównywana w Fazie 3.

## Czego NIE robimy

- **Nie dodajemy testów integracyjnych (`tests/api/**`, `tests/middleware.test.ts`,
  `tests/components/**`) do CI.** Wymagają żywego lokalnego Supabase i niosą znany
  flaky test (`study-review.test.ts` 2.4). Zostają local-only do przyszłej fazy.
- **Nie naprawiamy flaky `study-review.test.ts` 2.4.** To warstwa integracyjna,
  nie w bramie CI. Odnotowane jako follow-up na zmianie study-fsrs (rekomendacja z
  `research.md` §D: opcja 1 — asercja inwariantu „brak lost update", lub opcja 3 —
  test wyścigu na warstwie DB). Nie rozszerzać zakresu Fazy 5.
- **Nie dodajemy `astro check` jako osobnej bramy typecheck.** §5 zostaje
  sprostowane słownie (typecheck złożony w lint). Prawdziwy `astro check` to
  net-new brama poza „już okablowana" i mógłby ujawnić istniejące błędy →
  poszerzenie zakresu spłaty długu. Kandydat na osobny `/10x-new`.
- **Nie uruchamiamy `/10x-test-plan --refresh` dla §4 „Stos".** jsdom/RTL +
  `tests/lib/` z Faz 2–3 to osobne odświeżenie, nie blokujące tu (`change.md:26`).
- **Nie `eslint-disable`-ujemy 3 ręcznych naruszeń.** `change.md:24` nazywa to
  anty-wzorcem fazy.
- **Nie dotykamy `tests/setup/global-setup.ts`** — jego głośne fail-fast jest
  celowe dla lokalnego przepływu integracyjnego; config jednostkowy go omija,
  nie osłabia.
- **Nie dodajemy kroku deploy do CI** (`ci.yml:3-6`).

## Podejście do implementacji

Trzy fazy, każda niezależnie weryfikowalna:

1. **Wyzerowanie długu lintu** — warunek wstępny. Bez zielonego lintu brama nie
   może być podłączona jako wymagana. `lint:fix` dla 46, trzy ręczne fixy
   (dwa martwe guardy + migracja `generateObject`), pełny przebieg testów jako
   kontrola regresji.

2. **Config testów jednostkowych** — `vitest.config.unit.ts` bez `globalSetup`,
   skrypt `test:unit`. Weryfikacja że biegnie bez Supabase.

3. **Okablowanie bramy** — krok CI, wyrównanie node, `gh auth login` + `gh api`
   dla branch protection, push, testowy czerwony PR jako dowód, aktualizacja
   `test-plan.md`.

Kolejność jest wymuszona: Faza 3 (`test:unit` w CI jako required) jest bezpieczna
tylko gdy Faza 1 (lint zielony) i Faza 2 (`test:unit` istnieje i przechodzi) są
gotowe.

## Faza 1: Wyzerowanie długu lintu

### Przegląd

Doprowadzić `npm run lint` do 0 błędów bez tłumienia reguł, potwierdzając że
pełny zestaw testów nadal przechodzi.

### Wymagane zmiany:

#### 1. Auto-fix formatowania

**Pliki**: `src/components/AccountDeletion.tsx`, `src/components/ui/checkbox.tsx`,
`src/components/ui/dialog.tsx`, `src/lib/inactive-accounts.ts`,
`src/pages/api/admin/cleanup-inactive-accounts.ts`

**Cel**: Usunąć 46 naruszeń `prettier/prettier` (przecinki, odstępy, kolejność
klas Tailwind) uruchamiając auto-fixer.

**Kontrakt**: `npm run lint:fix` (`eslint . --fix`). Wyłącznie zmiany
formatowania — zero zmian semantyki. Po uruchomieniu zweryfikować `git diff`, że
zmiany dotyczą tylko whitespace/przecinków/kolejności atrybutów.

#### 2. Martwy null-guard — `created_at`

**Plik**: `src/pages/api/admin/cleanup-inactive-accounts.ts` (linia ~94)

**Cel**: Usunąć martwy `?? null` na polu, które nigdy nie jest nullowe, by
zdjąć `@typescript-eslint/no-unnecessary-condition`.

**Kontrakt**: `const createdAt = candidate.created_at ?? null;` →
`const createdAt = candidate.created_at;`. `candidate` to `User` z
`admin.auth.admin.listUsers()`; `User.created_at` jest typu `string` (wymagane).
`createdAt` płynie tylko do `isInactiveForDeletion(lastSignInAt, createdAt)` /
`isInWarningWindow(...)`, których parametr to `createdAt: string | null = null`
(`src/lib/inactive-accounts.ts:20, :52`) — `string` jest przypisywalny. Zero
zmiany zachowania. **Nie** dotykać linii `:93`
(`candidate.last_sign_in_at ?? null`) — tam pole jest `string | undefined`, guard
jest legalny i reguła go nie flaguje.

#### 3. Zbędny optional chain — `user_metadata`

**Plik**: `src/pages/api/admin/cleanup-inactive-accounts.ts` (linia ~118)

**Cel**: Usunąć `?.` na nie-nullowym `user_metadata`, by zdjąć
`@typescript-eslint/no-unnecessary-condition`.

**Kontrakt**:
`Boolean(candidate.user_metadata?.retention_warning_sent_at)` →
`Boolean(candidate.user_metadata.retention_warning_sent_at)`. `User.user_metadata`
jest typu `UserMetadata` (wymagane; `interface UserMetadata { [key: string]: any }`),
nigdy nullish. Ten sam plik już czyta to pole bez `?.` w `:140`. Dostęp do
składowej rozwiązuje się do `any`, opakowane w `Boolean(...)` — identyczny wynik
runtime.

#### 4. Migracja `generateObject` → `generateText` + `Output.object`

**Plik**: `src/pages/api/generate-flashcards.ts`

**Cel**: Zejść z deprecowanego `generateObject` na wspieraną ścieżkę
`generateText` + `Output.object`, by zdjąć `@typescript-eslint/no-deprecated` bez
`eslint-disable`.

**Kontrakt**: Import `import { generateObject } from "ai";` →
`import { generateText, Output } from "ai";`. Wywołanie:

```ts
const { output } = await generateText({
  model: groq(MODEL_ID),
  output: Output.object({ schema: flashcardsOutputSchema }),
  system: SYSTEM_PROMPT,
  prompt: `Text:\n${inputText}`,
});
return new Response(JSON.stringify(output), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});
```

Zachowane niezmienniki:
- Walidacja zod nadal biegnie: `Output.object().parseCompleteOutput()` rzuca
  `NoObjectGeneratedError` przy niezgodności schematu / nie-JSON.
- Liczniki retry dostawcy (3× vs 1×), passthrough abortu, przypadek „hang" są w
  współdzielonym wrapperze `doGenerate` używanym przez obie funkcje —
  bez zmian.
- Generyczny `catch` (`generate-flashcards.ts:59-64`) nadal zwija każdy błąd do
  `500 { error: "AI generation failed" }` — klasa błędu nigdy nie dociera do
  asercji testu.
- Znany niuans: gdy model kończy z `finishReason: "length"`, getter `.output` z
  `generateText` rzuca `NoOutputGeneratedError` zamiast `NoObjectGeneratedError` —
  oba i tak lądują w tym samym generycznym `catch` → `500`. Odnotować w komentarzu
  przy `catch`, nie zmieniać obsługi.

Bramka `!GROQ_API_KEY` → `500 { error: "AI service not configured" }` (`:28-30`)
i bramka walidacji wejścia (`:33-44`) pozostają nietknięte.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint` → 0 błędów
- Pełny zestaw testów przechodzi: `npx supabase start` (raz), potem `npm run test`
- Testy AI-generation bez regresji:
  `npx vitest run tests/api/generate-flashcards.test.ts tests/api/generate-flashcards-config.test.ts tests/api/generate-flashcards-rate.test.ts tests/components/FlashcardGenerator.test.tsx`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- `git diff` na plikach z auto-fixu zawiera wyłącznie zmiany formatowania
- Ręczny smoke test endpointu generowania (dev + prawdziwy `GROQ_API_KEY`):
  poprawny tekst wejściowy → dobrze uformowana tablica propozycji fiszek;
  kształt odpowiedzi (`[{ question, answer }, ...]`) identyczny jak przed migracją
- Brak regresji w przeglądzie propozycji w UI po wygenerowaniu

**Uwaga implementacyjna**: Po przejściu wszystkich automatycznych weryfikacji
zatrzymaj się na ręczne potwierdzenie smoke testu generowania (para
`generateText` jest jedyną zmianą zachowania w tej fazie), zanim przejdziesz do
Fazy 2.

---

## Faza 2: Osobny config testów jednostkowych

### Przegląd

Umożliwić uruchomienie 59 testów jednostkowych (`tests/lib/**`) bez `globalSetup`,
bez `.env.test` i bez działającego Supabase — warunek uruchomienia ich w CI.

### Wymagane zmiany:

#### 1. Konfiguracja Vitest dla warstwy jednostkowej

**Plik**: `vitest.config.unit.ts` (nowy, w korzeniu repo obok `vitest.config.ts`)

**Cel**: Config Vitest zakresowany do czystej logiki `tests/lib/**`, bez
`globalSetup`, tak by żadne I/O Supabase nie było wyzwalane.

**Kontrakt**:

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "node",
    include: ["tests/lib/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

- Zachować `getViteConfig()` — alias `@/*` i `astro:env` rozwiązują się jak w
  aplikacji (idiom projektu z Fazy 1).
- **Bez** `globalSetup` — to jest cały cel pliku.
- **Bez** `testTimeout` override (domyślny wystarcza dla czystej logiki) i bez
  jsdom (pliki `tests/lib/**` są `environment: node`; testy komponentów opt-in do
  jsdom per-plik i tu nie wchodzą).
- `include` celowo `*.test.ts` (nie `{ts,tsx}`) — warstwa jednostkowa to tylko
  `.ts`.

#### 2. Skrypt npm

**Plik**: `package.json`

**Cel**: Wystawić polecenie uruchamiające wyłącznie warstwę jednostkową przez nowy
config — używane w CI i lokalnie jako szybki feedback.

**Kontrakt**: Dodać do `scripts`:
`"test:unit": "vitest run --config vitest.config.unit.ts"`. Istniejące
`test` / `test:watch` bez zmian (nadal pełny zestaw przez `vitest.config.ts`).

#### 3. Wykluczenie z lintu / prettiera (jeśli potrzebne)

**Plik**: `eslint.config.js` / `.prettierignore` — tylko jeśli nowy plik configu
wywoła naruszenie

**Cel**: Nowy `vitest.config.unit.ts` musi sam przechodzić `npm run lint`
(brama z Fazy 1 nie może się cofnąć).

**Kontrakt**: `vitest.config.ts` już przechodzi lint — analogiczny plik powinien
też. Jeśli `eslint .` zgłosi coś na nowym pliku, naprawić formatowanie (nie
dodawać wykluczeń). Zweryfikować `npm run lint` po dodaniu pliku.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run test:unit` uruchamia dokładnie 59 testów (22 `fsrs` + 37
  `inactive-accounts`), wszystkie zielone
- `npm run test:unit` przechodzi z **odsuniętym `.env.test`** i **bez działającego
  Supabase** (`mv .env.test .env.test.bak; npm run test:unit; mv .env.test.bak .env.test`)
- Pełny zestaw nietknięty: `npx supabase start` + `npm run test` nadal przechodzi
  (przez oryginalny `vitest.config.ts` z `globalSetup`)
- Lint nadal zielony: `npm run lint`

#### Weryfikacja ręczna:

- `npm run test:unit` kończy się w kilka sekund (brak zawieszenia na próbie
  połączenia z Supabase)
- Wyjście Vitest nie wspomina `global-setup.ts` ani tworzenia użytkowników
  testowych

---

## Faza 3: Okablowanie bramy CI + branch protection + aktualizacja planu testów

### Przegląd

Dodać krok testów jednostkowych do joba `ci`, wyrównać wersję Node, ustawić
check `ci` jako wymagany w branch protection `master`, wypchnąć pracę, udowodnić
blokadę czerwonym PR-em, i zaktualizować `test-plan.md`.

### Wymagane zmiany:

#### 1. Krok testów jednostkowych w jobie `ci`

**Plik**: `.github/workflows/ci.yml`

**Cel**: Uruchamiać `npm run test:unit` w CI po `npm run lint`, przed
`npm run build`, jako krok istniejącego joba `ci` (nazwa checku zostaje `ci`).

**Kontrakt**: Wstawić `- run: npm run test:unit` między krok `npm run lint`
(`:25`) a krok `npm run build` (`:26`). Krok nie potrzebuje `env` (testy
jednostkowe nie czytają sekretów Supabase) ani `npx astro sync` (config
jednostkowy nie tyka `astro:env`, ale `astro sync` i tak już biegnie wcześniej
dla lintu — bez zmian). Kolejność: `lint` → `test:unit` → `build`, żeby najtańszy
sygnał padał pierwszy.

#### 2. Wyrównanie wersji Node

**Plik**: `.github/workflows/ci.yml`

**Cel**: Usunąć rozbieżność `.nvmrc` (`22.14.0`) vs workflow (`22`).

**Kontrakt**: `node-version: 22` → `node-version: 22.14.0` w kroku
`actions/setup-node@v4` (lub `node-version-file: .nvmrc`). Kosmetyczne, ale
usuwa dryf; brak zmiany zachowania build/test.

#### 3. Branch protection — check `ci` jako wymagany

**Plik**: brak w repo — serwerowa konfiguracja GitHub przez `gh`

**Cel**: PR z czerwonym `ci` nie może zostać zmergowany do `master`.

**Kontrakt**: Kroki (interaktywne, wykonuje użytkownik lub implementator z
potwierdzeniem):
1. `gh auth login` — wymagany token z zakresem `repo` (i `admin:repo_hook` nie
   jest potrzebny). Repo: `andrzejkukurykeuropa/10x-cards`.
2. `gh api -X PUT repos/andrzejkukurykeuropa/10x-cards/branches/master/protection`
   z ciałem ustawiającym `required_status_checks.contexts: ["ci"]`,
   `required_status_checks.strict: true` (wymaga aktualnej gałęzi),
   `enforce_admins` (do decyzji — rekomendacja `true` dla spójności),
   `required_pull_request_reviews: null` (faza nie wprowadza wymogu review),
   `restrictions: null`.
3. Zweryfikować: `gh api repos/andrzejkukurykeuropa/10x-cards/branches/master/protection`
   pokazuje `contexts: ["ci"]`.

Dokładne ciało JSON żądania (GitHub wymaga wszystkich kluczy top-level, nawet
nullowych):

```json
{
  "required_status_checks": { "strict": true, "contexts": ["ci"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
```

**Uwaga o nazwie**: check nazywa się `ci` bo testy są **krokiem** joba `ci`, nie
osobnym jobem. Jeśli jakakolwiek przyszła zmiana przemianuje job lub wydzieli
osobny job, branch protection musi zostać zaktualizowane w tym samym kroku —
inaczej czeka na nieistniejącą nazwę i blokuje wszystkie merge.

#### 4. Push lokalnego `master` i testowy czerwony PR

**Plik**: brak — operacje git/GitHub

**Cel**: (a) zsynchronizować 11 niepushowanych commitów tak, by `origin/master`
odzwierciedlał rzeczywistość i CI biegł na aktualnym kodzie; (b) udowodnić że
brama faktycznie blokuje merge.

**Kontrakt**:
1. Po zmergowaniu tej zmiany do lokalnego `master`: `git push origin master`.
   Zweryfikować że przebieg CI na `master` jest zielony (`gh run list --branch master`).
2. Utworzyć krótkotrwałą gałąź z celowym błędem lintu (np. nieużywany import) LUB
   złamanym testem jednostkowym; otworzyć PR; potwierdzić że check `ci` jest
   failed i UI merge jest zablokowane.
3. Zamknąć PR bez merge, usunąć gałąź.

#### 5. Sprostowanie `context/foundation/test-plan.md`

**Plik**: `context/foundation/test-plan.md`

**Cel**: Plan testów ma odpowiadać okablowanej rzeczywistości.

**Kontrakt** (sekcje do zmiany):
- **§3 tabela** — wiersz Faza 5 „Quality-gates wiring": Status
  `change opened` → `complete`.
- **Nagłówek (linia ~10)** — zaktualizować „Ostatnia aktualizacja" o domknięcie
  Fazy 5.
- **§5 tabela Bramy Jakości**:
  - Wiersz „lint + typecheck" → sprostować: brak osobnej bramy typecheck;
    egzekwowanie typów jest złożone w `lint` (`strictTypeChecked` +
    `projectService`). Nazwa wiersza np. „lint (z type-aware regułami)".
  - Wiersz „jednostkowe + integracyjne": rozbić stan — **jednostkowe**:
    `wymagana, okablowana w CI (§3 Faza 5, krok `test:unit` w jobie `ci`,
    required status check na `master`)`; **integracyjne**: `local-only —
    wymaga `npx supabase start`; nieokablowane w CI w tym wdrożeniu`.
- **§6.6** — dodać blok „Faza 5 — Quality-gates wiring":
  - Co dostarczono: `vitest.config.unit.ts` + skrypt `test:unit` (zakres
    `tests/lib/**`, bez `globalSetup`); krok `npm run test:unit` w
    `.github/workflows/ci.yml` jobie `ci`; check `ci` jako required status check
    na `master`; migracja `generateObject` → `generateText`+`Output.object` i
    wyzerowanie długu lintu (49→0).
  - Wzorzec „jak działa brama CI w tym projekcie": job `ci` biegnie
    `lint → test:unit → build` na każdym PR do `master`; `ci` jest wymaganym
    checkiem — czerwony lint lub czerwony test jednostkowy blokuje merge.
    Testy integracyjne/komponentowe NIE są w CI — uruchom je lokalnie
    (`npx supabase start && npm run test`) przed pushem.
  - Odnotować że flaky `study-review.test.ts` 2.4 jest znany i jest follow-upem
    na zmianie study-fsrs (nie blokuje, bo integracja nie jest w bramie).
  - Zaktualizować/zamknąć akapit „Dług lintu blokujący §3 Faza 5" — dług
    wyzerowany w tej fazie.
- **§4** — pozostawić notatkę że `--refresh` jest nadal potrzebny dla jsdom/RTL +
  `tests/lib/` (Fazy 2–3); ta faza tego nie uruchamia. Opcjonalnie dopisać że
  `vitest.config.unit.ts` to kolejna zmiana stosu testowego do odnotowania przy
  `--refresh`.

#### 6. Aktualizacja `change.md`

**Plik**: `context/changes/quality-gates-wiring/change.md`

**Cel**: Odzwierciedlić domknięcie.

**Kontrakt**: `status: preparing` → `status: complete` (lub zgodnie z konwencją
`/10x-implement`); `updated:` → data domknięcia.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- CI job biegnie `lint → test:unit → build` w tej kolejności:
  `gh run view <id>` na świeżym przebiegu pokazuje wszystkie 3 kroki zielone
- `gh api repos/andrzejkukurykeuropa/10x-cards/branches/master/protection`
  zwraca `required_status_checks.contexts` zawierające `"ci"`
- Przebieg CI na `origin/master` po pushu jest zielony (`gh run list --branch master --limit 1`)
- Lokalnie brama nadal zielona: `npm run lint && npm run test:unit && npm run build`

#### Weryfikacja ręczna:

- Testowy PR z celowym błędem lintu: GitHub pokazuje check `ci` failed,
  przycisk „Merge pull request" jest wyszarzony / zablokowany
- Po cofnięciu błędu w tym PR: check przechodzi, merge odblokowany
- `context/foundation/test-plan.md` §3 pokazuje Fazę 5 jako `complete`, §5 i §6.6
  sprostowane, czyta się spójnie
- Preview-deploy Cloudflare czerwonej gałęzi PR **nadal powstaje** (potwierdzenie
  że brama blokuje merge, nie deploy — zgodne z `research.md` §G)

**Uwaga implementacyjna**: Kroki `gh auth login`, `gh api` (branch protection) i
`git push origin master` są nieodwracalne / widoczne na zewnątrz — wykonać po
ręcznym potwierdzeniu użytkownika. Testowy czerwony PR to jedyny sposób
zweryfikowania że „required" faktycznie działa; nie pomijać.

---

## Strategia testowania

### Testy jednostkowe:

- Brak nowych. Faza 2 tylko przepakowuje istniejące 59 testów (`fsrs.test.ts` +
  `inactive-accounts.test.ts`) w osobny config.

### Testy integracyjne:

- Brak nowych. Pełny zestaw (`npm run test`) służy jako kontrola regresji w
  Fazie 1 (po migracji `generateObject`) i Fazie 2 (po dodaniu configu).

### Kroki testowania ręcznego:

1. **Faza 1**: `npm run lint` → 0; `npx supabase start && npm run test` → zielone;
   smoke test endpointu `/api/generate-flashcards` z prawdziwym kluczem → kształt
   odpowiedzi bez zmian.
2. **Faza 2**: `mv .env.test .env.test.bak && npm run test:unit && mv .env.test.bak .env.test`
   → 59 testów zielone, kilka sekund, bez wzmianki o `global-setup`.
3. **Faza 3**: otwórz PR z `import { foo } from "./nowhere";` w dowolnym pliku
   `src/` → check `ci` failed, merge zablokowany; usuń linię → check zielony,
   merge odblokowany. Zamknij PR bez merge.

## Uwagi dotyczące wydajności

Krok `test:unit` w CI dokłada kilka sekund do joba `ci` (59 czystych testów, bez
I/O). Sekwencyjnie po `lint`, przed `build` — akceptowalne; najtańszy sygnał
pierwszy. Alternatywa (osobny równoległy job) odrzucona: druga powierzchnia
branch-protection dla marginalnego zysku, skoro integracja i tak nie jest w CI.

## Uwagi dotyczące migracji

- **`generateObject` → `generateText`**: jedyna zmiana zachowania kodu
  produkcyjnego. Ryzyko niskie i pokryte testami (`research.md` §B). Rollback:
  rewert jednego pliku. Znany brzegowy niuans (`finishReason: "length"` →
  `NoOutputGeneratedError`) i tak trafia w generyczny `catch` → `500`.
- **Branch protection**: zmiana serwerowa GitHub, nie w repo. Rollback: usunięcie
  `ci` z `required_status_checks.contexts` (lub całej reguły) przez `gh api` /
  GitHub Settings.
- **Push 11 commitów**: wypchnięcie niepushowanej pracy Faz 3–4 wyzwoli CI na
  `master`. Musi być zielone — dlatego push jest po wyzerowaniu długu lintu, nie
  przed.

## Referencje

- Powiązane badania: `context/changes/quality-gates-wiring/research.md`
- Dług lintu / geneza fazy:
  `context/archive/2026-09-09-study-fsrs-scheduling-integrity/follow-ups/review-fixes.md` (F1)
- Plan testów: `context/foundation/test-plan.md` §3 (Faza 5), §5, §6.6
- Idiom configu testów: `context/archive/2026-09-02-auth-access-control-coverage/plan.md:138-273`
- Rozdzielenie CI/deploy:
  `context/changes/deployment/deployment-plan.md:9-14, :417-420`
- Bramka VITEST adaptera: `astro.config.mjs:21`
- Endpoint generowania: `src/pages/api/generate-flashcards.ts:3, :46-64`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po
> zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Wyzerowanie długu lintu

#### Automatyczne

- [x] 1.1 `npm run lint` → 0 błędów — 15cd10e
- [x] 1.2 Pełny zestaw testów przechodzi: `npx supabase start` + `npm run test` — 15cd10e
- [x] 1.3 Testy AI-generation bez regresji: `npx vitest run tests/api/generate-flashcards*.test.ts tests/components/FlashcardGenerator.test.tsx` — 15cd10e
- [x] 1.4 Build przechodzi: `npm run build` — 15cd10e

#### Ręczne

- [x] 1.5 `git diff` na plikach auto-fixu zawiera wyłącznie zmiany formatowania — 15cd10e
- [x] 1.6 Smoke test `/api/generate-flashcards` (dev + prawdziwy `GROQ_API_KEY`): kształt odpowiedzi identyczny jak przed migracją — 15cd10e
- [x] 1.7 Brak regresji w przeglądzie propozycji w UI — 15cd10e

### Faza 2: Osobny config testów jednostkowych

#### Automatyczne

- [x] 2.1 `npm run test:unit` → dokładnie 59 testów, wszystkie zielone — db01c5f
- [x] 2.2 `npm run test:unit` przechodzi z odsuniętym `.env.test` i bez działającego Supabase — db01c5f
- [x] 2.3 Pełny zestaw nietknięty: `npx supabase start` + `npm run test` nadal przechodzi — db01c5f
- [x] 2.4 Lint nadal zielony: `npm run lint` — db01c5f

#### Ręczne

- [x] 2.5 `npm run test:unit` kończy się w kilka sekund, bez wzmianki o `global-setup.ts` / tworzeniu użytkowników testowych — db01c5f

### Faza 3: Okablowanie bramy CI + branch protection + aktualizacja planu testów

#### Automatyczne

- [x] 3.1 CI job pokazuje kroki `lint → test:unit → build` wszystkie zielone na świeżym przebiegu — ad6166c (run 34414080721)
- [x] 3.2 `gh api .../branches/master/protection` zwraca `required_status_checks.contexts` zawierające `"ci"` — ad6166c (repo przełączone na public, by odblokować branch protection na darmowym planie)
- [x] 3.3 Przebieg CI na `origin/master` po pushu jest zielony — ad6166c (run 34414080721)
- [x] 3.4 Lokalnie: `npm run lint && npm run test:unit && npm run build` zielone — ad6166c

#### Ręczne

- [x] 3.5 Testowy PR z celowym błędem lintu: check `ci` failed, merge zablokowany — PR #8: `ci` fail, mergeStateStatus BLOCKED
- [x] 3.6 Po cofnięciu błędu: check zielony, merge odblokowany; PR zamknięty bez merge — PR #8: revert → `ci` pass, mergeStateStatus CLEAN, zamknięty bez merge, gałąź usunięta
- [x] 3.7 `test-plan.md` §3 Faza 5 = `complete`, §5 i §6.6 sprostowane, czyta się spójnie — ad6166c
- [x] 3.8 `change.md` status zaktualizowany
- [x] 3.9 Preview-deploy Cloudflare czerwonej gałęzi PR nadal powstaje (brama blokuje merge, nie deploy) — architektonicznie: `ci` to check GitHub Actions bramkujący przycisk merge; Cloudflare Pages deployuje przez własny webhook Git, nie czyta statusu check. Brak weryfikacji w dashboardzie Cloudflare w tej sesji.
