# Plan implementacji: Niezawodność generowania AI (Faza 2 wdrożenia testów)

## Przegląd

Faza 2 z `context/foundation/test-plan.md` §3 pokrywa **Ryzyko #2** (ciche
awarie buforowanego kontraktu generowania fiszek) i **Ryzyko #5** (brak
kontroli kosztów/limitu). Piszemy testy integracyjne endpointu
`POST /api/generate-flashcards` plus jeden test komponentu UI przeglądu
(`FlashcardGenerator.tsx`). Wszystkie testy **blokują obecne zachowanie jako
świadome regresje** (styl Fazy 1) — ta faza **nie zmienia kodu produkcyjnego**.
`abortSignal`/timeout w endpoincie to osobna, przyszła zmiana; test najpierw
utrwala obecny brak.

To pierwsza faza wdrożenia, która wprowadza `vi.mock(...)` — Faza 1 mockowała
zero usług zewnętrznych.

## Analiza stanu obecnego

- **Endpoint jest buforowany, nie streamuje.** `src/pages/api/generate-flashcards.ts:46-58`
  używa `generateObject` z `ai` i zwraca `new Response(JSON.stringify(object))`.
  Założenie test-planu o „streamingu" zostało już wycofane w §2/§3 (backport
  z badania). Plan i podręcznik **nie mogą reintrodukować słowa „streaming"**.
- **Jeden catch-all zwija wszystkie tryby awarii.** `generate-flashcards.ts:59-64` —
  `APICallError`, `RetryError`, `NoObjectGeneratedError`, `TypeValidationError`,
  `JSONParseError`, `AbortError`, goły `TypeError` → jedno
  `500 {"error":"AI generation failed"}` (tylko `console.error` jako log).
  Klient nie może odróżnić „model dał za mało kart" od „Groq nie żyje".
- **Brak jakiegokolwiek `abortSignal`/`timeout`** na żadnym poziomie:
  `generate-flashcards.ts:48-53` nie przekazuje ich do `generateObject`, AI SDK
  nie ma domyślnego timeoutu, `wrangler.jsonc` nie ustawia `limits.cpu_ms`,
  `FlashcardGenerator.tsx:228-232` woła `fetch` bez `AbortController`.
- **Bramka `!GROQ_API_KEY`** (`generate-flashcards.ts:28-30`) zwraca
  `500 {"error":"AI service not configured"}` **przed** wywołaniem modelu.
  `GROQ_API_KEY` **nie jest** dziś w `.env.test` → każdy test AI trafiłby dziś w
  tę bramkę zamiast w mock.
- **UI przeglądu ufa payloadowi ślepo.** `FlashcardGenerator.tsx:239-240`:
  `(await res.json()) as FlashcardsOutput` + natychmiastowe `data.flashcards.map(...)`
  bez walidacji runtime. Brak klucza → `TypeError` łapane do panelu błędu
  (`:242-244`). `flashcards: []` → `proposals=[]`, stan `reviewing` „0 z …",
  `isBlocked` (`:207`), input zablokowany — **miękkie zawieszenie**.
- **Ryzyko #5: zero limitera** — potwierdzone z dowodami w badaniu §F.
  Endpoint wymaga zalogowania (własna bramka 401), ale jedno konto może wołać
  `generateObject` w nieograniczonej pętli. PRD `prd.md:110-112` klasyfikuje to
  jako Open Question o wysokim priorytecie przed produkcją, nie-blokujące dla dev.
- **Endpoint nigdy nie odpytuje Supabase** — czyta tylko `context.locals.user`.
  Testy nie potrzebują prawdziwej sesji ani sprzątania danych.
- **Infrastruktura Fazy 1 do reużycia:** `vitest.config.ts` (`getViteConfig`,
  `environment: "node"`, `globalSetup`, `testTimeout: 15000`),
  `buildApiContext` (`tests/helpers/api-context.ts`), bezpośredni import handlera
  + `await handler(context)`, wzorzec asercji „tylko obserwowalny kontrakt HTTP".
- **Wersje granicy AI (zweryfikowane w `node_modules`):** `ai@6.0.208`,
  `@ai-sdk/groq@3.0.42`, `@ai-sdk/provider@3.0.10` — wszystkie na
  `LanguageModelV3` (`specificationVersion: "v3"`; badanie mówiło „V2" —
  nieaktualne). `ai/test` eksportuje **`MockLanguageModelV3`**.

### Kluczowe odkrycia:

