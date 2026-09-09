# Plan implementacji: Study/FSRS scheduling integrity — pokrycie testowe Ryzyka #4

## Przegląd

Faza 3 fazowego wdrożenia z `context/foundation/test-plan.md` (§3). Dostarcza pokrycie
testowe dla **Ryzyka #4** — *logika harmonogramowania FSRS uszkadza stan powtórek lub
pokazuje karty w złej kolejności, a użytkownik traci postęp nauki* (Wysoki × Średnie).

Trzy warstwy, wszystkie **bez zmian w kodzie produkcyjnym**:

1. **Unit** (`tests/lib/fsrs.test.ts`) — mapowanie pól i okablowanie `src/lib/services/fsrs.ts`.
2. **Integracja** (`tests/api/study-review.test.ts`) — pełny round-trip `POST /api/study/review`
   i odbicie zmiany w `GET /api/study/queue`.
3. **Komponent** (`tests/components/StudySession.test.tsx`) — wyścig double-click w kliencie.

Prawdziwe `ts-fsrs` biegnie w każdej warstwie — **scheduler nie jest mockowany**, a oczekiwany
harmonogram jest wyprowadzany niezależnie jako **niezmienniki i asercje jakościowe** (kierunek,
relacje, granulacja), nigdy przez ponowne uruchomienie `scheduler.next` w teście (anty-wzorzec
§2 #4). Każde niepożądane, obecne zachowanie jest pinowane jako **„świadoma regresja"** zgodnie
z konwencją §6.4 pkt 7 / §6.6 (`test-plan.md`): komentarz blokowy + nazwa testu mówią
*„dokumentujemy … , nie wymagamy …"*, a test jest zaprojektowany tak, by **złamał się**, gdy
poprawka wejdzie.

## Analiza stanu obecnego

- **`src/lib/services/fsrs.ts`** (60 linii, jedyna logika harmonogramowania w repo). Trzy czyste
  funkcje. `scheduler = fsrs(generatorParameters({ enable_short_term: false }))` —
  `LongTermScheduler`, model 2-stanowy (`New` → `Review`), interwały w całych dniach. Mapowanie
  `reps` → `repetitions` (nazwa się różni), `State[card.state]` → etykieta DB, `due_date ?? now`,
  `last_review ?? undefined`. **Brak jakiegokolwiek testu weryfikującego grade → wyjście
  harmonogramu.** `ts-fsrs@5.4.1` (FSRS-6), `enable_fuzz: false` ⇒ interwały deterministyczne.
- **`src/pages/api/study/review.ts`** — SELECT (`SRS_COLUMNS`) → `scheduleReview` w JS → UPDATE
  (`updates` = 8 pól FSRS) keyed na `id` + `user_id` + CAS na `last_review`. Brak transakcji.
  Status: 401 / 503 / 422 / 404 (`PGRST116` na SELECT) / 500 / 409 (`PGRST116` na UPDATE) / 200
  z pełnym wierszem (`STUDY_QUEUE_COLUMNS`).
  - **§D.1 — równoległy double-submit: CHRONIONY.** Oba żądania czytają `S0`/`L0`; pierwszy UPDATE
    przesuwa `last_review` na `L1`; drugi `.eq("last_review", L0)` trafia 0 wierszy → `PGRST116`
    → `409`.
  - **§D.2 — sekwencyjny replay zakończonego przeglądu: NIECHRONIONY (rdzeń Ryzyka #4).** Po `200`
    wiersz jest w `S1`/`L1`. Drugie żądanie dla tego samego `id` czyta świeże `S1`, liczy nowy
    harmonogram, jego CAS `.eq("last_review", L1)` nadal pasuje → UPDATE **przechodzi** i karta
    jest oceniona drugi raz. Endpoint nigdy nie sprawdza, czy karta jest `due` ani czy pochodzi
    z kolejki. Duplikat `again` na karcie w `Review` → `Relearning` z bliskim `due_date` = ruch
    **wstecz**, utrata postępu.
- **`src/pages/api/study/queue.ts`** — `GET`, `mode` = `z.enum(["due","all"]).catch("due")`.
  Predykat due: `.or("due_date.is.null,due_date.lte.<server now>")`. **Brak jakiegokolwiek
  `.order()`.** `.limit(500)` bez paginacji. Zwraca goły JSON array. Klient (`StudySession.tsx`)
  dokłada jednorazowy Fisher–Yates shuffle. „Zła kolejność" nie ma serwerowego kontraktu do
  naruszenia (potwierdzone przez badanie; obala frazę „pokazuje karty w złej kolejności" z §2 #4).
- **`src/components/StudySession.tsx`** (299 linii, samodzielny). Jeden `useState<SessionState>`,
  `stateRef = useRef(state)` synchronizowany w `useEffect(…, [state])` — **na commit, nie
  synchronicznie**. `handleRate` guard: `if (current.status !== "session" || current.submitting)
  return;` czyta `stateRef.current`; `disabled={state.submitting}` działa dopiero po re-renderze.
  **§E.1 — dwa kliknięcia w jednym ticku oba czytają `submitting:false` i oba strzelają `fetch`.**
  Drugie żądanie dostaje `409`, którego `catch` robi `setState` na `prev` (już następna karta) →
  błędny banner na następnej karcie + ocena zgubiona z `ratingCounts`. Sukces ignoruje ciało
  odpowiedzi (`res.json()` nie czytane na sukcesie).
- **Migracja SM-2 → FSRS** (`supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql`):
  twardy reset każdego wiersza (`repetitions = 0, due_date = now()`, pamięć do defaultów kolumn:
  `stability=0, difficulty=0, state='New', lapses=0, last_review=NULL, scheduled_days=0`). Każdy
  test startuje od `state='New'` — jedyny stan, jaki tworzy `POST /api/flashcards`
  (`flashcards.ts:71` ustawia tylko `user_id, question, answer`; reszta = defaulty). Historię
  wielu przeglądów w teście integracyjnym buduje się wywołując `review.ts` wielokrotnie.
- **`src/pages/api/flashcards/[id].ts`** — PATCH pisze **wyłącznie** `question` / `answer`
  (`[id].ts:46-56`), nigdy pól harmonogramu. (Zamyka Open Question #5 z badania.)
- **Harness Fazy 1** (gotowy, `tests/`): `vitest.config.ts` = `getViteConfig({ test: {
  environment: "node", include: ["tests/**/*.test.{ts,tsx}"], globalSetup:
  ["tests/setup/global-setup.ts"], testTimeout: 15000, passWithNoTests: true } })`. Helpery:
  `buildApiContext` / `createCookieJar` (`tests/helpers/api-context.ts`), `signInAsTestUser` /
  `cleanupFlashcards` (`tests/helpers/test-session.ts`), `TEST_USER_A` / `TEST_USER_B`
  (`tests/helpers/test-users.ts` — stali, nigdy nie randomizowani). Warstwa komponentu (jsdom,
  `@testing-library/react`, `@testing-library/dom`, `jsdom` w `devDependencies`) wprowadzona w
  Fazie 2; `tests/components/FlashcardGenerator.test.tsx` — pierwsza linia
  `// @vitest-environment jsdom`, `vi.stubGlobal("fetch", …)` przywracane w `afterEach` +
  `cleanup()`. `include` już obejmuje `.tsx`.
- **`tests/api/study-isolation.test.ts`** — istniejący, to plik **autoryzacji (Ryzyko #3)**:
  „B nie widzi karty A / nie może jej zmienić", kontrola pozytywna „A ocenia własną kartę → 200,
  `last_review` niepuste". Zostaje bez zmian. Faza 3 dodaje **osobny** plik dla scenariuszy
  harmonogramowania (Ryzyko #4).

### Kluczowe odkrycia:

- `src/lib/services/fsrs.ts:46-59` — `scheduleReview`: `.log` odrzucany; `reps`→`repetitions`,
  `State[card.state]`→etykieta; `last_review` niepuste po każdym grade (`init()` stempluje `now`).
- `src/lib/services/fsrs.ts:28-41` — `flashcardToCardInput`: `due: row.due_date ?? now`;
  `elapsed_days: 0` / `learning_steps: 0` twardo (nieszkodliwe — `init()` przelicza `elapsed_days`).
- `src/pages/api/study/review.ts:70-85` — CAS na `last_review` + `409` na `PGRST116`; to
  *lost-update guard*, **nie** *idempotency guard*.
- `src/pages/api/study/queue.ts:25-31` — `.select().eq("user_id").or(due…).limit(500)`, **brak
  `.order()`**.
- `src/components/StudySession.tsx:49-52` — `stateRef` synchronizowany w `useEffect` (korzeń §E.1);
  `:99-140` `handleRate`; `:101,289` guard + `disabled` (oba po commicie).
- `ts-fsrs` `LongTermScheduler` wymusza `again < hard < good < easy` na interwałach przez `+1`
  bumpy (`node_modules/ts-fsrs/dist/index.mjs:1244-1259`); `enable_fuzz:false` ⇒ deterministyczne.
- Interwał → `due`: czysta arytmetyka ms (`review_time + interval * 86_400_000`), **bez
  normalizacji do północy** — „1 dzień" = dosłownie 24h od naciśnięcia przycisku (rolling).
- Konwencja „labeled regression": `auth-access-control-coverage/plan.md:84-87`, skanonizowana
  `test-plan.md` §6.4 pkt 7 / §6.6; żywe przykłady `tests/api/generate-flashcards*.test.ts`.

## Pożądany stan końcowy

`npm run test` (przy `npx supabase start`) przechodzi z trzema nowymi plikami:

- `tests/lib/fsrs.test.ts` — dowodzi, że `scheduleReview` okablowuje `ts-fsrs` poprawnie:
  właściwy kierunek zmiany per grade, granulacja dzienna (nie minutowa), monotonia
  `again ≤ hard ≤ good ≤ easy`, poprawne nazwy pól wyjściowych, `NULL due_date` = „teraz".
- `tests/api/study-review.test.ts` — dowodzi, że zakończony przegląd utrwala pola harmonogramu
  właściwej karty i że karta opuszcza `mode=due`; pinuje jako świadome regresje: brak
  idempotencji przy sekwencyjnym replayu (§D.2) i brak kontraktu kolejności kolejki (F5);
  potwierdza istniejącą ochronę CAS przy równoległym double-submit (§D.1).
- `tests/components/StudySession.test.tsx` — kontrola pozytywna pojedynczego kliknięcia; pinuje
  jako świadomą regresję obserwowalny efekt wyścigu double-click (§E.1).

`test-plan.md` §6.1 i §6.6 (notatki Fazy 3) wypełnione. Brak zmian w plikach pod `src/`.
Weryfikacja: `npm run test` zielone; `npm run lint` zielone; `git diff --stat` pokazuje tylko
`tests/**` i `context/**`.

## Czego NIE robimy

- **Żadnych zmian w kodzie produkcyjnym** (`src/**`, `supabase/**`). §D.2 (brak idempotencji),
  F5 (brak `.order()` / `.limit(500)`), §E.1 (brak synchronicznego guardu) są **pinowane jako
  świadome regresje**, nie naprawiane. Naprawa to osobna zmiana przez `/10x-new`.
- **Bez liczbowych fixtures FSRS-6** — żadnych ręcznie policzonych dokładnych wartości
  `stability`/`difficulty` per (state, grade). Tylko niezmienniki i asercje jakościowe (decyzja
  z wywiadu). Zakres asercji: kierunek, relacje, granulacja, nazwy pól, przynależność.
- **Bez mockowania `ts-fsrs`** ani ponownego uruchamiania `scheduler.next` w teście do produkcji
  „oczekiwanej" wartości (anty-wzorzec §2 #4).
- **Bez dedykowanego testu wielokartowego „review A nie rusza B"** (decyzja z wywiadu — UPDATE
  jest keyed na `id`+`user_id`, asercje id-scoped w pozostałych testach wystarczą).
- **Bez testu truncacji `.limit(500)`** (tworzenie >500 fiszek dla stałych użytkowników — wolne,
  wątpliwy sygnał przy skali MVP). Truncacja jest wymieniona w komentarzu blokowym testu
  kolejności, nie testowana osobno.
- **Bez zmiany `vitest.config.ts` / `fileParallelism`** — izolacja przez unikalne `id` +
  `cleanupFlashcards` w `afterEach`, asercje wyłącznie id-scoped, nigdy nie zakładamy pustej
  tabeli (F2 pozostaje własnością Fazy 5).
- **Bez modyfikacji `tests/api/study-isolation.test.ts`** (to plik Ryzyka #3).
- **Bez podłączania bramy CI** dla nowych testów (to Faza 5 — „Quality-gates wiring").
- **Bez `/10x-test-plan --refresh`** — §4 „Stos" nadal wymaga odświeżenia (jsdom/RTL z Fazy 2 +
  `tests/lib/` z tej fazy); ta faza tylko **odnotowuje** potrzebę w §6.6, nie wykonuje refresh.
- **Bez testów `elapsed_days` / kwantyzacji UTC / stref czasowych** — to zachowanie upstream
  `ts-fsrs`, nie błąd repo; badanie §G pokrywa to jako udokumentowaną migawkę, nie wymaga testu.

## Podejście do implementacji

Kolejność faz = od najtańszej i najbardziej izolowanej warstwy w górę: unit (`fsrs.ts`, bez
Supabase, bez sieci) → integracja (`review.ts` + `queue.ts`, harness Fazy 1, lokalne Supabase) →
komponent (`StudySession.tsx`, jsdom, `fetch` stubowany). Każda faza to osobny commit z własną
podfazą aktualizującą podręcznik (§6). Faza integracyjna zależy od działającego lokalnego
Supabase (`npx supabase start`); faza unit i komponentowa nie.

Wzór na „niezależnie wyprowadzone oczekiwanie" w tej fazie: **asercja właściwości, którą FSRS
gwarantuje z definicji algorytmu, nie wartości, którą liczy nasz kod.** Przykłady właściwości:
„interwał rośnie z jakością oceny", „pierwszy przegląd wychodzi ze stanu `New`", „`repetitions`
rośnie o dokładnie 1 na udany przegląd", „interwał jest liczbą całkowitą dni ≥ 1"
(`LongTermScheduler`), „`again` zwiększa `lapses`". Żadna z tych asercji nie odtwarza wzoru
`next_recall_stability` — łapią błędne okablowanie (zamiana pól, zły grade mapping, zła jednostka
interwału), nie replikują biblioteki.

## Faza 1: Unit — mapowanie pól i okablowanie `fsrs.ts`

### Przegląd

Dowodzi, że `scheduleReview` / `flashcardToCardInput` poprawnie przekazują dane do `ts-fsrs`
i poprawnie mapują wynik z powrotem na kształt wiersza `flashcards`. Bez Supabase, bez sieci,
prawdziwy `scheduler` z `src/lib/services/fsrs.ts`.

### Wymagane zmiany:

#### 1. Nowy plik testu jednostkowego

**Plik**: `tests/lib/fsrs.test.ts`

**Cel**: Zweryfikować kontrakt wejście→wyjście `scheduleReview` przez niezmienniki, tak by
regresja w mapowaniu pól, grade mappingu lub konfiguracji schedulera (`enable_short_term`)
złamała test. Importuje `scheduleReview`, `flashcardToCardInput` z `@/lib/services/fsrs`
i typy z `@/types`. Bez `vi.mock`.

**Kontrakt**: `scheduleReview(row: FsrsRow, rating: StudyRating, now: Date): FsrsRow`, gdzie
`FsrsRow = Pick<Flashcard, "due_date" | "stability" | "difficulty" | "scheduled_days" |
"repetitions" | "lapses" | "state" | "last_review">`. Wejściowy „świeży" wiersz:
`{ due_date: null, stability: 0, difficulty: 0, scheduled_days: 0, repetitions: 0, lapses: 0,
state: "New", last_review: null }`. Ustalony `now = new Date("2026-01-15T10:00:00.000Z")`
przekazywany jawnie do każdego wywołania (determinizm — `enable_fuzz:false`).

Grupy asercji:

- **Świeża karta, każdy grade** (`again`/`hard`/`good`/`easy`): wynik `state === "Review"`
  (nie `"Learning"`/`"Relearning"` — konsekwencja `enable_short_term:false`); `repetitions === 1`
  (dokładnie +1); `last_review` to niepusty string parsowalny do daty === `now`;
  `new Date(due_date).getTime() > now.getTime()`.
- **Granulacja dzienna (okablowanie `enable_short_term:false`)**: `scheduled_days` to liczba
  całkowita (`Number.isInteger`) ≥ 1; `Math.round((new Date(due_date) - now) / 86_400_000)` ===
  `scheduled_days` (interwał w dniach, nie minutach — złapie regresję „learning_steps schedules
  in minutes").
- **Monotonia po jakości oceny** (z tego samego świeżego wejścia): `scheduled_days` dla
  `again ≤ hard ≤ good ≤ easy`; dodatkowo `due_date` w tej samej kolejności rosnącej.
  (Biblioteka gwarantuje strict `<` przez `+1` bumpy — asercja `≤` jest bezpieczna i odporna
  na przyszłe przypadki, gdzie surowe interwały by się zrównały.)
- **Nazwy pól wyjściowych**: zwrócony obiekt ma **klucz `repetitions`** i **nie ma klucza `reps`**
  (`expect(Object.keys(result)).toContain("repetitions")` / `.not.toContain("reps")`); `state`
  to jedna z etykiet `"New"|"Learning"|"Review"|"Relearning"` (string), nie liczba
  (`typeof result.state === "string"`).
- **`again` na karcie w stanie `Review`** (wejście: weź wynik świeżego `good`, podaj jako `row`
  z drugim wywołaniem, `now` przesunięty o kilka dni): `state === "Relearning"`; `lapses`
  zwiększone o 1 względem wejścia; `new Date(due_date)` **wcześniej** niż `due_date` z równoległego
  `good` na tym samym wejściu (kierunek „wstecz" — udokumentowany jako obserwacja, nie regresja
  do złamania, bo to poprawne zachowanie FSRS; komentarz wyjaśnia że to *oczekiwane* cofnięcie
  przy realnym „again", w odróżnieniu od cofnięcia przez replay w Fazie 2).
- **`good`/`easy` na karcie w stanie `Review`**: `stability` **ściśle większe** niż `stability`
  wejścia (`>`), `difficulty` w zakresie `[1, 10]`.
- **`flashcardToCardInput` — `NULL due_date`**: `flashcardToCardInput({...row, due_date: null},
  now).due` zwraca `now` (traktowane jako „do powtórki teraz"); dla `due_date` niepustego zwraca
  `new Date(due_date)`.
- **`flashcardToCardInput` — stałe**: `.elapsed_days === 0`, `.learning_steps === 0`,
  `.reps === row.repetitions`, `.state === row.state`, `.last_review === undefined` gdy
  `row.last_review === null`.

**Fragment** (jedyny nieoczywisty punkt — niezależna asercja interwału bez odtwarzania wzoru):

```ts
// NIE liczymy oczekiwanego interwału wzorem FSRS — sprawdzamy właściwość:
// interwał zwrócony przez scheduleReview, przeliczony z powrotem na dni, musi
// równać się scheduled_days (czyli due_date jest o scheduled_days *dni* od now,
// a nie o scheduled_days *minut* — to jest asercja okablowania enable_short_term:false).
const r = scheduleReview(freshRow, "good", NOW);
const daysFromDue = Math.round((new Date(r.due_date!).getTime() - NOW.getTime()) / 86_400_000);
expect(daysFromDue).toBe(r.scheduled_days);
expect(Number.isInteger(r.scheduled_days)).toBe(true);
expect(r.scheduled_days).toBeGreaterThanOrEqual(1);
```

#### 2. Podfaza — wypełnij `test-plan.md` §6.1

**Plik**: `context/foundation/test-plan.md`

**Cel**: Zamienić placeholder §6.1 („TBD — patrz §3 Faza 3 …") na opis wzorca testu jednostkowego
ustalonego tą fazą: lokalizacja (`tests/lib/<moduł>.test.ts`), env `node` (domyślny), brak
Supabase/mocka, zasada „asercja właściwości gwarantowanej przez algorytm, nie wartości liczonej
przez kod", przykład z `tests/lib/fsrs.test.ts`. Zostaw wzmiankę o §3 Faza 4 (wzorzec przypadków
brzegowych zapytania selekcji) jako wciąż `TBD`.

**Kontrakt**: sekcja `### 6.1 Dodawanie testu jednostkowego` w `test-plan.md`; §1–§5 pozostają
nietknięte (zamrożona strategia).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Nowy plik istnieje: `test -f tests/lib/fsrs.test.ts`
- Testy jednostkowe przechodzą: `npx vitest run tests/lib/fsrs.test.ts`
- Cały zestaw nadal przechodzi: `npm run test`
- Lint przechodzi: `npm run lint`
- `git diff --stat` pokazuje tylko `tests/lib/fsrs.test.ts` i `context/**` (żadnego `src/**`)

#### Weryfikacja ręczna:

- Test faktycznie łamie się przy wstrzykniętej regresji: tymczasowo zamień w `fsrs.ts`
  `repetitions: card.reps` na `repetitions: card.reps + 1` LUB usuń `enable_short_term: false` —
  potwierdź czerwień, cofnij zmianę.
- Komentarze w teście jasno oddzielają „asercja właściwości" od „to nie jest re-kalkulacja wzoru".
- §6.1 czyta się jako instrukcja użyteczna dla kogoś, kto nie brał udziału w tej sesji.

**Uwaga implementacyjna**: Po zielonych automatach zatrzymaj się na ręczne potwierdzenie
człowieka (wstrzyknięta regresja faktycznie łamie test), zanim przejdziesz do Fazy 2.

---

## Faza 2: Integracja — round-trip `review.ts` + odbicie w `queue.ts`

### Przegląd

Dowodzi na poziomie HTTP (handler wywołany bezpośrednio, bez serwera), że zakończony przegląd
utrwala pola harmonogramu właściwej karty i że karta znika z `mode=due`; pinuje §D.2 i F5 jako
świadome regresje; potwierdza ochronę CAS §D.1. Używa harnessu Fazy 1 z `TEST_USER_A`.

### Wymagane zmiany:

#### 1. Nowy plik testu integracyjnego

**Plik**: `tests/api/study-review.test.ts`

**Cel**: Pokryć scenariusze harmonogramowania Ryzyka #4 dla `POST /api/study/review` +
`GET /api/study/queue`, w odróżnieniu od `study-isolation.test.ts` (Ryzyko #3, autoryzacja).
Wszystkie asercje id-scoped; `cleanupFlashcards(createdIds.splice(0))` w `afterEach`; karty
tworzone przez `POST as flashcardsPost` z `@/pages/api/flashcards`.

**Kontrakt**: importy `POST as studyReviewPost` z `@/pages/api/study/review`,
`GET as studyQueueGet` z `@/pages/api/study/queue`, `POST as flashcardsPost` z
`@/pages/api/flashcards`; helpery `buildApiContext` / `createCookieJar`, `signInAsTestUser` /
`cleanupFlashcards`, `TEST_USER_A`. Każdy uwierzytelniony kontekst przekazuje **ORAZ**
`headers.Cookie: sessionA.cookieHeader` **ORAZ** `locals: { user: sessionA.user }` (handler
bramkuje 401/404 na `locals.user`, zapytanie Supabase biegnie na ciasteczku — inaczej
false-positive przez RLS). `beforeAll` loguje `TEST_USER_A`.

Przypadki:

- **2.1 Kontrola pozytywna — przegląd utrwala harmonogram.** Utwórz świeżą kartę → `POST review
  { id, rating: "good" }` → `200`. Ciało odpowiedzi (`STUDY_QUEUE_COLUMNS`): `state === "Review"`,
  `repetitions === 1`, `last_review` niepuste, `new Date(due_date) > new Date()`. Następnie
  `GET queue?mode=all` → ten sam wiersz (po `id`) ma te same utrwalone wartości (dowód, że UPDATE
  trafił bazę, nie tylko odpowiedź).
- **2.2 Karta opuszcza `mode=due`.** Utwórz kartę (widoczna w `queue?mode=due` przez gałąź
  `due_date IS NULL`) → potwierdź obecność w `mode=due` → `POST review { rating: "good" }` →
  `GET queue?mode=due` ponownie → karta **nieobecna** (jej `due_date` przesunięte w przyszłość);
  `GET queue?mode=all` → wciąż obecna. To jest testowalna połowa „właściwej kolejności":
  zaplanowana karta wypada z kolejki najbliższych powtórek.
- **2.3 ŚWIADOMA REGRESJA §D.2 — brak idempotencji sekwencyjnego replayu.** Utwórz kartę →
  `POST review { rating: "good" }` → `200` (zapamiętaj `due_date` D1, `state` "Review") →
  **drugie** `POST review { id, rating: "again" }` dla tego samego `id` →
  asercje dokumentujące obecny kontrakt: status `=== 200` (**nie** 409/404/422); zwrócony
  `state === "Relearning"`; `new Date(due_date) < new Date(D1)` (harmonogram cofnięty).
  Komentarz blokowy: *„DOKUMENTUJEMY: `POST /api/study/review` nie jest idempotentny — CAS na
  `last_review` chroni tylko przed równoległym double-submit (§D.1), nie przed sekwencyjnym
  replayem już zakończonego przeglądu. Powtórzone żądanie re-graduje kartę i może cofnąć
  harmonogram (utrata postępu, Ryzyko #4). NIE WYMAGAMY tego zachowania — ten test złamie się,
  gdy wejdzie kontrola idempotencji / sprawdzenie `due_date > now` w endpoincie."* Nazwa testu
  zawiera „(świadoma regresja)".
- **2.4 Kontrola pozytywna §D.1 — równoległy double-submit chroniony.** Utwórz kartę → wystrzel
  **dwa** `POST review { id, rating: "good" }` dla tego samego `id` przez `Promise.all` →
  posortuj statusy → dokładnie `[200, 409]`. `GET queue?mode=all` → `repetitions === 1` (tylko
  jeden przegląd zastosowany). To **nie** jest regresja — potwierdza istniejący, pożądany CAS.
- **2.5 ŚWIADOMA REGRESJA F5 — kolejka bez kontraktu kolejności.** Utwórz 3 świeże karty (A, B, C)
  jako `TEST_USER_A` → `GET queue?mode=due` → asercja: wszystkie 3 `id` są obecne
  (przynależność **zbioru**, nie sekwencji: `expect(new Set(returnedIds)).toEqual(new
  Set([a,b,c]))` z filtrem do naszych `id`). **Brak** asercji na kolejność elementów. Komentarz
  blokowy: *„DOKUMENTUJEMY: `GET /api/study/queue` nie ma klauzuli `.order()` — kolejność wierszy
  jest niezdefiniowana (porządek fizycznego skanu Postgresa), a klient nakłada własny shuffle.
  Prezentacja kart nie jest częścią kontraktu API. `.limit(500)` dodatkowo ucina duże zestawy
  due bez paginacji (F5, wciąż otwarte). NIE WYMAGAMY kolejności — ten test asertuje tylko
  kompletność zbioru i złamie się, gdy dodane zostanie deterministyczne sortowanie + paginacja
  (wtedy dojdą asercje kolejności)."*
- **2.6 Szybkie guardy kontraktu.** `POST review` z nieistniejącym (losowym) UUID → `404`;
  `POST review { id, rating: "invalid" }` → `422`. (Tanie, deterministyczne, bez tworzenia kart
  dla 422.)

**Fragment** (jedyny nieoczywisty punkt — kolejność rejestrowania `id` do cleanup i asercja
utrwalenia przez ponowny odczyt):

```ts
// id rejestrujemy do createdIds ZARAZ po 201 z flashcardsPost (przed asercjami review),
// żeby afterEach posprzątał nawet gdy asercja review zawiedzie — tabela flashcards jest
// dzielona między stałych użytkowników i pliki testowe (fileParallelism NIE jest wyłączone).
const created = await flashcardsPost(makeCreateCtx());
const { id } = (await created.json()) as { id: string };
createdIds.push(id);
// „utrwalone" = widoczne w świeżym GET, nie tylko w odpowiedzi POST:
const q = await studyQueueGet(makeQueueCtx("all"));
const row = ((await q.json()) as FlashcardDto[]).find((f) => f.id === id);
expect(row?.state).toBe("Review");
```

#### 2. Podfaza — wypełnij `test-plan.md` §6.2 (dopisek) i §6.6 (Faza 3)

**Plik**: `context/foundation/test-plan.md`

**Cel**: Dopisać do §6.2 krótką notatkę, że wzorzec testu integracyjnego rozszerza się o
**scenariusze mutacji stanu współdzielonego** (tworzenie + wielokrotny `POST review` na tej samej
karcie): rejestruj `id` natychmiast po `201`, asercje wyłącznie id-scoped, `Promise.all` do
wymuszenia równoległości dla testu CAS. Dodać podsekcję **„Faza 3 — Study/FSRS scheduling
integrity"** w §6.6 wskazującą na `tests/lib/fsrs.test.ts` (§6.1) i `tests/api/study-review.test.ts`
(§6.2), z wypunktowaniem przypadków 2.1–2.6 i etykietą „(świadoma regresja)" przy 2.3 i 2.5.

**Kontrakt**: sekcje `### 6.2` (dopisek na końcu, przed „Uruchomienie:") i `### 6.6` (nowy
akapit „**Faza 3 — …**") w `test-plan.md`; §1–§5 nietknięte.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Nowy plik istnieje: `test -f tests/api/study-review.test.ts`
- Testy przechodzą: `npx vitest run tests/api/study-review.test.ts` (przy `npx supabase start`)
- Cały zestaw przechodzi: `npm run test`
- Lint przechodzi: `npm run lint`
- `git diff --stat` bez zmian w `src/**`
- `tests/api/study-isolation.test.ts` niezmieniony (`git diff --exit-code -- tests/api/study-isolation.test.ts`)

#### Weryfikacja ręczna:

- Uruchom `npx supabase db reset && npm run test` — pełny czysty przebieg zielony (potwierdza
  brak zależności od stanu tabeli).
- Test 2.3 opisany słowem „dokumentujemy … nie wymagamy" i faktycznie łamałby się przy dodaniu
  kontroli idempotencji (przejrzyj asercje — sprawdzają `200`, nie `4xx`).
- Test 2.4 rozróżnia właściwy przypadek (jeden `200`, jeden `409`) — nie jest to regresja.
- Uruchom `tests/api/study-review.test.ts` dwukrotnie z rzędu bez `db reset` — nadal zielony
  (cleanup działa, brak wycieku stanu między przebiegami).
- Test 2.5 asertuje przynależność zbioru, nie sekwencję (przejrzyj — brak `toEqual([a,b,c])`
  na tablicy uporządkowanej).

**Uwaga implementacyjna**: Po zielonych automatach zatrzymaj się na ręczne potwierdzenie
człowieka (pełny `db reset` + podwójny przebieg zielone), zanim przejdziesz do Fazy 3.

---

## Faza 3: Komponent — wyścig double-click `StudySession.tsx` (§E.1)

### Przegląd

Dowodzi na poziomie komponentu (jsdom, RTL, `fetch` stubowany), że pojedyncze kliknięcie oceny
działa poprawnie, i pinuje jako świadomą regresję obserwowalny efekt dwóch kliknięć w jednym
ticku (§E.1: drugie żądanie `409` → błędny banner na następnej karcie + zgubiona ocena).

### Wymagane zmiany:

#### 1. Nowy plik testu komponentu

**Plik**: `tests/components/StudySession.test.tsx`

**Cel**: Pokryć kliencką połowę Ryzyka #4 („zła kolejność" / zgubiona ocena) dla najgorętszego
pliku obszaru (`StudySession.tsx`, 4 commity/30d). Renderuje prawdziwy `<StudySession />`
z `@/components/StudySession`, stubuje `fetch` do kontroli odpowiedzi `queue` i `review`.

**Kontrakt**: pierwsza linia `// @vitest-environment jsdom`. `render` z
`@testing-library/react`; `screen` / `fireEvent` lub `userEvent`; `cleanup()` + przywrócenie
`fetch` w `afterEach` (wzorzec z `tests/components/FlashcardGenerator.test.tsx`).
`vi.stubGlobal("fetch", vi.fn())` z implementacją routującą po URL:
`/api/study/queue` → `200` + tablica 2 kart (`FlashcardDto` z minimalnym kształtem: `id`,
`question`, `answer` + pola FSRS z defaultów); `/api/study/review` → konfigurowalne per test
(pierwszy call `200` + zaktualizowany wiersz, drugi call `409`).

Przypadki:

- **3.1 Kontrola pozytywna — pojedyncze kliknięcie.** Wejdź w sesję (klik „Powtórki do nauki"
  / mode `due`), poczekaj na render pierwszej karty (`Karta 1 z 2`), kliknij „Pokaż odpowiedź",
  kliknij jedną ocenę → asercje: `fetch` do `/api/study/review` wywołany **dokładnie raz**;
  widok przechodzi do `Karta 2 z 2`; brak bannera błędu w DOM.
- **3.2 ŚWIADOMA REGRESJA §E.1 — dwa kliknięcia w jednym ticku.** Wejdź w sesję, pokaż odpowiedź,
  wywołaj **dwa** kliknięcia ocen synchronicznie (dwa różne przyciski w tym samym zadaniu, bez
  `await` między nimi) → po rozwiązaniu obu żądań asercje dokumentujące obecny błąd: `fetch` do
  `/api/study/review` wywołany **dwa razy** (guard nie zablokował drugiego); w DOM pojawia się
  banner błędu (`— wybierz ocenę ponownie poniżej.`) mimo że pierwsze żądanie się powiodło;
  ORAZ/LUB suma `ratingCounts` w widoku podsumowania po dokończeniu sesji < liczba kliknięć ocen
  (zgubiona ocena). Komentarz blokowy: *„DOKUMENTUJEMY §E.1: `handleRate` guard czyta
  `stateRef.current` synchronizowany w `useEffect` (na commit, nie synchronicznie), a
  `disabled={state.submitting}` działa dopiero po re-renderze — dwa kliknięcia w jednym ticku
  oba przechodzą guard i oba strzelają `fetch`. Drugie dostaje `409`, którego `catch` maluje
  banner na już-następnej karcie i gubi ocenę z `ratingCounts` (Ryzyko #4 „zła kolejność" /
  utrata postępu). NIE WYMAGAMY tego — test złamie się, gdy `handleRate` dostanie synchroniczny
  guard (np. `useRef` ustawiany na górze handlera przed pierwszym `await`)."* Nazwa zawiera
  „(świadoma regresja)".
- **3.3 Kontrola pozytywna — banner błędu znika po udanym ponowieniu.** Pierwszy `review` →
  `500`, banner się pojawia; użytkownik klika ocenę ponownie → drugi `review` → `200`; banner
  znika, widok przechodzi do następnej karty. (Potwierdza, że mechanizm bannera sam w sobie
  działa — kontrastuje z 3.2, gdzie banner jest *fałszywy*.)

**Fragment** (jedyny nieoczywisty punkt — wymuszenie dwóch synchronicznych kliknięć przed
re-renderem):

```tsx
// §E.1 wymaga, by oba kliknięcia trafiły w tym samym ticku, ZANIM React
// przetworzy setState({submitting:true}) i zanim useEffect zsynchronizuje stateRef.
// userEvent domyślnie awaituje po każdej akcji (co pozwoliłoby na re-render),
// więc używamy synchronicznego fireEvent bez await między kliknięciami:
fireEvent.click(screen.getByRole("button", { name: "Dobrze" }));
fireEvent.click(screen.getByRole("button", { name: "Łatwe" }));
await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(/* queue */ 1 + /* review */ 2));
```

#### 2. Podfaza — dopisz `test-plan.md` §6.6 (Faza 3) + flaga §4

**Plik**: `context/foundation/test-plan.md`

**Cel**: Rozszerzyć podsekcję „Faza 3" w §6.6 o warstwę komponentu
(`tests/components/StudySession.test.tsx`, przypadki 3.1–3.3, etykieta „(świadoma regresja)" przy
3.2) i **odnotować**, że §4 „Stos" nadal wymaga `/10x-test-plan --refresh`: Faza 2 wprowadziła
jsdom/RTL, Faza 3 dodaje katalog `tests/lib/` (testy jednostkowe modułów `src/lib`) — obie zmiany
poza zamrożoną §4. Ta faza **nie** uruchamia refresh.

**Kontrakt**: sekcja `### 6.6` w `test-plan.md`, akapit „**Faza 3 — …**" (rozszerzenie tego z
Fazy 2 tego planu); jedno zdanie flagujące `--refresh` dla §4. §1–§5 nietknięte.

#### 3. Zaktualizuj `change.md`

**Plik**: `context/changes/study-fsrs-scheduling-integrity/change.md`

**Cel**: `status: planned` (ustawione przez ten plan) → po zakończeniu wszystkich faz pozostaje
`planned` do czasu, aż `/10x-test-plan` oznaczy wiersz §3 jako `complete` przy kolejnym
uruchomieniu orkiestratora. Ta faza tylko dopisuje w `## Notes` link do `plan.md` i listę trzech
dostarczonych plików testowych.

**Kontrakt**: frontmatter `change.md` (`updated: <dzisiaj>`), sekcja `## Notes`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Nowy plik istnieje: `test -f tests/components/StudySession.test.tsx`
- Pierwsza linia to `// @vitest-environment jsdom`
- Testy przechodzą: `npx vitest run tests/components/StudySession.test.tsx`
- Cały zestaw przechodzi: `npm run test`
- Lint przechodzi: `npm run lint`
- `git diff --stat` bez zmian w `src/**`

#### Weryfikacja ręczna:

- Test 3.2 faktycznie obserwuje błąd (banner / zgubiona ocena), a nie tylko „dwa `fetch`" —
  potwierdź, że asercja dotyczy obserwowalnego efektu dla użytkownika.
- Test 3.2 złamałby się przy synchronicznym guardzie: tymczasowo dodaj na górze `handleRate`
  w `StudySession.tsx` `if (submitLockRef.current) return; submitLockRef.current = true;`
  (z `const submitLockRef = useRef(false)` i resetem w `finally`) → potwierdź czerwień 3.2 i
  zieleń 3.1/3.3, cofnij zmianę.
- 3.1 i 3.3 przechodzą stabilnie przy 10 kolejnych uruchomieniach (brak flake od kolejności
  promisów): `for i in $(seq 10); do npx vitest run tests/components/StudySession.test.tsx || break; done`
- §6.6 czyta się jako kompletna „książka kucharska" dla Ryzyka #4 po tej fazie.

**Uwaga implementacyjna**: Po zielonych automatach zatrzymaj się na ręczne potwierdzenie
człowieka (wstrzyknięty synchroniczny guard łamie 3.2, nie łamie 3.1/3.3; 10× bez flake).
To ostatnia faza — po potwierdzeniu uruchom ponownie `/10x-test-plan` (bez argumentów), by
orkiestrator oznaczył wiersz §3 Faza 3 jako `complete`.

---

## Strategia testowania

### Testy jednostkowe (Faza 1):

- `scheduleReview` — kierunek zmiany per grade, granulacja dzienna, monotonia
  `again ≤ hard ≤ good ≤ easy`, nazwy pól wyjściowych (`repetitions` nie `reps`, `state` jako
  string), `repetitions` +1 dokładnie, `lapses` +1 przy `again`, `stability` rośnie przy
  `good`/`easy` na Review.
- `flashcardToCardInput` — `NULL due_date` → `now`; stałe `elapsed_days:0` / `learning_steps:0`;
  `last_review: null` → `undefined`.
- Przypadek brzegowy: `again` na karcie w stanie `Review` → `Relearning` + wcześniejszy `due_date`
  (poprawne cofnięcie FSRS — kontrast z replayem w Fazie 2).

### Testy integracyjne (Faza 2):

- End-to-end `POST /api/study/review`: świeża karta → `good` → wiersz utrwalony (potwierdzony
  ponownym `GET queue`), karta znika z `mode=due`, pozostaje w `mode=all`.
- Świadoma regresja §D.2: sekwencyjny replay → `200` + cofnięty harmonogram.
- Kontrola pozytywna §D.1: równoległy `Promise.all` double-submit → `[200, 409]`, `repetitions`
  === 1.
- Świadoma regresja F5: 3 karty, `GET queue?mode=due` → przynależność zbioru, brak asercji
  kolejności.
- Guardy: `404` na nieznany UUID, `422` na złą ocenę.

### Testy komponentu (Faza 3):

- Kontrola pozytywna: jedno kliknięcie → jeden `fetch`, przejście karty, brak bannera.
- Świadoma regresja §E.1: dwa synchroniczne kliknięcia → dwa `fetch`, fałszywy banner /
  zgubiona ocena.
- Kontrola pozytywna: banner po `500` znika po udanym ponowieniu.

### Kroki testowania ręcznego:

1. Faza 1: wstrzyknij regresję do `fsrs.ts` (`reps + 1` lub usuń `enable_short_term:false`),
   potwierdź czerwień `tests/lib/fsrs.test.ts`, cofnij.
2. Faza 2: `npx supabase db reset && npm run test` — pełny czysty przebieg zielony; potem
   `npx vitest run tests/api/study-review.test.ts` dwukrotnie bez resetu — nadal zielony.
3. Faza 3: wstrzyknij synchroniczny `useRef` guard do `handleRate`, potwierdź czerwień 3.2 +
   zieleń 3.1/3.3, cofnij; uruchom plik 10× pod rząd — brak flake.
4. Po wszystkich fazach: `git diff --stat` pokazuje wyłącznie `tests/**` i `context/**`.

## Uwagi dotyczące wydajności

- Faza 2 tworzy niewielką liczbę fiszek per test (1–3) i sprząta w `afterEach` — bez masowego
  seedowania. `.limit(500)` **nie** jest testowane (świadomie — patrz „Czego NIE robimy").
- `fileParallelism` pozostaje włączone; izolacja przez id-scoped asercje + cleanup. Jeśli
  w praktyce pojawi się flake między `study-review.test.ts` a innym plikiem mutującym `flashcards`
  dla `TEST_USER_A`, eskaluj do Fazy 5 (nie łataj configu w tej fazie).
- Faza 3 z `fireEvent` (synchroniczny) zamiast `userEvent` (awaitujący) — celowo, by trafić
  w okno wyścigu przed re-renderem; `waitFor` z krótkim timeoutem na rozwiązanie żądań.

## Uwagi dotyczące migracji

Brak. Faza nie dotyka schematu ani danych. Testy zakładają obecny stan migracji
(`state='New'` jako stan startowy każdej nowej karty, `due_date IS NULL` = „due now").

## Referencje

- Powiązane badania: `context/changes/study-fsrs-scheduling-integrity/research.md`
- Ryzyko #4 i wskazówki reagowania: `context/foundation/test-plan.md` §2 (wiersz #4), §3 (Faza 3)
- Wzorzec testu integracyjnego: `context/foundation/test-plan.md` §6.2;
  `tests/api/study-isolation.test.ts` (szablon — importuje oba handlery study)
- Konwencja „świadoma regresja": `context/foundation/test-plan.md` §6.4 pkt 7 / §6.6;
  `tests/api/generate-flashcards.test.ts:8-20`, `tests/api/generate-flashcards-rate.test.ts:8-16`
- Wzorzec testu komponentu (jsdom): `tests/components/FlashcardGenerator.test.tsx`
- `src/lib/services/fsrs.ts:28-59`, `src/pages/api/study/review.ts:45-95`,
  `src/pages/api/study/queue.ts:25-31`, `src/components/StudySession.tsx:49-52,99-140`
- Historyczne pitfalle „wired correctly": `context/archive/2026-08-02-study-session/plan.md:64-77`
  (F2/F3/F4/F5 w `reviews/impl-review.md`)

## Addenda (przegląd implementacji, 2026-09-09)

**A1 — Sprostowanie: `again` na karcie w stanie `Review` pozostaje `Review`, nie
`Relearning`.** Tekst tego planu w kilku miejscach (Przegląd §D.2 „→ Relearning";
Faza 1 grupa asercji „`again` na karcie w stanie `Review`" → „`state === "Relearning"`";
Faza 2 case 2.3 → „zwrócony `state === "Relearning"`"; Strategia testowania →
„Przypadek brzegowy: `again` ... → `Relearning`") jest **niepoprawny**. Zgodnie z
`research.md` §A (odnośniki `ts-fsrs` `index.mjs:1216-1218, 1272-1278`) i „Analizą
stanu obecnego" tego planu (model 2-stanowy `New → Review`): przy
`enable_short_term: false` scheduler to `LongTermScheduler`, który dla **każdego**
grade utrwala `State.Review` — `Learning`/`Relearning` nigdy nie trafiają do bazy.
„Cofnięcie" harmonogramu przy realnym `again` jest obserwowalne przez `lapses` +1
i krótszy `due_date`, **nie** przez zmianę `state`. Zaimplementowane testy
(`tests/lib/fsrs.test.ts` asertuje `state === "Review"`; `tests/api/study-review.test.ts`
2.3 nie asertuje `state` w ogóle) są poprawne; wiążący jest ten addendum, nie
oryginalny tekst asercji. `context/foundation/test-plan.md` §6.6 opisuje to już
poprawnie.

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku.
> Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Unit — mapowanie pól i okablowanie `fsrs.ts`

#### Automatyczne

- [x] 1.1 Nowy plik istnieje: `test -f tests/lib/fsrs.test.ts` — aaf2e7c
- [x] 1.2 Testy jednostkowe przechodzą: `npx vitest run tests/lib/fsrs.test.ts` — aaf2e7c
- [x] 1.3 Cały zestaw nadal przechodzi: `npm run test` — aaf2e7c
- [x] 1.4 Lint przechodzi: `npm run lint` — aaf2e7c
- [x] 1.5 `git diff --stat` pokazuje tylko `tests/lib/fsrs.test.ts` i `context/**` (żadnego `src/**`) — aaf2e7c

#### Ręczne

- [x] 1.6 Wstrzyknięta regresja w `fsrs.ts` (`reps + 1` lub brak `enable_short_term:false`) faktycznie łamie test; cofnięta — aaf2e7c
- [x] 1.7 Komentarze w teście oddzielają „asercja właściwości" od „re-kalkulacji wzoru" — aaf2e7c
- [x] 1.8 §6.1 czyta się jako instrukcja użyteczna dla osoby spoza sesji — aaf2e7c

### Faza 2: Integracja — round-trip `review.ts` + odbicie w `queue.ts`

#### Automatyczne

- [x] 2.1 Nowy plik istnieje: `test -f tests/api/study-review.test.ts` — 3896df3
- [x] 2.2 Testy przechodzą: `npx vitest run tests/api/study-review.test.ts` (przy `npx supabase start`) — 3896df3
- [x] 2.3 Cały zestaw przechodzi: `npm run test` — 3896df3
- [x] 2.4 Lint przechodzi: `npm run lint` — 3896df3
- [x] 2.5 `git diff --stat` bez zmian w `src/**` — 3896df3
- [x] 2.6 `tests/api/study-isolation.test.ts` niezmieniony (`git diff --exit-code -- tests/api/study-isolation.test.ts`) — 3896df3

#### Ręczne

- [x] 2.7 `npx supabase db reset && npm run test` — pełny czysty przebieg zielony — 3896df3
- [x] 2.8 Test 2.3 opisany „dokumentujemy … nie wymagamy" i łamałby się przy kontroli idempotencji — 3896df3
- [x] 2.9 Test 2.4 rozróżnia właściwy przypadek (`[200, 409]`) — nie jest regresją — 3896df3
- [x] 2.10 `tests/api/study-review.test.ts` uruchomiony dwukrotnie bez `db reset` — nadal zielony — 3896df3
- [x] 2.11 Test 2.5 asertuje przynależność zbioru, nie sekwencję — 3896df3

### Faza 3: Komponent — wyścig double-click `StudySession.tsx` (§E.1)

#### Automatyczne

- [x] 3.1 Nowy plik istnieje: `test -f tests/components/StudySession.test.tsx` — 1ab61d2
- [x] 3.2 Pierwsza linia to `// @vitest-environment jsdom` — 1ab61d2
- [x] 3.3 Testy przechodzą: `npx vitest run tests/components/StudySession.test.tsx` — 1ab61d2
- [x] 3.4 Cały zestaw przechodzi: `npm run test` — 1ab61d2
- [x] 3.5 Lint przechodzi: `npm run lint` — 1ab61d2
- [x] 3.6 `git diff --stat` bez zmian w `src/**` — 1ab61d2

#### Ręczne

- [x] 3.7 Test 3.2 obserwuje efekt dla użytkownika (banner / zgubiona ocena), nie tylko „dwa fetch" — 1ab61d2
- [x] 3.8 Wstrzyknięty synchroniczny guard w `handleRate` łamie 3.2, nie łamie 3.1/3.3; cofnięty — 1ab61d2
- [x] 3.9 3.1 i 3.3 przechodzą stabilnie przy 10 kolejnych uruchomieniach (brak flake) — 1ab61d2
- [x] 3.10 §6.6 czyta się jako kompletna książka kucharska dla Ryzyka #4; flaga `--refresh` dla §4 odnotowana — 1ab61d2