- Granica mocka: `vi.mock("@ai-sdk/groq")` (nie `vi.mock("ai")`).
  `createGroq()` zwraca `(modelId) => LanguageModelV3`
  (`node_modules/@ai-sdk/groq/dist/index.mjs:857` — `specificationVersion = "v3"`).
  Mockując tylko dostawcę, **prawdziwe `generateObject` z `ai` biegnie** i
  wykonuje prawdziwą walidację zod → prawdziwy `NoObjectGeneratedError` przy
  złym kształcie. To wprost pokonuje anty-wzorzec §2/§4 („nadmierne mockowanie
  wewnętrznych elementów `ai` tak, że test nie ćwiczy prawdziwej granicy
  walidacji obiektu").
- `MockLanguageModelV3` (`node_modules/ai/dist/test/index.d.ts`) przyjmuje w
  konstruktorze `doGenerate` jako funkcję **lub** wprost obiekt
  `LanguageModelV3GenerateResult`:
  `{ content: Array<{type:"text", text:string}>, finishReason, usage, warnings: [] }`
  (`node_modules/@ai-sdk/provider/dist/index.d.ts:1848-1895`).
- Bramka configu testowalna przez `vi.mock("astro:env/server", () => ({ GROQ_API_KEY: undefined }))`
  na górze dedykowanego pliku — `generate-flashcards.ts` importuje z tego
  modułu **tylko** `GROQ_API_KEY`, więc wąski mock jest bezpieczny.
- `FlashcardGenerator.tsx` to czysty default export, jeden prop `onComplete`,
  bez kontekstów/providerów, `fetch` globalny, `crypto.randomUUID()` (dostępne w
  jsdom). Renderowalny w jsdom po dodaniu `@testing-library/react`.
- Globalne `environment` w `vitest.config.ts` zostaje `node`; plik komponentu
  używa docblocka `// @vitest-environment jsdom`.

## Pożądany stan końcowy

Po zakończeniu:

- `npm run test` wykonuje nowe pliki:
  - `tests/api/generate-flashcards.test.ts` — kontrakt żądanie/odpowiedź +
    zwijanie błędów + brak bariery czasowej + bramka configu (Ryzyko #2).
  - `tests/api/generate-flashcards-rate.test.ts` — nieograniczony kontrakt
    generowania jako świadoma migawka MVP (Ryzyko #5).
  - `tests/components/FlashcardGenerator.test.tsx` — odporność UI przeglądu na
    zniekształcony payload (Ryzyko #2, warstwa komponentu).
- `tests/helpers/ai-mock.ts` dostarcza wielokrotnego użytku builder
  `MockLanguageModelV3` + seam `vi.mock("@ai-sdk/groq")`.
- `.env.test` i `.env.test.example` zawierają dummy `GROQ_API_KEY`.
- `package.json` ma `jsdom`, `@testing-library/react`, `@testing-library/dom`
  jako `devDependencies`.
- `test-plan.md` §6.4 zawiera prawdziwy wzorzec „endpoint API + mock dostawcy
  AI" (bez słowa „streaming"); §6.6 ma notatkę Fazy 2; §3 Faza 2 = `complete`.
- `npx supabase db reset && npm run test` oraz `npm run lint` — zielone.

Weryfikacja: pełny przebieg zestawu od zera przechodzi; każdy nowy test, który
utrwala regresję, ma w opisie/komentarzu jawne „dokumentujemy obecne
zachowanie", nie „wymagamy go".

## Czego NIE robimy

- **Nie zmieniamy kodu produkcyjnego.** Żadnego `abortSignal`/`AbortSignal.timeout`
  w endpoincie, żadnego rozbicia catch-all na 502/504/422, żadnej walidacji
  runtime w `FlashcardGenerator.tsx`, żadnego `AbortController` w kliencie.
  Testy blokują obecny stan; poprawki to osobne zmiany.
- **Nie budujemy rate-limitera / kwoty / licznika** dla Ryzyka #5. Faza 2
  utrwala nieograniczony kontrakt jednym testem-migawką z jawnym komentarzem.
- **Nie testujemy ścieżki zapisu propozycji** (`POST /api/flashcards`,
  accept-all N równoległych) — nie jest AI-specyficzna, należy do pokrycia
  Ryzyka #3 (Faza 1, complete). Badanie Open Q #5.
- **Nie dodajemy prawdziwej sesji** (`signInAsTestUser`) ani
  `cleanupFlashcards` do tych plików — endpoint nie dotyka Supabase.
- **Nie ustawiamy `test.fileParallelism = false`** — te pliki nie tworzą
  wierszy w tabelach współdzielonych. Impl-review F2 zostaje dla Fazy 5
  (quality-gates) lub własnej zmiany.
- **Nie wpinamy testów do CI** — to §3 Faza 5.
- **Nie mockujemy `fetch`/`@ai-sdk/provider-utils`** (transport HTTP) — kruche
  wobec wire-formatu `@ai-sdk/groq`; badanie Open Q #1.
- **Nie reintrodukujemy słowa „streaming"** nigdzie w planie ani podręczniku.
- **Nie mockujemy `streamObject`/SSE/`ReadableStream`** — nie istnieją w
  ścieżce generowania.

## Podejście do implementacji

Sześć faz w kolejności koszt × sygnał:

1. **Infrastruktura** — bez niej żaden test AI nie ruszy (bramka configu,
   seam mocka, zależności komponentu).
2. **Kontrakt żądanie/odpowiedź (#2)** — najtańszy, najwyższy sygnał: mock
   dostawcy + prawdziwe `generateObject`, asercje na obserwowalnym 200/500.
3. **Brak bariery czasowej + bramka configu (#2)** — droższe: fake timers dla
   „nieskończonego" zawieszenia, wąski mock `astro:env/server` dla ścieżki
   „not configured".
4. **Nieograniczony kontrakt (#5)** — jeden test-migawka + komentarz.
5. **Warstwa komponentu (#2)** — jsdom + RTL, zniekształcony payload do UI
   przeglądu.
6. **Podręcznik + weryfikacja** — utrwalenie wzorca w §6, pełny przebieg.

Granica mocka jest wspólna dla faz 2–4: `vi.mock("@ai-sdk/groq")` z hoisted
mutowalną referencją modelu ustawianą per test.

## Krytyczne szczegóły implementacji

- **Hoisting `vi.mock`.** `vi.mock("@ai-sdk/groq", ...)` jest hoistowane na
  szczyt pliku przed importami. Mutowalny model per test trzymamy w
  `vi.hoisted(() => ({ model: <domyślny> }))`; fabryka mocka zwraca
  `createGroq: () => () => hoisted.model`. Każdy test przypisuje
  `hoisted.model = buildMockModel({...})` w `beforeEach`/na początku `it`.
  Helper `tests/helpers/ai-mock.ts` eksportuje builder i (opcjonalnie) gotową
  fabrykę do przekazania do `vi.mock` w każdym pliku.
- **Prawdziwa granica walidacji musi biec.** Mockujemy `@ai-sdk/groq`
  (dostawcę), NIGDY `ai`/`generateObject`. Test „model zwrócił 2 karty" ustawia
  `doGenerate` → `{ content: [{ type: "text", text: JSON.stringify({ flashcards: [<2 pozycje>] }) }], finishReason: "stop", usage: {...}, warnings: [] }`
  i oczekuje, że **prawdziwe** `generateObject` rzuci `NoObjectGeneratedError`
  (bo `flashcardsOutputSchema` ma `.min(3)`), co endpoint zwinie do 500.
- **Fallback, gdyby `generateObject` odrzuciło mock modelu** (np. sprawdza
  wewnętrznie tożsamość dostawcy): przełącz plik na `vi.mock("ai")` z
  kontrolowanym `generateObject` (`vi.fn()` resolve/reject) i **dodaj osobny
  test** konstruujący `NoObjectGeneratedError` ręcznie z `ai`, aby nie stracić
  pokrycia granicy walidacji. Zdecydować w trakcie implementacji Fazy 1.
- **Bramka configu i kolejność.** `!GROQ_API_KEY` (`:28`) biegnie **przed**
  blokiem AI. Dla faz 2–4 `GROQ_API_KEY` musi być zdefiniowane → dummy w
  `.env.test`. Test „not configured" jest w **osobnym pliku** z
  `vi.mock("astro:env/server", () => ({ GROQ_API_KEY: undefined }))` na górze,
  bo mock env musi obowiązywać w momencie ewaluacji modułu endpointu.
- **Fake timers dla testu „brak timeoutu".** `vi.useFakeTimers()`, `doGenerate`
  zwraca `new Promise(() => {})` (nigdy nie rozwiązywane). Wywołaj handler,
  `await vi.advanceTimersByTimeAsync(600_000)` (10 min), potem `Promise.race`
  handlera z natychmiastowym sentinelem — oczekuj, że wygra sentinel (handler
  wciąż wisi). `vi.useRealTimers()` w `afterEach`. To dokumentuje brak bariery
  czasowej po stronie serwera; nie dowodzi „nieskończoności" formalnie, ale
  utrwala „żaden poziom aplikacji nie przerywa po 10 min".
- **Środowisko per plik.** `vitest.config.ts` globalnie `environment: "node"`.
  Plik komponentu zaczyna się od `// @vitest-environment jsdom`. Nie zmieniamy
  globalnej konfiguracji (testy API muszą zostać na `node`).
- **`crypto.randomUUID` w jsdom.** Dostępne przez globalny `crypto` w Node ≥
  jsdom env; jeśli w praktyce brak — dodać `globalThis.crypto` w pliku testu
  (nie w kodzie produkcyjnym).
- **Mock `fetch` w teście komponentu.** `vi.spyOn(globalThis, "fetch")` lub
  `vi.stubGlobal("fetch", ...)`; przywrócić w `afterEach`. Zwracać
  `new Response(JSON.stringify(body), { status: 200, headers: {...} })`.

## Faza 1: Infrastruktura mocków i środowisko

### Przegląd

Dummy klucz Groq w środowisku testowym, nowe zależności dla testów komponentu,
i wielokrotnego użytku helper budujący zamockowany model językowy V3 oraz seam
podmiany `@ai-sdk/groq`. Bez pokrycia ryzyka — czysty enabler dla faz 2–5.

### Wymagane zmiany:

#### 1. Dummy `GROQ_API_KEY` w środowisku testowym

**Pliki**: `.env.test` (gitignored), `.env.test.example` (commitowany)

**Cel**: Sprawić, by bramka `!GROQ_API_KEY` (`generate-flashcards.ts:28-30`)
przepuszczała żądanie do bloku AI w testach faz 2–4, gdzie dostawca jest
zamockowany. Wartość jest fikcyjna — żadne prawdziwe żądanie do Groq nigdy nie
wychodzi, bo `@ai-sdk/groq` jest podmieniony.

**Kontrakt**: Nowa linia `GROQ_API_KEY=test-dummy-key-not-real` w obu plikach.
`.env.test.example` dostaje komentarz wyjaśniający, że wartość jest atrapą i
że testy mockują dostawcę AI. Bez zmian w istniejących trzech zmiennych
Supabase.

#### 2. Zależności testów komponentu

**Plik**: `package.json`

**Cel**: Umożliwić renderowanie komponentu React w środowisku jsdom w Vitest.

**Kontrakt**: Dodać do `devDependencies`: `jsdom`, `@testing-library/react`
(wersja zgodna z React 19 — linia `^16`), `@testing-library/dom`. Bez zmian w
skryptach (`test` = `vitest run` już obsługuje wszystkie pliki `tests/**`).
Uwaga w Otwartych Ryzykach: to rozszerza stos poza §4 test-planu — §4 „Stos"
wymaga `--refresh`.

#### 3. Helper mocka dostawcy AI

**Plik**: `tests/helpers/ai-mock.ts` (nowy)

**Cel**: Jedno miejsce budujące `MockLanguageModelV3` z `ai/test` z
konfigurowalnym trybem: (a) sukces z podanym tekstem JSON, (b) rzuca podany
błąd, (c) nigdy nie rozwiązuje (hang). Plus eksport fabryki do przekazania do
`vi.mock("@ai-sdk/groq")` oraz hoisted uchwyt do przełączania modelu per test.

**Kontrakt**:
- `buildMockModel(opts: { text?: string; error?: unknown; hang?: true }): MockLanguageModelV3`
  — buduje model, którego `doGenerate` zwraca
  `{ content: [{ type: "text", text }], finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] }`
  dla `text`, albo `throw error`, albo `return new Promise(() => {})` dla `hang`.
- `groqMock` — obiekt z `vi.hoisted`-owalną referencją `{ model }` i fabryką
  `createGroqMockFactory()` zwracającą `{ createGroq: () => () => ref.model }`,
  gotową do `vi.mock("@ai-sdk/groq", createGroqMockFactory)`.
- Helper dla błędów AI SDK: `makeApiCallError({ statusCode, isRetryable })`,
  `makeAbortError()` — cienkie wrappery konstruktorów z `@ai-sdk/provider`
  (lub `ai`), by testy nie powtarzały boilerplate’u.

**Kontrakt** (fragment — nieoczywisty kształt wyniku V3):
```ts
// doGenerate zwraca LanguageModelV3GenerateResult:
{ content: [{ type: "text", text: JSON.stringify({ flashcards: [...] }) }],
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  warnings: [] }
```

#### 4. Weryfikacja seamu na jednym teście dymnym

**Plik**: tymczasowy `tests/api/generate-flashcards.test.ts` (szkielet — jeden `it`)

**Cel**: Potwierdzić, że `vi.mock("@ai-sdk/groq")` + hoisted model + prawdziwe
`generateObject` faktycznie zwraca `200` z fiszkami, zanim napiszemy pełny
zestaw. Jeśli `generateObject` odrzuca mock modelu — aktywować fallback
`vi.mock("ai")` z Krytycznych Szczegółów.

**Kontrakt**: Jeden `it` „poprawny model → 200 + kształt `{ flashcards: [...] }`".
Zostaje i rozrasta się w Fazie 2.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npm install` kończy się bez błędów po dodaniu `jsdom` + RTL
- [ ] `npx vitest run tests/api/generate-flashcards.test.ts` — test dymny
      przechodzi (seam `@ai-sdk/groq` działa, `generateObject` prawdziwe)
- [ ] `npx tsc --noEmit` (lub `npm run astro check`) — brak błędów typów w
      `tests/helpers/ai-mock.ts` i nowym pliku testu
- [ ] `npm run lint` — brak nowych błędów w `tests/**`

#### Weryfikacja ręczna:

- [ ] Przegląd `tests/helpers/ai-mock.ts` — builder pozwala wyrazić wszystkie
      trzy tryby (sukces / błąd / hang) bez duplikacji w plikach testów
- [ ] Potwierdzić, że żaden test nie wykonuje prawdziwego żądania sieciowego do
      Groq (brak `GROQ_API_KEY` prawdziwego; mock aktywny)

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji, zatrzymaj
się na potwierdzenie człowieka przed Fazą 2. Bloki faz używają zwykłych
punktorów; pola wyboru są w `## Progress`.

---

## Faza 2: Kontrakt żądanie/odpowiedź generowania (Ryzyko #2)

### Przegląd

Testy integracyjne endpointu na buforowanym kontrakcie żądanie/odpowiedź:
dobrze uformowany sukces oraz zwijanie każdego rozróżnialnego trybu awarii AI
SDK do jednego nieinformacyjnego `500`. Wszystkie testy trybów awarii są
jawnie oznaczone jako **świadome regresje**, nie asercje pożądanego kontraktu.

**Plik**: `tests/api/generate-flashcards.test.ts` (rozbudowa szkieletu z Fazy 1)

Wspólne: `vi.mock("@ai-sdk/groq", ...)` na górze; `hoisted.model` przełączany
per test; import `POST as generateFlashcards` z
`@/pages/api/generate-flashcards`; `buildApiContext({ method: "POST", url,
headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
locals: { user: FAKE_USER } })` gdzie `FAKE_USER` to minimalny obiekt
`{ id: "00000000-0000-0000-0000-000000000000" } as User`. Tekst wejściowy
zawsze ≥ 40 znaków (poza testem walidacji).

### Wymagane zmiany:

#### 2.1 Kontrola pozytywna — dobrze uformowane propozycje

**Cel**: Model zwraca poprawny JSON z 3–10 parami → endpoint zwraca `200`,
`Content-Type: application/json`, a **ciało dokładnie pasuje** do
`{ flashcards: [{ question: string, answer: string }, ...] }` (długość w
zakresie, każde pole niepuste).

- **Zachowanie asertowane**: `status === 200`; `body.flashcards` to tablica
  3–10 obiektów, każdy z niepustym `question` i `answer`; brak dodatkowych
  kluczy na górnym poziomie.
- **Regresja wyłapana**: zmiana serializacji odpowiedzi (`:55`), podmiana
  schematu wyjścia, albo owinięcie `object` w kopertę (`{ data: ... }`).
- **Źródło**: research.md §A (`:55-58`), §"Architecture Insights" (kontrakt
  binarny 200/500); test-plan §2 tabela reakcji #2 („dobrze uformowany zestaw
  propozycji pytanie/odpowiedź").
- **Przypadek brzegowy**: użyć dokładnie 3 kart (dolna granica `.min(3)`) w
  jednym wariancie i 10 (górna `.max(10)`) w drugim — potwierdza, że prawdziwa
  walidacja zod przepuszcza obie granice.
- **Anty-wzorzec unikany**: „happy-path w dev dowodzi, że wszystko działa" —
  ten test asertuje **kształt**, nie tylko status; jest kontrolą pozytywną dla
  testów trybów awarii poniżej (bez niej dowodziłyby tylko „coś zwraca 500").

#### 2.2 Zwijanie niezgodności ze schematem (świadoma regresja)

**Cel**: Model zwraca strukturalnie złą odpowiedź — 2 karty (< `.min(3)`),
puste `answer` (< `.min(1)`), albo tekst nie-JSON — prawdziwe `generateObject`
rzuca `NoObjectGeneratedError` (`cause` = `TypeValidationError` /
`JSONParseError`), endpoint zwija to do `500 {"error":"AI generation failed"}`.

- **Zachowanie asertowane**: dla każdego z trzech wariantów `status === 500` i
  `body` dokładnie `{ error: "AI generation failed" }` — **nierozróżnialne** od
  awarii dostawcy (2.3).
- **Regresja wyłapana**: gdyby ktoś dodał `NoObjectGeneratedError.isInstance(err)`
  i zwrócił `422`/`502` z rozróżnialną przyczyną — ten test by się złamał i
  wymusił świadomą aktualizację (co jest pożądane).
- **Źródło**: research.md §B(b) (`dist/index.mjs:3654-3667`), §A tabela
  (linia „Dowolna awaria w bloku AI"); test-plan §2 #2 („każdy rozróżnialny
  tryb awarii zwija się do jednego nieinformacyjnego błędu").
- **Przypadek brzegowy**: wariant „nie-JSON" ćwiczy ścieżkę `JSONParseError`
  wewnątrz `NoObjectGeneratedError`, odrębną od `TypeValidationError`.
- **Anty-wzorzec unikany**: „asercja obecnego zwijania jako pożądanego
  kontraktu bez oznaczenia go jako świadome ryzyko" — nazwa testu i komentarz
  mówią wprost: *dokumentujemy zwijanie błędów jako znane ryzyko Ryzyka #2, nie
  wymagamy go*. Oraz: **nie** mockujemy `ai` wewnętrznie — prawdziwa granica
  walidacji obiektu biegnie (dlatego mock jest na `@ai-sdk/groq`).

#### 2.3 Zwijanie awarii dostawcy (świadoma regresja)

**Cel**: `doGenerate` rzuca `APICallError`: (a) ponawialny (503) → prawdziwy
retry loop `ai` (`maxRetries=2`) → `RetryError` → endpoint 500; (b)
nieponawialny (400/401) → `APICallError` propaguje → endpoint 500.

- **Zachowanie asertowane**: oba warianty `status === 500`, `body ===
  { error: "AI generation failed" }`. Wariant (a): `doGenerate` wywołane 3×
  (pierwotne + 2 retry) — potwierdza, że prawdziwy retry loop biegł.
- **Regresja wyłapana**: nadpisanie `maxRetries`, dodanie własnego
  backoff-wrappera, albo rozbicie catch-all na `502` przy awarii dostawcy.
- **Źródło**: research.md §B(a) (`dist/index.mjs:2679, 2708, 2736`,
  `RetryError`), §A tabela.
- **Przypadek brzegowy / błąd**: liczba wywołań `doGenerate` przy ponawialnym
  błędzie (3) vs nieponawialnym (1) — jedyna obserwowalna różnica między
  trybami, mimo identycznego 500 na wyjściu.
- **Anty-wzorzec unikany**: lustro implementacji — nie sprawdzamy „czy
  wywołano `RetryError.isInstance`", tylko obserwowalny status + liczbę wywołań
  granicy dostawcy. Komentarz: świadoma regresja.

#### 2.4 Zwijanie abortu (świadoma regresja)

**Cel**: `doGenerate` rzuca błąd z `name: "AbortError"` → propaguje nietknięty
przez `ai` (nie jest ponawiany) → endpoint zwija do 500.

- **Zachowanie asertowane**: `status === 500`, `body === { error: "AI
  generation failed" }`, `doGenerate` wywołane dokładnie 1× (abort nie jest
  ponawiany).
- **Regresja wyłapana**: przyszłe dodanie obsługi `AbortError` (np. `504
  Gateway Timeout` z jasnym komunikatem) złamie test — pożądane.
- **Źródło**: research.md §B(c) (`error.name in AbortError|ResponseAborted|
  TimeoutError` przechodzi nietknięty).
- **Przypadek brzegowy**: to jest tryb, który przyszła zmiana `abortSignal`
  faktycznie wywoła — test utrwala „dziś abort = generyczne 500", by tamta
  zmiana świadomie go zaktualizowała.
- **Anty-wzorzec unikany**: „brak timeoutu nie jest problemem" (cytat z
  „Należy zakwestionować" w §2) — ten test + 3.1 wprost temu zaprzeczają.

#### 2.5 Walidacja wejścia nadal egzekwowana przy zamockowanym AI (bariera)

**Cel**: Z aktywnym mockiem dostawcy, żądania z `text` < 40 znaków oraz z
nieprawidłowym JSON w ciele nadal zwracają `422` **przed** dotknięciem bloku
AI (`doGenerate` nie wywołane).

- **Zachowanie asertowane**: `text: "abc"` → `422 { error: "Invalid input",
  details: ... }`; ciało `"{ not json"` → `422 { error: "Invalid JSON body" }`;
  `hoisted.model.doGenerate` nie wywołane w żadnym z nich.
- **Regresja wyłapana**: refaktor, który przeniósłby walidację po wywołaniu
  modelu (marnując wywołanie AI na złym wejściu) — istotne też dla Ryzyka #5
  (koszt).
- **Źródło**: research.md §A (`:32-44`, walidacja przed blokiem AI).
- **Przypadek brzegowy**: `text` dokładnie 39 znaków (tuż pod `.min(40)`) i
  1001 znaków (tuż nad `.max(1000)`) — obie granice `inputSchema`.
- **Anty-wzorzec unikany**: pominięcie kontroli, że mock nie „przecieka" —
  bez tego testu seam mógłby maskować regresję kolejności walidacji.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/generate-flashcards.test.ts` — wszystkie
      przypadki 2.1–2.5 przechodzą
- [ ] `npm run lint` — brak nowych błędów w pliku
- [ ] Prawdziwe `generateObject` jest w grafie (mock tylko `@ai-sdk/groq`) —
      potwierdzone przez to, że 2.2 przechodzi bez ręcznego rzucania
      `NoObjectGeneratedError`

#### Weryfikacja ręczna:

- [ ] Przegląd opisów testów 2.2–2.4 — każdy jawnie komunikuje „dokumentujemy
      zwijanie błędów jako znane ryzyko", nie „wymagamy tego kontraktu"
- [ ] Potwierdzić, że 2.1 asertuje kształt ciała, nie tylko `status === 200`

---

## Faza 3: Brak bariery czasowej i bramka konfiguracji (Ryzyko #2)

### Przegląd

Dwa scenariusze, których Faza 2 nie pokrywa: (a) brak jakiegokolwiek timeoutu
na poziomie serwera — zawieszone `doGenerate` nigdy nie jest przerywane; (b)
bramka `!GROQ_API_KEY` jako jedyny tryb awarii z **rozróżnialnym** ciałem
błędu.

### Wymagane zmiany:

#### 3.1 Brak timeoutu po stronie serwera (świadoma regresja)

**Plik**: `tests/api/generate-flashcards.test.ts` (nowy `describe` „brak
bariery czasowej") — lub `tests/api/generate-flashcards-timeout.test.ts` jeśli
fake timers kolidują z resztą pliku.

**Cel**: Gdy `doGenerate` nigdy nie rozwiązuje, handler endpointu **też nigdy
nie kończy** — nie ma `abortSignal`, `timeout` ani limitu Workera, który by go
przerwał. To utrwala „spinner w nieskończoność" z §2 #2.

**Kontrakt**: `vi.useFakeTimers()` w `beforeEach`, `vi.useRealTimers()` w
`afterEach`. `hoisted.model = buildMockModel({ hang: true })`. Wywołać handler
(nie `await`), `await vi.advanceTimersByTimeAsync(600_000)`, potem
`Promise.race([handlerPromise, Promise.resolve("still-pending")])` → oczekiwać
`"still-pending"`.

- **Zachowanie asertowane**: po symulowanych 10 minutach handler wciąż jest
  pending (nie rozwiązał się, nie odrzucił).
- **Regresja wyłapana**: dodanie `AbortSignal.timeout(...)` lub `Promise.race`
  z timerem w endpoincie złamie test — **to jest pożądany sygnał**, że przyszła
  zmiana bariery czasowej faktycznie zadziałała.
- **Źródło**: research.md §A („Brak `abortSignal`/`timeout`"), §B(c) („AI SDK
  nie ma domyślnego timeoutu"), §C („Brak konfiguracji timeoutu/limitów"),
  §"Architecture Insights" („Brak bariery czasowej end-to-end"); test-plan §2
  #2 („żądanie wisi bez żadnego timeoutu").
- **Przypadek brzegowy**: nie asertujemy „nieskończoności" formalnie —
  asertujemy „żaden poziom aplikacji nie przerywa w oknie 10 min" (rozsądny
  proxy; komentarz to wyjaśnia).
- **Anty-wzorzec unikany**: „brak timeoutu nie jest problemem — jeden
  catch-all wystarczy" (cytat z §2). Oraz: nie testujemy tego przez
  rzeczywiste czekanie (flaky, wolne) — fake timers.

#### 3.2 Bramka konfiguracji z rozróżnialną przyczyną

**Plik**: `tests/api/generate-flashcards-config.test.ts` (nowy — osobny, bo
`vi.mock("astro:env/server")` musi obowiązywać przy ewaluacji modułu)

**Cel**: Gdy `GROQ_API_KEY` jest `undefined`, endpoint zwraca
`500 {"error":"AI service not configured"}` — **to jedyny** tryb awarii z
ciałem różnym od generycznego „AI generation failed", mimo tego samego statusu
500.

**Kontrakt**: `vi.mock("astro:env/server", () => ({ GROQ_API_KEY: undefined }))`
na górze pliku. `buildApiContext` z ważnym `locals.user` i poprawnym ciałem.
Asercja `status === 500` i `body === { error: "AI service not configured" }`.
Drugi `it` (opcjonalny, dokumentujący): zestawić z generycznym 500 z Fazy 2 —
komentarz, że klient rozróżnia te dwa **tylko po ciele**, nie po statusie.

- **Zachowanie asertowane**: `500` + dokładne ciało `{ error: "AI service not
  configured" }`; blok AI nie osiągnięty (mock `@ai-sdk/groq` nie potrzebny w
  tym pliku).
- **Regresja wyłapana**: zmiana statusu (np. na `503`) lub komunikatu bramki
  konfiguracji; przeniesienie checku za blok AI.
- **Źródło**: research.md §A (`:28-30`), §G („`GROQ_API_KEY` NIE jest w
  `.env.test`"); test-plan §2 #2 („czysty, widoczny błąd z rozróżnialną
  przyczyną").
- **Przypadek brzegowy**: `GROQ_API_KEY: ""` (pusty string, nie `undefined`) —
  `!GROQ_API_KEY` też prawda; jeden wariant to pokrywa.
- **Anty-wzorzec unikany**: pominięcie tej ścieżki („luka wprost w temacie
  Ryzyka #2" — pytanie planistyczne). To jedyny pozytywny przykład
  „rozróżnialnej przyczyny", którą endpoint dziś daje.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/generate-flashcards*.test.ts` — 3.1 i 3.2
      przechodzą; fake timers nie wyciekają do innych testów
- [ ] `npm run lint` — czysto

#### Weryfikacja ręczna:

- [ ] Przegląd 3.1 — komentarz jasno mówi „utrwalamy brak bariery czasowej;
      przyszła zmiana `abortSignal` świadomie złamie ten test"
- [ ] Przegląd 3.2 — komentarz zestawia oba 500 (config vs AI-failed) i mówi,
      że różnią się tylko ciałem

---

## Faza 4: Nieograniczony kontrakt generowania (Ryzyko #5)

### Przegląd

Ryzyko #5 nie ma „poprawnego" progu do asertowania — badanie potwierdziło zero
limitera. Jedyny uczciwy test to zablokowanie obecnego nieograniczonego
zachowania jako **świadomego stanu MVP**, z jawnym wskazaniem PRD Open
Question.

**Plik**: `tests/api/generate-flashcards-rate.test.ts` (nowy)

### Wymagane zmiany:

#### 4.1 Nieograniczona migawka (świadoma, oznaczona regresja)

**Cel**: N = 5 kolejnych żądań `POST /api/generate-flashcards` z jednej
tożsamości (`locals.user` = ten sam `FAKE_USER`), z zamockowanym udanym
modelem, **wszystkie zwracają `200`** — nigdy `429`, nigdy throttle, nigdy
cooldown, nigdy licznik kwoty.

**Kontrakt**: Pętla 5× `await generateFlashcards(context)` z tym samym userem
(nowy `context` per iteracja, bo `Request` jest jednorazowy). Asercja: każdy
status `200`. Komentarz blokowy w pliku:

```
// ŚWIADOMA MIGAWKA MVP — NIE jest to pożądany kontrakt.
// Badanie (research.md §F) potwierdziło: zero rate-limitu / kwoty / licznika /
// dedupe w całej aplikacji. Jedno konto może wołać generateObject w pętli bez
// sufitu kosztu.
// PRD Open Question "Kontrola kosztów generowania" (prd.md:110-112) — priorytet
// WYSOKI przed wdrożeniem produkcyjnym, nie-blokujący dla developmentu.
// Ten test utrwala LUKĘ, by wprowadzenie limitera było świadomą, wykrytą zmianą
// (limiter złamie ten test → wymusi jego aktualizację). Budowa limitera jest
// POZA zakresem tej fazy (osobna zmiana).
```

- **Zachowanie asertowane**: 5/5 żądań → `200`; brak jakiegokolwiek `429` lub
  nagłówka `Retry-After` / `RateLimit-*`.
- **Regresja wyłapana**: wprowadzenie rate-limitera / kwoty / cooldownu
  gdziekolwiek na ścieżce `/api/generate-flashcards` — test się złamie i
  wymusi świadomą decyzję „czy to celowe, zaktualizuj migawkę".
- **Źródło**: research.md §F (pełna lista sprawdzonych plików), §"Architecture
  Insights" („Ryzyko #5 nie ma »poprawnego« kontraktu — jedyny uczciwy test to
  lock obecnego zachowania: 10 kolejnych żądań… wszystkie 200"); test-plan §2
  tabela reakcji #5 (anty-wzorzec „bezsensowna migawka").
- **Przypadek brzegowy**: N = 5 wystarcza (badanie: „nieograniczona pętla" —
  próg to 0); nie zawyżamy N, by test był szybki. Wariant: 3 żądania „szybko"
  (bez `await` między nimi, `Promise.all`) — potwierdza brak dedupe/serializacji
  współbieżnej.
- **Anty-wzorzec unikany**: „bezsensowna migawka (asercja obecnego
  nieograniczonego zachowania, jakby to był pożądany kontrakt)" — zbity
  komentarzem blokowym + nazwą testu („utrwala nieograniczony stan MVP —
  Ryzyko #5, PRD Open Question") + tym, że test jest zaprojektowany, by
  **złamać się** przy wprowadzeniu limitera.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/generate-flashcards-rate.test.ts` — 5/5
      żądań `200`, wariant współbieżny przechodzi
- [ ] `npm run lint` — czysto

#### Weryfikacja ręczna:

- [ ] Przegląd komentarza blokowego — czy ktoś czytający test za 6 miesięcy
      zrozumie, że to LUKA do zamknięcia, nie kontrakt do utrzymania
- [ ] Potwierdzić link do `prd.md:110-112` jest aktualny (Open Question wciąż
      otwarte)

---

## Faza 5: Odporność UI przeglądu na zniekształcony payload (Ryzyko #2)

### Przegląd

Warstwa komponentu: `FlashcardGenerator.tsx` ślepo rzutuje `res.json()` na
`FlashcardsOutput` i natychmiast `.map(...)` (`:239-240`), bez walidacji
runtime. Trzy scenariusze zniekształconego / zdegenerowanego payloadu 200 plus
kontrola pozytywna i „spinner w nieskończoność" po stronie klienta.

**Plik**: `tests/components/FlashcardGenerator.test.tsx` (nowy)
Pierwsza linia: `// @vitest-environment jsdom`

Wspólne: `render(<FlashcardGenerator onComplete={vi.fn()} />)` z
`@testing-library/react`; `vi.stubGlobal("fetch", vi.fn())` /
`vi.spyOn(globalThis, "fetch")`, przywracane w `afterEach`; wpisać ≥ 40 znaków
w textarea i kliknąć „Generuj fiszki".

### Wymagane zmiany:

#### 5.1 Kontrola pozytywna — dobrze uformowany payload renderuje propozycje

**Cel**: `fetch` zwraca `200` z `{ flashcards: [3 poprawne pary] }` → komponent
przechodzi w stan `reviewing` i renderuje 3 karty `ProposalCard` z widocznymi
pytaniami/odpowiedziami.

- **Zachowanie asertowane**: po kliknięciu „Generuj fiszki" i rozwiązaniu
  `fetch`, w DOM są 3 bloki propozycji, tekst „… z 3 propozycji do obsłużenia",
  przyciski „Zaakceptuj / Edytuj / Odrzuć".
- **Regresja wyłapana**: złamanie mapowania `data.flashcards` → `makeProposal`,
  regresja maszyny stanów `loading → reviewing`.
- **Źródło**: research.md §D (`:228-241`, tabela obsługi trybów awarii UI).
- **Przypadek brzegowy**: dokładnie 3 karty (dolna granica) — potwierdza render
  minimalnego zestawu.
- **Anty-wzorzec unikany**: testowanie tylko ścieżek awarii — bez kontroli
  pozytywnej testy 5.2–5.4 dowodziłyby tylko „coś się nie renderuje".

#### 5.2 Brak klucza `flashcards` — degradacja do panelu błędu, nie zawieszenie (świadoma regresja)

**Cel**: `fetch` zwraca `200` z ciałem `{}` (albo `{ items: [...] }`) → ślepy
`data.flashcards.map` rzuca `TypeError` → łapane w `catch` (`:242-244`) →
komponent pokazuje **panel błędu** z przyciskiem „Spróbuj ponownie", **nie**
zawiesza się na spinnerze.

- **Zachowanie asertowane**: stan `error`; widoczny panel z komunikatem
  (surowy tekst `TypeError` — brzydki, ale obecny) i działającym przyciskiem
  odzysku wracającym do `idle`.
- **Regresja wyłapana**: gdyby ktoś dodał walidację runtime kształtu (co jest
  pożądaną poprawką) — test się złamie i wymusi aktualizację na „czysty
  komunikat zamiast surowego `TypeError`".
- **Źródło**: research.md §D (tabela: „malformed payload (`flashcards` brak) —
  **niebronione** — `data.flashcards.map` rzuca `TypeError`, łapane → panel
  błędu z gołym tekstem"); test-plan §2 #2 („zniekształcone propozycje
  docierające do UI przeglądu").
- **Przypadek brzegowy**: wariant `{ flashcards: "not-an-array" }` →
  `.map is not a function`, ta sama ścieżka `catch`.
- **Anty-wzorzec unikany**: „milcząca migawka" — nazwa testu mówi
  „dokumentujemy: zniekształcony payload 200 degraduje do brzydkiego, ale
  odzyskiwalnego panelu błędu; walidacja runtime to osobna poprawka".

#### 5.3 Pusta tablica `flashcards: []` — miękkie zawieszenie (świadoma regresja)

**Cel**: `fetch` zwraca `200` z `{ flashcards: [] }` → `proposals = []`, stan
`reviewing`, `isBlocked === true` (`:207`) → textarea zablokowana, „Zaakceptuj
wszystkie" `disabled`, tekst „0 z 0 propozycji", **brak drogi naprzód** bez
przeładowania strony.

- **Zachowanie asertowane**: stan `reviewing`; textarea ma atrybut `disabled`;
  przycisk „Zaakceptuj wszystkie" `disabled`; brak kart; brak przycisku
  wyjścia/resetu.
- **Regresja wyłapana**: przyszła bariera po stronie serwera (`.min(3)` już
  jest) lub klienta na pustej tablicy złamie test — pożądane.
- **Źródło**: research.md §D (tabela: „`flashcards: []` / <3 … `proposals=[]`,
  stan `reviewing` »0 z 0«, input zablokowany — **miękkie zawieszenie**"),
  `:207-219`, `:240-241`.
- **Przypadek brzegowy / uwaga**: serwerowe `flashcardsOutputSchema.min(3)`
  czyni ten payload **dziś nieosiągalnym** przez prawdziwy endpoint — test
  jawnie to odnotowuje („klient nie ma własnej bariery; gdyby walidacja
  serwera kiedyś osłabła / endpoint się zmienił, UI cicho zawiesza").
- **Anty-wzorzec unikany**: asertowanie tego jako pożądanego zachowania —
  komentarz mówi „to miękkie zawieszenie, znane ryzyko Ryzyka #2".

#### 5.4 `fetch` bez rozwiązania — spinner na stałe, brak anulowania (świadoma regresja)

**Cel**: `fetch` zwraca `Promise`, który nigdy się nie rozwiązuje → komponent
zostaje w stanie `loading`: spinner „AI generuje fiszki…", przycisk
„Generowanie…" `disabled`, textarea `disabled`, **brak `AbortController` /
przycisku anulowania**.

**Kontrakt**: `fetch` mock = `() => new Promise(() => {})`. Fake timers +
`vi.advanceTimersByTimeAsync(600_000)` albo po prostu asercja po kilku
`await Promise.resolve()` / `flushPromises` — stan nie zmienia się.

- **Zachowanie asertowane**: po „symulowanym czasie" wciąż widoczny spinner z
  tekstem „AI generuje fiszki…", brak panelu błędu, brak stanu `reviewing`,
  brak żadnego przycisku „Anuluj".
- **Regresja wyłapana**: dodanie `AbortController` + timeout po stronie
  klienta (pożądana poprawka) złamie test — wymusi aktualizację.
- **Źródło**: research.md §D („Brak `AbortController` na `fetch` + brak
  timeoutu na serwerze → zawieszony Groq = spinner »w nieskończoność« …
  brak anulowania bez reloadu strony"), `:379-384`, `:228-232`.
- **Przypadek brzegowy**: to klientowe odbicie serwerowego 3.1 — razem
  domykają scenariusz „spinner w nieskończoność" z obu stron.
- **Anty-wzorzec unikany**: „happy-path w dev dowodzi obsługi wszystkich
  trybów" — ten test to negatywny dowód braku bariery czasowej po stronie UI.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/components/FlashcardGenerator.test.tsx` — 5.1–5.4
      przechodzą w środowisku jsdom
- [ ] `npx tsc --noEmit` — brak błędów typów w pliku `.tsx`
- [ ] `npm run lint` — brak nowych błędów (w tym reguły `jsx-a11y` / `react`)

#### Weryfikacja ręczna:

- [ ] Przegląd 5.2 i 5.3 — opisy jasno mówią „dokumentujemy obecną degradację,
      walidacja runtime to osobna poprawka"
- [ ] Potwierdzić, że komponent renderuje się w jsdom bez potrzeby mocka
      `@/components/ui/*` (czysty shadcn) — jeśli nie, dodać minimalny mock i
      odnotować w §6.6

---

## Faza 6: Podręcznik (§6.4, §6.6) i weryfikacja pełnego przebiegu

### Przegląd

Zamknięcie fazy: utrwalenie wzorca „endpoint API + mock dostawcy AI" w
`test-plan.md` §6.4, notatka Fazy 2 w §6.6, pełny przebieg zestawu, oznaczenie
§3 Faza 2 jako `complete`.

### Wymagane zmiany:

#### 6.1 Podręcznik §6.4 — wzorzec endpointu API opartego na AI

**Plik**: `context/foundation/test-plan.md` (§6.4)

**Cel**: Zastąpić „TBD — patrz §3 Faza 2" konkretnym, odtwarzalnym przepisem
opartym na tym, co powstało: lokalizacja (`tests/api/<obszar>.test.ts`),
granica mocka (`vi.mock("@ai-sdk/groq")` z hoisted modelem, **prawdziwe**
`generateObject` — po to, by ćwiczyć granicę walidacji zod), builder
`tests/helpers/ai-mock.ts` (tryby sukces / błąd / hang), wzorzec bramki configu
(`vi.mock("astro:env/server")` w osobnym pliku), konwencja „świadoma regresja"
dla zwijania błędów, oraz to, że endpoint generowania **nie dotyka Supabase**
(fałszywy `locals.user`, bez sesji, bez sprzątania).

**Kontrakt**: Edycja treści §6.4 (i odsyłacza w §6.1 jeśli dotyczy). **Bez
zmian w §1–§5** (zasada nienaruszalności strategii poza `--refresh`) — **z
wyjątkiem** dopisania w §6.6 flagi, że §4 „Stos" wymaga `--refresh` (patrz
6.2). **Zero słowa „streaming"** w nowym tekście — wzorzec jest wprost
„buforowany kontrakt żądanie/odpowiedź".

#### 6.2 Podręcznik §6.6 — notatka per faza wdrożenia

**Plik**: `context/foundation/test-plan.md` (§6.6)

**Cel**: Dopisać wpis „Faza 2 — AI generation reliability": co dostarczono
(3 pliki testów + `ai-mock.ts` helper), granica mocka i uzasadnienie, konwencja
„labeled regression" dla zwijania błędów (2.2–2.4) i nieograniczonego kontraktu
(4.1), oraz **flaga**: warstwa testów komponentu (jsdom + `@testing-library/react`)
została wprowadzona poza §4 „Stos" — **§4 wymaga `/10x-test-plan --refresh`**,
by odnotować nowe narzędzie (jsdom/RTL) w tabeli stosu.

**Kontrakt**: Nowy podpunkt w §6.6; bez zmian w §6.1–§6.5 poza 6.1.

#### 6.3 Weryfikacja pełnego przebiegu

**Plik**: brak nowego — krok weryfikacyjny

**Cel**: `npx supabase db reset && npm run test` — cały zestaw (Faza 1
wdrożenia + nowe pliki Fazy 2) zielony od zera; `npm run lint` czysto.

#### 6.4 Oznaczenie fazy jako ukończonej

**Pliki**: `context/foundation/test-plan.md` (§3 tabela), `context/changes/ai-generation-reliability/change.md`

**Cel**: §3 Faza 2 Status → `complete`. `change.md` frontmatter `status:` →
`implemented` (lub zgodnie z konwencją orkiestratora), `updated:` → data
ukończenia.

**Kontrakt**: Edycja jednej komórki tabeli §3 i frontmatteru `change.md`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx supabase db reset && npm run test` — pełny przebieg zielony od zera
- [ ] `npm run lint` — brak nowych błędów w `tests/**`
- [ ] `grep -ri "stream" context/foundation/test-plan.md context/changes/ai-generation-reliability/` — brak nowo wprowadzonego słowa „streaming" w §6 ani w plikach testów

#### Weryfikacja ręczna:

- [ ] Przegląd §6.4 — czy ktoś nieznający tej fazy dodałby test dla kolejnego
      endpointu AI bez zgadywania (granica mocka, helper, bramka configu)
- [ ] Przegląd §6.6 — flaga „§4 wymaga `--refresh`" jest jednoznaczna
- [ ] §3 Faza 2 w `test-plan.md` faktycznie `complete`; `change.md`
      zaktualizowany

---

## Strategia testowania

### Testy jednostkowe:

- Brak. Cały zakres Fazy 2 to kontrakt endpointu (integracyjny) i zachowanie
  komponentu (integracyjny na warstwie UI). Czyste jednostki (mapowanie pól
  FSRS) należą do §3 Faza 3.

### Testy integracyjne:

- Endpoint `generate-flashcards` — kontrakt żądanie/odpowiedź, zwijanie
  wszystkich trybów awarii AI SDK do 500, brak bariery czasowej (fake timers),
  bramka configu, nieograniczony kontrakt (#5).
- Komponent `FlashcardGenerator` — render propozycji, degradacja
  zniekształconego payloadu, miękkie zawieszenie pustej tablicy, spinner bez
  anulowania.

### Kroki testowania ręcznego:

1. `npx supabase start`, potem `npm run test` — potwierdzić zielony przebieg
   (testy AI nie wymagają Supabase, ale reszta zestawu tak).
2. `npx vitest run tests/api/generate-flashcards.test.ts --reporter verbose` —
   przeczytać nazwy testów, potwierdzić, że regresje są jawnie oznaczone.
3. Tymczasowo dodać `abortSignal: AbortSignal.timeout(1000)` do
   `generateObject` w endpoincie → `npm run test` → potwierdzić, że 2.4 i 3.1
   **się łamią** (dowód, że test faktycznie utrwala brak bariery) → cofnąć
   zmianę.

## Uwagi dotyczące wydajności

- Testy endpointu z zamockowanym dostawcą są szybkie (brak sieci, brak
  Supabase) — milisekundy.
- Testy fake-timers (3.1, 5.4) nie czekają realnego czasu.
- Test komponentu w jsdom — dziesiątki ms na render.
- `testTimeout: 15000` z Fazy 1 zostaje bez zmian; wystarcza z zapasem.

## Uwagi dotyczące migracji

Brak migracji danych. Brak nowych wierszy w bazie. Jedyne nowe artefakty to
pliki testów, helper, dummy `GROQ_API_KEY` w `.env.test`/`.example` i trzy
`devDependencies`.

## Otwarte ryzyka i założenia

- **`generateObject` może nie zaakceptować `MockLanguageModelV3` z podmienionego
  `@ai-sdk/groq`.** Jeśli `ai@6` waliduje wewnętrznie tożsamość dostawcy,
  fallback to `vi.mock("ai")` + osobny test ręcznie konstruujący
  `NoObjectGeneratedError`. Rozstrzygane w Fazie 1 (test dymny 1.4). Założenie:
  V3 mock modelu wystarcza, bo `generateObject` woła `model.doGenerate`
  bezpośrednio.
- **Warstwa testów komponentu wykracza poza §4 „Stos" test-planu** (§1–§5
  zamrożone). Łagodzenie: §6.6 flaguje potrzebę `/10x-test-plan --refresh` dla
  §4; ta faza nie edytuje §4 samodzielnie. Założenie: użytkownik akceptuje
  jsdom + RTL jako nowe narzędzie (potwierdzone w wywiadzie planistycznym).
- **`vi.mock("astro:env/server")`** — wirtualny moduł Astro; zakładamy, że
  `getViteConfig()` czyni go rozwiązywalnym dla Vitest (jak w aplikacji).
  Jeśli mock nie chwyta, fallback: `vi.stubEnv` + odczyt przez `process.env`
  w teście nie zadziała (moduł kompilowany) → wtedy dedykowany plik z
  `vi.doMock` przed dynamicznym `import()` handlera.
- **`crypto.randomUUID` w jsdom** — zakładamy dostępność przez globalny
  `crypto`; jeśli brak, polyfill w pliku testu.
- **Impl-review F2 (`fileParallelism`)** — świadomie nie adresowane; te pliki
  nie tworzą wierszy współdzielonych. Jeśli przyszły plik AI zacznie tworzyć
  fiszki, wróci jako zależność Fazy 5.
- **Fake timers a `advanceTimersByTimeAsync`** — jeśli `ai`/`generateObject`
  używa `queueMicrotask` zamiast makrotimerów, `advanceTimersByTimeAsync`
  może nie wystarczyć; wtedy `hang` przez `new Promise(() => {})` bez timerów
  i asercja przez `Promise.race` z `setImmediate`-sentinelem.

## Referencje

- Powiązane badania: `context/changes/ai-generation-reliability/research.md`
- Plan testów (nadrzędny): `context/foundation/test-plan.md` §3 Faza 2, §2
  (Ryzyko #2, #5, tabela reakcji), §6.4/§6.6
- Wzorzec Fazy 1: `context/changes/auth-access-control-coverage/plan.md`
  (bezpośredni import handlera, `buildApiContext`, „labeled regression");
  `tests/api/auth-gating.test.ts` (jedyny obecny dotyk `generate-flashcards`)
- Granica AI: `node_modules/ai/dist/test/index.d.ts` (`MockLanguageModelV3`),
  `node_modules/@ai-sdk/provider/dist/index.d.ts:1848` (`LanguageModelV3GenerateResult`),
  `node_modules/@ai-sdk/groq/dist/index.mjs:857` (`specificationVersion = "v3"`)

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Infrastruktura mocków i środowisko

#### Automatyczne

- [x] 1.1 npm install kończy się bez błędów po dodaniu jsdom + RTL — ec37797
- [x] 1.2 npx vitest run tests/api/generate-flashcards.test.ts — test dymny przechodzi (seam @ai-sdk/groq działa, generateObject prawdziwe) — ec37797
- [x] 1.3 npx tsc --noEmit — brak błędów typów w ai-mock.ts i nowym pliku testu — ec37797
- [x] 1.4 npm run lint — brak nowych błędów w tests/** — ec37797

#### Ręczne

- [x] 1.5 Przegląd ai-mock.ts — builder wyraża wszystkie trzy tryby bez duplikacji — ec37797
- [x] 1.6 Potwierdzić brak prawdziwych żądań sieciowych do Groq — ec37797

### Faza 2: Kontrakt żądanie/odpowiedź generowania (Ryzyko #2)

#### Automatyczne

- [x] 2.1 npx vitest run tests/api/generate-flashcards.test.ts — przypadki 2.1–2.5 przechodzą — 31dc9eb
- [x] 2.2 npm run lint — brak nowych błędów w pliku — 31dc9eb
- [x] 2.3 Prawdziwe generateObject w grafie — 2.2 przechodzi bez ręcznego rzucania NoObjectGeneratedError — 31dc9eb

#### Ręczne

- [x] 2.4 Przegląd opisów 2.2–2.4 — jawne „dokumentujemy zwijanie błędów jako znane ryzyko" — 31dc9eb
- [x] 2.5 Potwierdzić, że 2.1 asertuje kształt ciała, nie tylko status 200 — 31dc9eb

### Faza 3: Brak bariery czasowej i bramka konfiguracji (Ryzyko #2)

#### Automatyczne

- [x] 3.1 npx vitest run tests/api/generate-flashcards*.test.ts — 3.1 i 3.2 przechodzą; fake timers nie wyciekają
- [x] 3.2 npm run lint — czysto

#### Ręczne

- [x] 3.3 Przegląd 3.1 — komentarz o utrwalaniu braku bariery czasowej
- [x] 3.4 Przegląd 3.2 — komentarz zestawiający oba 500 (config vs AI-failed)

### Faza 4: Nieograniczony kontrakt generowania (Ryzyko #5)

#### Automatyczne

- [ ] 4.1 npx vitest run tests/api/generate-flashcards-rate.test.ts — 5/5 żądań 200, wariant współbieżny przechodzi
- [ ] 4.2 npm run lint — czysto

#### Ręczne

- [ ] 4.3 Przegląd komentarza blokowego — czytelne, że to LUKA, nie kontrakt
- [ ] 4.4 Potwierdzić aktualność linku prd.md:110-112

### Faza 5: Odporność UI przeglądu na zniekształcony payload (Ryzyko #2)

#### Automatyczne

- [ ] 5.1 npx vitest run tests/components/FlashcardGenerator.test.tsx — 5.1–5.4 przechodzą w jsdom
- [ ] 5.2 npx tsc --noEmit — brak błędów typów w pliku .tsx
- [ ] 5.3 npm run lint — brak nowych błędów (jsx-a11y / react)

#### Ręczne

- [ ] 5.4 Przegląd 5.2 i 5.3 — opisy o dokumentowaniu obecnej degradacji
- [ ] 5.5 Potwierdzić render w jsdom bez mocka @/components/ui/* (lub odnotować mock w §6.6)

### Faza 6: Podręcznik (§6.4, §6.6) i weryfikacja pełnego przebiegu

#### Automatyczne

- [ ] 6.1 npx supabase db reset && npm run test — pełny przebieg zielony od zera
- [ ] 6.2 npm run lint — brak nowych błędów w tests/**
- [ ] 6.3 grep -ri "stream" — brak nowo wprowadzonego słowa „streaming" w §6 ani w plikach testów

#### Ręczne

- [ ] 6.4 Przegląd §6.4 — przepis wystarczający bez zgadywania
- [ ] 6.5 Przegląd §6.6 — flaga „§4 wymaga --refresh" jednoznaczna
- [ ] 6.6 §3 Faza 2 = complete; change.md zaktualizowany
