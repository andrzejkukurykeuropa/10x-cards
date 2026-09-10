# Plan Testów

> Fazowe wdrożenie testów dla tego projektu. Strategia jest zamrożona na
> górze (§1–§5); wzorce podręcznika na dole (§6) uzupełniają się w miarę
> realizacji faz. Przeczytaj przed napisaniem jakiegokolwiek nowego testu.
>
> Odświeżenie: uruchom ponownie `/10x-test-plan --refresh`, gdy plan jest
> nieaktualny (patrz §8).
>
> Ostatnia aktualizacja: 2026-09-10 (§3 Faza 5 „Quality-gates wiring" domknięta: Status → `complete`. Dług lintu wyzerowany (49→0), `vitest.config.unit.ts` + skrypt `test:unit` (zakres `tests/lib/**`, bez `globalSetup`), krok `npm run test:unit` w jobie `ci` między `lint` a `build`, check `ci` jako required status check na `master`. §5 sprostowane: brak osobnej bramy typecheck (złożona w `lint`); brama jednostkowa okablowana w CI, integracyjna nadal local-only. §4 „Stos" wciąż wymaga `--refresh` za jsdom/RTL + `tests/lib/` z Faz 2–3 oraz `vitest.config.unit.ts` — nie blokowało Fazy 5.)

## 1. Strategia

Testy w tym projekcie kierują się trzema nienegocjowalnymi zasadami:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje prawdziwy sygnał
   dla danego ryzyka. Nie promuj do e2e, ponieważ e2e "wydaje się
   bezpieczniejsze". Nie nakładaj modelu wizyjnego na deterministyczną
   różnicę wizualną, która już wykrywa regresję.
2. **Obawy użytkowników są dowodem pierwszej kategorii.** Ryzyka zakotwiczone
   w "zespół obawia się X, a awaria pojawiłaby się gdzieś w obszarze Y" mają
   taką samą wagę jak linie PRD lub dane hot-spotów.
3. **Ryzyka to scenariusze, a nie lokalizacje kodu.** Ten plan dokumentuje
   *co mogłoby zawieść* i *dlaczego uważamy, że jest to prawdopodobne* —
   na podstawie dokumentów, wywiadu i *sygnału* z bazy kodu (częstotliwość
   zmian, struktura, baza testowa). NIE twierdzi, że wie, która linia
   odpowiada za awarię. Ta wiedza jest produkowana przez `/10x-research`
   podczas każdej fazy wdrożenia. Jeśli plan i badanie nie zgadzają się co
   do tego, gdzie leży awaria, badanie jest źródłem prawdy.

Zakres hot-spotów użyty do ważenia prawdopodobieństwa: `src/components`,
`src/pages` (w tym `src/pages/api`), `src/lib` (w tym `src/lib/services`),
`supabase/migrations` (20 commitów/30 dni — wystarczający sygnał).

## 2. Mapa Ryzyk

Główne scenariusze awarii, przed którymi ten projekt musi się bronić,
uporządkowane według ryzyka = wpływ × prawdopodobieństwo. Ryzyka to
scenariusze awarii w kategoriach użytkownika/biznesu, a nie nazwy testów.
Kolumna Źródło cytuje *dowód, który wyniósł to ryzyko na szczyt* — nigdy
konkretny plik jako "miejsce, gdzie leży awaria".

| # | Ryzyko (scenariusz awarii) | Wpływ | Prawdopodobieństwo | Źródło (dowód — nie kotwica) |
|---|---|---|---|---|
| 1 | Zalogowany użytkownik nie może się uwierzytelnić lub uwierzytelniony użytkownik traci dostęp do własnych fiszek/kolekcji | Wysoki | Średnie | wywiad Q1; PRD Access Control (model płaski per użytkownik); hot-spot `src/middleware.ts` (2 commity/30d) |
| 2 | Generowanie fiszek przez AI cicho przestaje działać: żądanie wisi bez żadnego timeoutu (spinner w nieskończoność), albo każdy rozróżnialny tryb awarii zwija się do jednego nieinformacyjnego błędu, albo zniekształcone propozycje docierają do UI przeglądu | Wysoki | Średnie | wywiad Q1; PRD US-01/FR-003; roadmap S-02; hot-spot `src/pages/api/` (obszar generate-flashcards.ts). Uwaga: badanie Fazy 2 obaliło założenie o „streamingu" — endpoint jest buforowany (`generateObject`) |
| 3 | Jeden użytkownik odczytuje, edytuje lub usuwa fiszki/dane nauki innego użytkownika (obejście autoryzacji, nie tylko uwierzytelnienia) | Wysoki | Niskie–Średnie | PRD Access Control (model płaski per użytkownik); AGENTS.md Hard Rules (RLS per operacja, per rola); soczewka nadużyć/bezpieczeństwa |
| 4 | Logika harmonogramowania FSRS uszkadza stan powtórek lub pokazuje karty w złej kolejności, a użytkownik traci postęp nauki | Wysoki | Średnie | wywiad Q3 ("wszystko, co nie jest frontendem"); hot-spot `src/components/StudySession.tsx` (4 commity/30d), `src/lib/services/fsrs.ts`, `supabase/migrations` (migracja SM-2→FSRS) |
| 5 | Generowanie przez AI nie ma kontroli kosztów/limitu, więc jeden użytkownik (lub skrypt) może wywołać nieograniczony koszt generowania | Średni | Średnie | PRD Open Question ("Kontrola kosztów generowania"); soczewka nadużyć/bezpieczeństwa (nadużycie zasobów) |
| 6 | Zadanie czyszczenia nieaktywnych kont usuwa dane niewłaściwego użytkownika lub uruchamia się wobec aktywnych kont | Wysoki | Niskie | hot-spot `src/lib/inactive-accounts.ts` + `src/pages/api/admin/cleanup-inactive-accounts.ts` (po 3 commity/30d); PRD Guardrail ("dane fiszek nie mogą być tracone") |

**Rubryka Wpływ × Prawdopodobieństwo** — Wysoki: użytkownik traci
dostęp/dane/pieniądze, a awaria jest publicznie widoczna, lub obszar zmienia
się co tydzień / już spalił zespół. Średni: funkcja degraduje się, istnieje
obejście, lub obszar jest zmieniany okazjonalnie. Niski: kosmetyczne,
łatwo odwracalne lub stabilny/rzadko zmieniany kod.

### Wskazówki Dotyczące Reagowania na Ryzyko

| Ryzyko | Co udowodniłoby ochronę | Należy zakwestionować | Kontekst do ugruntowania przez `/10x-research` | Prawdopodobnie najtańsza warstwa | Anty-wzorzec do uniknięcia |
|------|---|---|---|---|---|
| #1 | Użytkownik z ważną sesją dociera do własnego dashboardu/kolekcji; użytkownik bez niej jest przekierowywany; żadna sesja nigdy nie ujawnia danych innego użytkownika | "Middleware sprawdzony tylko raz przy starcie nadal pasuje do każdej obecnej chronionej trasy" | Punkt wejścia (`middleware.ts`), lista `PROTECTED_ROUTES`, kształt ciasteczka sesji, zachowanie klienta Supabase SSR przy wygaśnięciu | integracyjny (żądanie → odpowiedź na poziomie Workera) | lustro implementacji (asercja dokładnej ścieżki kodu zamiast obserwowalnego wyniku dostępu) |
| #2 | Żądanie generowania zwraca dobrze uformowany zestaw propozycji pytanie/odpowiedź lub czysty, widoczny błąd z rozróżnialną przyczyną — nigdy cichego zawieszenia (żądanie bez timeoutu) ani zniekształconego payloadu docierającego do UI przeglądu | "Happy-path generowania w dev dowodzi, że wszystkie tryby awarii AI SDK są obsłużone — jeden catch-all `500` wystarczy, a brak timeoutu nie jest problemem" | Buforowany kontrakt żądanie/odpowiedź `generateObject`, brak `abortSignal`/timeoutu na każdym poziomie (fetch klienta, `generateObject`, Worker), rozróżnialne kształty błędów dostawcy z `ai` SDK (niezgodność ze schema vs awaria dostawcy vs abort) | integracyjny (mockowanie dostawcy AI na granicy sieci) | nadmierne mockowanie wewnętrznych elementów `ai` SDK tak, że test nie ćwiczy prawdziwej granicy walidacji obiektu; albo asercja obecnego zwijania błędów do jednego `500` jako pożądanego kontraktu bez oznaczenia go jako świadome ryzyko |
| #3 | Żądanie drugiego uwierzytelnionego użytkownika wobec zasobu fiszki/nauki innego użytkownika jest odrzucane (nie cicho puste, nie 200 z cudzymi danymi) | "Polityka RLS istnieje, więc każda ścieżka kodu odpytująca fiszki ją egzekwuje" | Definicje polityk RLS per tabela/operacja, czy jakakolwiek ścieżka zapytania używa klienta service-role omijającego RLS | integracyjny (dwie odrębne uwierzytelnione tożsamości wobec tego samego endpointu) | tylko happy-path (testowanie wyłącznie dostępu właściciela, nigdy przypadku nie-właściciela) |
| #4 | Zakończony przegląd aktualizuje pola harmonogramu właściwej karty, a kolejka najbliższych powtórek to odzwierciedla — powtarzane uruchomienia nigdy nie cofają już zaplanowanej karty | "Poprawność biblioteki `ts-fsrs` implikuje, że nasz endpoint przeglądu poprawnie ją okablowuje" | Kontrakt żądanie/odpowiedź `study/review.ts` i `study/queue.ts`, mapowanie pól FSRS po migracji SM-2→FSRS, gwarancja kolejności zapytania o karty do powtórki | jednostkowy (mapowanie pól FSRS) + integracyjny (pełny przebieg endpointu przeglądu) | skopiowana kalkulacja produkcyjna (asercja dokładnie tego samego wzoru, który liczy kod, zamiast niezależnie wyprowadzonego oczekiwanego harmonogramu) |
| #5 | Powtarzane/szybkie żądania generowania z jednej tożsamości są obserwowalnie ograniczane lub odrzucane po przekroczeniu zdefiniowanego progu, zamiast zawsze się powodzić | "Brak zgłoszonego przekroczenia kosztów do tej pory oznacza, że endpoint jest już bezpieczny w skali" | Czy istnieje dziś jakikolwiek rate-limit/throttle, koszt żądania per wywołanie, punkt wejścia dla nadużycia (nieuwierzytelniony vs. uwierzytelniony) | integracyjny lub ręczny smoke test (jeśli nie ma jeszcze limitera, ta faza może zacząć się jako flaga luki, nie test) | bezsensowna migawka (asercja obecnego nieograniczonego zachowania, jakby to był pożądany kontrakt) |
| #6 | Zadanie czyszczące usuwa wyłącznie konta spełniające dokładny próg nieaktywności, a aktywne konto nigdy nie zostaje dotknięte przy ponownym uruchomieniu | "Zadanie działało dobrze w ręcznym teście raz, więc zapytanie selekcji jest bezpieczne w przypadkach brzegowych (daty graniczne, strefa czasowa, ponowienia)" | Zapytanie selekcji `inactive-accounts.ts`, definicja progu retencji, czy zadanie jest idempotentne przy ponownym uruchomieniu | jednostkowy (przypadki brzegowe zapytania selekcji) — celowo nie integracyjny/e2e zgodnie z negative-space (§7) | krucha kolejność / testowanie efektu ubocznego usuwania end-to-end, gdy użytkownik wyraźnie zdeprioryzował ten obszar |

## 3. Wdrożenie Fazowe

Każdy wiersz to odrębna faza wdrożenia, która otworzy własny folder zmiany
przez `/10x-new`. Status przesuwa się od lewej do prawej przez poniższe
wartości; orchestrator aktualizuje Status w miarę pojawiania się artefaktów
na dysku.

| # | Nazwa fazy | Cel (jedna linia) | Ryzyka objęte | Typy testów | Status | Folder zmiany |
|---|---|---|---|---|---|---|
| 1 | Auth and access-control coverage | Obrona integralności logowania/sesji i izolacji danych per użytkownik na najtańszej warstwie | #1, #3 | integracyjne | complete | `context/changes/auth-access-control-coverage/` |
| 2 | AI generation reliability | Wykrywanie cichych awarii w buforowanym kontrakcie żądania/odpowiedzi generowania: zwijanie każdego trybu awarii do jednego `500` i brak jakiegokolwiek timeoutu | #2, #5 | integracyjne | complete | `context/changes/ai-generation-reliability/` |
| 3 | Study/FSRS scheduling integrity | Obrona poprawności stanu przeglądu i kolejności kart w silnie zmiennym obszarze nauki | #4 | jednostkowe + integracyjne | complete | `context/changes/study-fsrs-scheduling-integrity/` |
| 4 | Account-lifecycle safety net | Ograniczenie logiki selekcji zadania czyszczącego do uzgodnionego zakresu, z poszanowaniem negative-space w §7 | #6 | jednostkowe | complete | `context/changes/account-lifecycle-safety-net/` |
| 5 | Quality-gates wiring | Zablokowanie jednostkowych + integracyjnych jako wymaganej bramy CI na każdym PR | przekrojowe | bramy | complete | `context/changes/quality-gates-wiring/` |

**Słownictwo statusów** (stałe): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

## 4. Stos

Profil bazy testowej: `meaningful`. Runner to **Vitest `^4.1.11`**,
uruchamiany przez `getViteConfig()` z `astro/config` — testy dostają graf
modułów Astro, więc `astro:env/*` i alias `@/*` działają bez dodatkowej
konfiguracji. Suite dzieli się na **dwie warstwy o odrębnych plikach
konfiguracji**:

- **Jednostkowa** — `vitest.config.unit.ts` (`environment: node`, `include:
  tests/lib/**/*.test.ts`, **bez `globalSetup`**). Czysta logika `src/lib/**`
  bez Supabase, bez sieci, bez mocka. Skrypt `npm run test:unit`; biegnie w
  bramie CI (§5). ~59 testów. Wzorzec dodawania: §6.1.
- **Integracyjna** — `vitest.config.ts` (`environment: node`, `include:
  tests/**/*.test.{ts,tsx}`, `globalSetup: tests/setup/global-setup.ts`,
  `testTimeout: 15000`). Wywołania handlerów API wprost + testy komponentów
  (jsdom włączany per-plik). `globalSetup` ładuje `.env.test` przez `dotenv`
  i wymaga lokalnego Supabase — `assertLocalSupabaseUrl()` odrzuca host inny
  niż `127.0.0.1`/`localhost` — oraz seeduje dwóch stałych użytkowników
  testowych. Skrypt `npm run test` (pełna suite; wymaga `npx supabase start`
  + `.env.test`); **local-only**, poza bramą CI. Wzorce: §6.2, §6.4.

Test w `tests/lib/**` jest objęty przez **oba** configi, więc nie może
zależeć od efektów ubocznych `globalSetup`. Suite liczy ~111 testów / 13
plików łącznie — opisuj warstwy, nie totale (totale dryfują co fazę).

| Warstwa | Narzędzie | Wersja | Notatka |
|---|---|---|---|
| jednostkowe | Vitest (`vitest.config.unit.ts`) | `^4.1.11` | `environment: node`, `include: tests/lib/**/*.test.ts`, bez `globalSetup`; skrypt `test:unit`; bez Supabase/mocka; w bramie CI (§5). Wzorzec: §6.1 |
| integracyjne | Vitest (`vitest.config.ts`) | `^4.1.11` | `environment: node`, `include: tests/**/*.test.{ts,tsx}`, `globalSetup: tests/setup/global-setup.ts`, `testTimeout: 15000`; wymaga `npx supabase start` + `.env.test`; local-only. Wzorzec: §6.2 |
| komponentowe | jsdom + `@testing-library/react` + `@testing-library/dom` | `^30.0.1` / `^16.3.3` / `^10.4.1` | Część warstwy integracyjnej (config `vitest.config.ts`); środowisko włączane per-plik przez `// @vitest-environment jsdom`. Wzorzec: §6.4 pkt 8 |
| ładowanie env testów | `dotenv` | `^17.4.2` | Ładuje `.env.test` (`override: true`) w `globalSetup` warstwy integracyjnej |
| mockowanie API (dostawca AI) | seam `@ai-sdk/groq`; `MockLanguageModelV3` z `ai/test` | `@ai-sdk/groq ^3.0.42`, `ai ^6.0.208` | Mockuj **dostawcę** (`vi.mock("@ai-sdk/groq")`), nigdy `ai` — prawdziwa walidacja `Output.object`/zod ma biec. Helper: `tests/helpers/ai-mock.ts`. Wzorzec: §6.4 |
| mockowanie Supabase | brak — prawdziwy lokalny Supabase | — | `msw`/mock HTTP niezainstalowany; testy integracyjne biją w instancję `npx supabase start` |
| e2e | brak — nieuwzględnione w tym wdrożeniu | — | Żadna faza nie zaproponowała e2e; klasyczne + integracyjne pokrycie oceniono jako wystarczające dla skali MVP |
| dostępność | brak — nieuwzględnione w tym wdrożeniu | — | Poza zakresem tego wdrożenia; wrócić, jeśli pojawią się regresje UI |
| (opcjonalnie) natywne dla AI | nieocenione w tym wdrożeniu | n/a | Nie zaproponowano warstwy natywnej dla AI; koszt × sygnał nie uzasadnił jej przy obecnej skali |

**Narzędzia ugruntowania stosu (bieżąca sesja):**
- Dokumentacja: niedostępne w bieżącej sesji — brak MCP dokumentacji/Context7; sprawdzono: 2026-09-10
- Wyszukiwanie: dostępne w bieżącej sesji — `WebSearch` + `WebFetch` użyteczne; sprawdzono: 2026-09-10
- Runtime/przeglądarka: nieużyte — brak narzędzia przeglądarki/Playwright MCP w tej sesji; sprawdzono: 2026-09-10
- Dostawca/platforma: nieużyte — brak MCP GitHub/Cloudflare/Supabase w tej sesji (`gh` CLI z Bash nie jest narzędziem ugruntowania MCP); sprawdzono: 2026-09-10

## 5. Bramy Jakości

| Brama | Gdzie | Wymagana? | Wykrywa |
|---|---|---|---|
| lint (z regułami type-aware) | lokalnie + CI | wymagana, okablowana (krok `npm run lint` w jobie `ci`; check `ci` jest required na `master`) | dryf składniowy/typów — **brak osobnej bramy typecheck**; egzekwowanie typów jest złożone w `lint` (`strictTypeChecked` + `stylisticTypeChecked` + `projectService`). `astro check` nie jest wywoływany nigdzie; `npm run build` nie uruchamia `tsc`. |
| build | CI | wymagana (już okablowana; krok `npm run build` w jobie `ci`) | błędy przerywające build |
| jednostkowe | lokalnie + CI | wymagana, okablowana w CI (§3 Faza 5 — krok `npm run test:unit` w jobie `ci` po `lint` przed `build`; required status check `ci` na `master`) | regresje czystej logiki `tests/lib/**` (59 testów: `fsrs` + `inactive-accounts`) — bez Supabase, przez `vitest.config.unit.ts` |
| integracyjne | lokalnie | local-only — wymaga `npx supabase start`; **nieokablowana w CI w tym wdrożeniu** (§3 „Czego NIE robimy": żywy Supabase + znany flaky `study-review.test.ts` 2.4) | regresje kontraktów endpointów i izolacji danych — uruchom `npx supabase start && npm run test` przed pushem |
| e2e na ścieżkach krytycznych | — | nieplanowana w tym wdrożeniu | — |
| smoke test przed produkcją | — | nieplanowany w tym wdrożeniu | — |

## 6. Wzorce Podręcznika

Jak dodawać nowe testy w tym projekcie. Każda podsekcja jest wypełniana,
gdy odpowiednia faza wdrożenia zostanie zrealizowana; wcześniej podsekcja
zawiera "TBD — patrz §3 Faza N."

### 6.1 Dodawanie testu jednostkowego

Wzorzec ustalony w §3 Faza 3 (`context/changes/study-fsrs-scheduling-integrity/`),
zweryfikowany plikiem `tests/lib/fsrs.test.ts` (22 testy). Warstwa dla czystej
logiki w `src/lib/**` — bez Supabase, bez sieci, bez mocka.

1. **Lokalizacja pliku**: `tests/lib/<moduł>.test.ts`, jeden plik na moduł
   `src/lib` / `src/lib/services` (np. `tests/lib/fsrs.test.ts` dla
   `src/lib/services/fsrs.ts`). Runner: Vitest przez `getViteConfig()`; `include`
   w `vitest.config.ts` już obejmuje `tests/**`. Środowisko `node` (domyślne w
   configu) — nie dodawaj `// @vitest-environment jsdom` do testu modułu logiki.
2. **Import wprost, zero mocka**: importuj testowane funkcje z `@/lib/...` i
   ćwicz je na prawdziwych zależnościach. Jeśli moduł opakowuje bibliotekę
   (`fsrs.ts` → `ts-fsrs`), biblioteka biegnie naprawdę — **nie** `vi.mock`.
3. **Determinizm przez jawne wejście**: przekazuj każdą niedeterministyczną
   wartość (np. `now: Date`) jako argument z ustaloną stałą, nigdy nie polegaj na
   `new Date()` w teście. Dla `ts-fsrs`: `enable_fuzz: false` w konfiguracji
   schedulera ⇒ interwały są w pełni deterministyczne.
4. **Asertuj WŁAŚCIWOŚĆ, którą algorytm gwarantuje z definicji — nie wartość,
   którą liczy nasz kod.** To jest reguła krytyczna tej warstwy (anty-wzorzec §2
   #4: „skopiowana kalkulacja produkcyjna"). Nie odtwarzaj wzoru biblioteki i nie
   uruchamiaj jej ponownie w teście, żeby wyprodukować „oczekiwaną" liczbę.
   Dozwolone asercje to: kierunek zmiany (`stability` rośnie po udanym
   przeglądzie), relacje/monotonia (`again ≤ hard ≤ good ≤ easy`), granulacja
   (interwał jest całkowitą liczbą dni ≥ 1, nie minut), liczności (`repetitions`
   +1 dokładnie, `lapses` +1 przy `again`), nazwy i typy pól wyjściowych
   (`repetitions` nie `reps`; `state` to string-etykieta, nie enum), przynależność
   do zakresu (`difficulty` w `[1, 10]`). Każda z nich łapie błędne okablowanie
   (zamiana pól, zły grade mapping, zła jednostka interwału, zmieniona flaga
   `enable_short_term`) bez replikowania biblioteki.
5. **Ograniczenia konfiguracji ESLint w testach**: `!` (non-null assertion) i
   `x as T` (przy `T` zawężającym null) są **zabronione**. Do zawężenia
   `string | null` z DTO/wiersza użyj małego helpera rzucającego wyjątek
   (`function toMs(iso: string | null): number { if (iso === null) throw ...;
   return new Date(iso).getTime(); }`) zamiast asercji. Pole `elapsed_days` z
   `ts-fsrs` jest `@deprecated` — jeśli test go dotyka, użyj
   `// eslint-disable-next-line @typescript-eslint/no-deprecated` z komentarzem.

**Przykład** (z `tests/lib/fsrs.test.ts` — niezależna asercja jednostki
interwału bez odtwarzania wzoru FSRS):
```ts
const result = scheduleReview(FRESH_ROW, "good", NOW);
// due_date jest o scheduled_days *dni* od now, a nie o scheduled_days *minut*
// (to jest asercja okablowania enable_short_term:false, nie re-kalkulacja):
const daysFromNow = Math.round((toMs(result.due_date) - NOW.getTime()) / 86_400_000);
expect(daysFromNow).toBe(result.scheduled_days);
expect(Number.isInteger(result.scheduled_days)).toBe(true);
expect(result.scheduled_days).toBeGreaterThanOrEqual(1);
```

Uruchomienie: `npx vitest run tests/lib/<moduł>.test.ts` dla pojedynczego pliku
(nie wymaga `npx supabase start`); `npm run test` dla całości.

**Wzorzec przypadków brzegowych „zapytania selekcji"** (ustalony w §3 Faza 4,
`context/changes/account-lifecycle-safety-net/`, zweryfikowany plikiem
`tests/lib/inactive-accounts.test.ts` — 37 testów). Dotyczy czystych
klasyfikatorów w `src/lib/**`, które liczą progi czasowe przez arytmetykę
kalendarzową (`Date#setMonth`) — „zapytanie selekcji" zadania czyszczącego nie
jest zapytaniem SQL, tylko dwiema czystymi funkcjami.

1. **Lokalizacja i uruchomienie**: `tests/lib/<moduł>.test.ts` (jak w §6.1
   powyżej); `npx vitest run tests/lib/inactive-accounts.test.ts`.
2. **Przypięcie strefy czasowej**: `process.env.TZ = "UTC";` jako pierwsza
   instrukcja po importach, z komentarzem. Node 22 re-odczytuje `process.env.TZ`
   przy każdej operacji `Date`, więc klasyfikatory liczące próg przez `setMonth`
   na lokalnych polach `Date` stają się deterministyczne bez `setupFiles` ani
   zmian w `vitest.config.ts`. **To NIE jest zmiana stosu — §4 nie wymaga
   `--refresh` po tej fazie.**
3. **Zamrożony `NOW`** na poziomie modułu (`new Date("2026-06-15T12:00:00.000Z")`
   — środek dnia, środek miesiąca, miesiące docelowe bez poślizgu długości),
   przekazywany jawnie jako ostatni argument do **każdego** wywołania SUT.
4. **Helper konstruujący wejścia, nie re-implementujący SUT**: `monthsBefore(now,
   months, dayShift)` produkuje znacznik ISO cofnięty o miesiące/dni; ułamkowe
   miesiące rozbijaj na całe miesiące + ~30-dniową część (`setMonth` ucina
   ułamek do zera). Helper tylko buduje znacznik — SUT porównuje instanty.
5. **Centralna asercja właściwości — siatka wzajemnej wykluczalności**: dla
   siatki wartości wokół obu granic (`[12, 22, 22.8, 23, 23.5, 24, 24.5, 30]`
   miesięcy) zbuduj krotkę `[isInactiveForDeletion(x), isInWarningWindow(x)]` i
   asertuj: **nigdy oba `true`**, najwyżej jeden `true`. Dla wejść wyraźnie w
   każdej strefie — dokładnie jedno z `{usuń, ostrzeż, żadne}`. Ta grupa łamie
   się przy każdej rozjeździe stałych progów (`DELETION_THRESHOLD_MONTHS` /
   `WARNING_THRESHOLD_MONTHS`) otwierającej lukę lub nakładkę między oknami.
6. **Charakteryzacja fail-closed ≠ świadoma regresja**: gdy klasyfikator celowo
   „w razie wątpliwości usuwa" (`null`/`null` referencja, `NaN` znacznik →
   `isInactiveForDeletion` `true`), oznacz to komentarzem blokowym jawnie jako
   **celowy wybór projektowy** (tu: fix F1) — w odróżnieniu od „świadomej
   regresji" z §6.4 pkt 7, **nie** oczekujemy, że poprawka to odwróci.
7. **Tolerancja arytmetyki kalendarzowej**: grupa „koniec miesiąca / 29 lutego"
   (`NOW` w 31. dniu lub 29 lutego) asertuje wyłącznie kierunek z marginesem
   wielu miesięcy — poślizg `setMonth` ±1–3 dni jest udokumentowany jako
   akceptowany (spójny z tolerancją dzienną cronu self-healing), nigdy
   porównania co do dnia ani re-odtwarzania `setMonth` w asercji.

### 6.2 Dodawanie testu integracyjnego

Wzorzec ustalony w §3 Faza 1 (`context/changes/auth-access-control-coverage/`),
zweryfikowany działającym zestawem 5 plików / 23 testów w `tests/`:

1. **Lokalizacja pliku**: `tests/api/<obszar>.test.ts` dla testów endpointów
   API, `tests/<nazwa>.test.ts` dla testów przekrojowych (np. middleware).
   Runner: Vitest przez `getViteConfig()` (`vitest.config.ts`), żadna
   dodatkowa konfiguracja aliasów/`astro:env` nie jest potrzebna.
2. **Wywołanie handlera bezpośrednio**, bez uruchamiania serwera HTTP:
   importuj eksportowaną funkcję (`GET`/`POST`/`PATCH`/`DELETE`) wprost z
   `src/pages/api/**` i wywołaj ją z fałszywym kontekstem zbudowanym przez
   `buildApiContext({ method, url, headers, body, params, cookies, locals })`
   z `tests/helpers/api-context.ts`. Nie potrzeba `msw`/nasłuchującego portu.
3. **Sesja przez prawdziwe logowanie**: gdy test wymaga uwierzytelnionego
   użytkownika, użyj `signInAsTestUser(TEST_USER_A | TEST_USER_B)` z
   `tests/helpers/test-session.ts` (stałe dane logowania w
   `tests/helpers/test-users.ts`). Zwraca `{ cookieHeader, user }` — przekaż
   `cookieHeader` jako nagłówek `Cookie` żądania ORAZ `user` jako
   `locals.user` kontekstu; oba są wymagane, bo handlery czytają `locals.user`
   do bramkowania 401/404, a warstwa Supabase odpytuje bazę wyłącznie na
   podstawie ciasteczka sesji (nie `locals.user`) — patrz Krytyczne Szczegóły
   Implementacji w planie Fazy 1.
4. **Sprzątanie obowiązkowe**: każdy test, który tworzy dane w tabeli
   dzielonej między plikami testowymi (np. `flashcards`), musi zarejestrować
   utworzone ID i wywołać `cleanupFlashcards(ids)` (klient service-role,
   omija RLS) w `afterEach`, niezależnie od wyniku testu — dwaj stali
   użytkownicy testowi są dzieleni między plikami, więc tabela nie jest
   nigdy zakładana jako pusta na starcie.
5. **Kontrola pozytywna obowiązkowa** przy testowaniu odmowy dostępu: każdy
   plik testujący "nie-właściciel dostaje 404" musi też zawrzeć przypadek
   "właściciel dostaje 200/204" na tym samym zasobie — inaczej test
   udowadnia tylko "B nic nie widzi", nie że mechanizm faktycznie
   rozróżnia właściciela od nie-właściciela.

**Przykład minimalnej asercji** (z `tests/api/flashcards-isolation.test.ts`):
```ts
const context = buildApiContext({
  method: "PATCH",
  url: `http://localhost/api/flashcards/${flashcardId}`,
  headers: { "Content-Type": "application/json", Cookie: sessionB.cookieHeader },
  body: JSON.stringify({ question: "Hijacked by B" }),
  params: { id: flashcardId },
  locals: { user: sessionB.user },
});
const response = await flashcardPatch(context);
expect(response.status).toBe(404); // non-owner: indistinguishable from "not found"
```

6. **Scenariusze mutacji stanu współdzielonego** (ustalone w §3 Faza 3,
   `tests/api/study-review.test.ts`): gdy test nie tylko tworzy wiersz, ale
   wielokrotnie go modyfikuje (np. kilka `POST /api/study/review` na tej samej
   karcie), obowiązują dodatkowe reguły. Rejestruj utworzone `id` do `createdIds`
   **natychmiast po `201`** — przed jakąkolwiek asercją mutacji — żeby `afterEach`
   / `cleanupFlashcards` posprzątał nawet gdy asercja w środku testu rzuci.
   Wszystkie asercje wyłącznie **id-scoped** (`rows.find((r) => r.id === id)`,
   `new Set(returned).…`), nigdy „tabela ma N wierszy" — `fileParallelism` nie jest
   wyłączone, a stali użytkownicy są dzieleni między pliki. Do wymuszenia
   równoległości (test lost-update / CAS) użyj `Promise.all([review(id, …),
   review(id, …)])` i sortuj statusy przed asercją (`[200, 409]`).

Uruchomienie: `npx supabase start` (raz), następnie `npm run test` (lub
`npx vitest run <plik>` dla pojedynczego pliku). Pełny przebieg od zera:
`npx supabase db reset && npm run test`.

### 6.3 Dodawanie testu e2e
- Nieuwzględnione w tym wdrożeniu — patrz §4.

### 6.4 Dodawanie testu dla nowego endpointu API opartego na AI

Wzorzec ustalony w §3 Faza 2 (`context/changes/ai-generation-reliability/`),
zweryfikowany plikami `tests/api/generate-flashcards*.test.ts` i
`tests/components/FlashcardGenerator.test.tsx`. Endpoint generowania ma
**buforowany kontrakt żądanie/odpowiedź**: `generateObject` zwraca jeden obiekt,
handler serializuje go jako jedno ciało JSON.

1. **Lokalizacja pliku**: `tests/api/<obszar>.test.ts` dla głównego kontraktu.
   Osobny plik na każdą sytuację wymagającą mocka na poziomie ewaluacji modułu:
   `<obszar>-config.test.ts` (bramka `astro:env/server`), `<obszar>-rate.test.ts`
   (migawka braku rate-limitu, Ryzyko #5).
2. **Granica mocka = dostawca, nie `ai`**: `vi.mock("@ai-sdk/groq", () => ({ createGroq: () => () => groqRef.model }))`
   z mutowalną referencją `const groqRef = vi.hoisted(() => ({ model: undefined }))`
   przełączaną per test. Mockując **tylko** dostawcę, prawdziwe `generateObject`
   z `ai` nadal biegnie i wykonuje prawdziwą walidację zod — zły kształt daje
   prawdziwy `NoObjectGeneratedError`. NIGDY nie mockuj `ai`/`generateObject`
   (anty-wzorzec §2 #2: test nie ćwiczyłby granicy walidacji obiektu).
3. **Builder mocka**: `tests/helpers/ai-mock.ts` — `buildMockModel({ text | error | hang })`
   buduje `MockLanguageModelV3` z `ai/test` w trybie sukces / rzuca / wisi;
   `flashcardsJson(n)` serializuje N poprawnych par; `makeApiCallError({ statusCode, isRetryable })`
   i `makeAbortError()` to cienkie wrappery konstruktorów błędów AI SDK.
4. **Bramka konfiguracji**: `vi.mock("astro:env/server", () => ({ GROQ_API_KEY: undefined }))`
   na górze **dedykowanego** pliku — mock musi obowiązywać w momencie ewaluacji
   modułu endpointu (endpoint importuje z tego modułu tylko `GROQ_API_KEY`).
5. **Brak Supabase**: endpoint generowania czyta wyłącznie `context.locals.user` —
   nie odpytuje bazy. Użyj fałszywego `locals: { user: { id: "00000000-…" } as User }`,
   bez `signInAsTestUser`, bez `cleanupFlashcards`.
6. **Brak bariery czasowej**: `buildMockModel({ hang: true })` + `vi.useFakeTimers()`
   w `beforeEach` / `vi.useRealTimers()` w `afterEach` (izolowane do jednego
   `describe`), potem `vi.advanceTimersByTimeAsync(600_000)` i asercja przez
   `Promise.race` z natychmiastowym sentinelem, że handler wciąż wisi.
7. **Konwencja „świadoma regresja"**: każdy test utrwalający obecne (niepożądane)
   zachowanie — zwijanie wszystkich trybów awarii do jednego `500`, brak timeoutu,
   nieograniczony kontrakt — ma w nazwie i komentarzu blokowym jawne
   „**dokumentujemy** obecne zachowanie jako znane ryzyko, **nie wymagamy** go";
   test jest zaprojektowany tak, by **złamał się**, gdy poprawka wejdzie.
8. **Test komponentu przeglądu**: `tests/components/<Nazwa>.test.tsx`, pierwsza
   linia `// @vitest-environment jsdom`; `render(...)` z `@testing-library/react`;
   `vi.stubGlobal("fetch", vi.fn())` przywracane w `afterEach` (+ `cleanup()`).

Uruchomienie: `npx vitest run <plik>` dla pojedynczego pliku; `npm run test`
dla całości (testy AI nie wymagają Supabase, ale reszta zestawu tak).

### 6.5 Dodawanie testu dla nowej tabeli wspieranej przez Supabase RLS
- TBD — patrz §3 Faza 1 dla wzorca sprawdzania własności dwóch tożsamości.

### 6.6 Notatki per faza wdrożenia
(Wypełniane w miarę realizacji faz.)

**Faza 1 — Auth and access-control coverage.** Zob. §6.2 (wzorzec testu
integracyjnego) i §6.5. Zestaw: `tests/api/*` + `tests/middleware.test.ts`.

**Faza 2 — AI generation reliability.** Zob. §6.4. Dostarczono:
- `tests/helpers/ai-mock.ts` — reużywalny builder `MockLanguageModelV3` + seam
  `@ai-sdk/groq`.
- `tests/api/generate-flashcards.test.ts` — kontrakt żądanie/odpowiedź (2.1
  kontrola pozytywna), zwijanie niezgodności ze schematem (2.2), awarii dostawcy
  (2.3, retry 3× vs 1×), abortu (2.4), bariera walidacji wejścia (2.5), brak
  bariery czasowej po stronie serwera (3.1, fake timers).
- `tests/api/generate-flashcards-config.test.ts` — bramka `!GROQ_API_KEY` →
  `500 {"error":"AI service not configured"}` (jedyny `500` z rozróżnialnym
  ciałem); `vi.mock("astro:env/server")` na poziomie modułu.
- `tests/api/generate-flashcards-rate.test.ts` — świadoma migawka MVP Ryzyka #5:
  5 kolejnych + 3 współbieżne żądania z jednej tożsamości → wszystkie `200`,
  zero rate-limitu. Test ma się **złamać** przy wprowadzeniu limitera.
- `tests/components/FlashcardGenerator.test.tsx` — warstwa komponentu (jsdom):
  kontrola pozytywna (5.1), degradacja do panelu błędu przy braku klucza
  `flashcards` (5.2), miękkie zawieszenie przy pustej tablicy (5.3), spinner
  bez anulowania przy zawieszonym `fetch` (5.4).
- Konwencja „labeled regression" (2.2–2.4, 3.1, 4.1, 5.2–5.4): komentarz blokowy
  + nazwa testu mówią „dokumentujemy, nie wymagamy"; poprawka złamie test celowo.
- **Flaga dla §4 „Stos"**: ta faza wprowadziła warstwę testów komponentu
  (`jsdom`, `@testing-library/react`, `@testing-library/dom` jako `devDependencies`)
  oraz poszerzyła `vitest.config.ts` `include` o `.tsx` (`tests/**/*.test.{ts,tsx}`).
  To jest zmiana stosu testowego poza zamrożoną §4 — **§4 wymaga
  `/10x-test-plan --refresh`**, by odnotować jsdom/RTL w tabeli stosu.

**Faza 3 — Study/FSRS scheduling integrity (Ryzyko #4).** Zob. §6.1 (warstwa
jednostkowa) i §6.2 (warstwa integracyjna, w tym pkt 6 — mutacja stanu
współdzielonego). Prawdziwy `ts-fsrs` biegnie w każdej warstwie — scheduler nie
jest mockowany; oczekiwany harmonogram to niezależnie wyprowadzone właściwości
(kierunek, relacje, przynależność), nigdy re-uruchomienie `scheduler.next` w
teście (anty-wzorzec §2 #4). Dostarczono:
- `tests/lib/fsrs.test.ts` (§6.1) — okablowanie `src/lib/services/fsrs.ts`:
  mapowanie pól (`reps` ⟷ `repetitions`, enum stanu ⟷ etykieta DB), grade mapping,
  granulacja dzienna (`enable_short_term: false`), monotonia
  `again ≤ hard ≤ good ≤ easy`, `repetitions` +1 dokładnie, `lapses` +1 przy
  `again`, `stability` rośnie przy `good`/`easy` na `Review`, `flashcardToCardInput`
  (`NULL due_date` → `now`, stałe `elapsed_days`/`learning_steps`, `last_review:
  null` → `undefined`).
- `tests/api/study-review.test.ts` (§6.2) — round-trip `POST /api/study/review`
  + odbicie w `GET /api/study/queue`:
  - 2.1 kontrola pozytywna — przegląd utrwala pola harmonogramu właściwej karty
    (potwierdzone ponownym `GET queue`).
  - 2.2 zaplanowana karta opuszcza `mode=due`, pozostaje w `mode=all`.
  - 2.3 **(świadoma regresja §D.2)** — sekwencyjny replay zakończonego przeglądu
    re-graduje kartę: `200` (nie 4xx), `lapses` +1, `due_date` cofnięte. Złamie
    się, gdy endpoint dostanie kontrolę idempotencji / `due_date > now`.
  - 2.4 kontrola pozytywna §D.1 — równoległy double-submit (`Promise.all`) →
    `[200, 409]`, jeden przegląd zastosowany (CAS na `last_review` działa).
  - 2.5 **(świadoma regresja F5)** — `GET /api/study/queue` bez `.order()`:
    asercja tylko przynależności zbioru, brak asercji kolejności. Złamie się, gdy
    dojdzie deterministyczne sortowanie + paginacja.
  - 2.6 szybkie guardy — `404` na nieznany UUID, `422` na złą ocenę.
- `tests/components/StudySession.test.tsx` (jsdom, `// @vitest-environment jsdom`,
  wzorzec z §6.4 pkt 8) — kliencka połowa Ryzyka #4 dla najgorętszego pliku
  obszaru; `fetch` stubowany (routing po URL na `/api/study/queue` +
  `/api/study/review`), scheduler nie biegnie:
  - 3.1 kontrola pozytywna — pojedyncze kliknięcie oceny: dokładnie jeden `POST`,
    przejście do następnej karty, brak bannera błędu.
  - 3.2 **(świadoma regresja §E.1)** — dwa kliknięcia w jednym ticku (natywny
    `dispatchEvent` w jednym `act`, nie dwa `fireEvent`): oba przechodzą guard i
    strzelają `POST`, drugie dostaje `409` → fałszywy banner błędu na już-następnej
    karcie. Złamie się, gdy `handleRate` dostanie synchroniczny guard (`useRef`
    ustawiany przed pierwszym `await`).
  - 3.3 kontrola pozytywna — banner po `500` znika po udanym ponowieniu oceny
    (mechanizm bannera działa — kontrast z fałszywym bannerem w 3.2).

**Flaga dla §4 „Stos" (rozszerzenie).** Poza jsdom/RTL (odnotowane w „Faza 2"
powyżej) §3 Faza 3 dodała katalog `tests/lib/` — warstwę testów jednostkowych
czystej logiki `src/lib/**` (§6.1), środowisko `node`, bez Supabase/mocka. To
kolejna zmiana poza zamrożoną §4; **§4 nadal wymaga `/10x-test-plan --refresh`**
(ta faza tego nie uruchamia).

**Faza 4 — Account-lifecycle safety net (Ryzyko #6).** Zob. §6.1 (warstwa
jednostkowa, w tym wzorzec przypadków brzegowych „zapytania selekcji"). Zestaw:
`tests/lib/inactive-accounts.test.ts` (37 testów, osiem grup `describe`) — czyste
klasyfikatory `isInactiveForDeletion` / `isInWarningWindow` z
`src/lib/inactive-accounts.ts` biegną bez mocka, `now` wstrzykiwany, `TZ=UTC`
przypięte w pliku. Pokryte: kontrola pozytywna (aktywne konto), kierunek i
granica 24 mies. (należy do „usuń"), półotwarte okno ostrzeżeń `(24, 23]`,
**siatka wzajemnej wykluczalności** (centralna asercja — nigdy oba klasyfikatory
`true`; łamie się przy rozjeździe stałych progów), symetria fallbacku
`created_at`, charakteryzacja fail-closed (F1 — celowy wybór, **nie** świadoma
regresja), tolerancja arytmetyki kalendarzowej (koniec miesiąca / 29 lutego),
idempotencja przy ponownym wywołaniu.

- **Endpoint `src/pages/api/admin/cleanup-inactive-accounts.ts` pozostaje bez
  testu celowo** — pętla `listUsers`, `deleteUser`, `signInWithOtp`, gałąź
  `dryRun` i efekt uboczny usuwania end-to-end są jawnie w §7 negative-space
  (wywiad Fazy 2, Q5).
- **Luka cyklu życia markera `retention_warning_sent_at`** (marker nigdy nie
  czyszczony przy logowaniu → drugie ostrzeżenie stłumione po ponownej
  nieaktywności) jest odnotowana jako kandydat na osobny `/10x-new` (naprawa
  produkcyjna w endpointcie), **nie jako test** — leży poza czystą funkcją.
- **§4 „Stos" NIE wymaga `--refresh` po tej fazie** — Faza 4 nie dodała narzędzi,
  `devDependencies` ani `setupFiles`; przypięcie strefy to jedna linia w pliku
  testowym.

**Faza 5 — Quality-gates wiring (przekrojowe).** Zob. §5 (tabela bram). Faza nie
dodała nowego kodu testowego — przepakowała istniejące 59 testów jednostkowych i
okablowała bramę CI. Dostarczono:
- `vitest.config.unit.ts` + skrypt `test:unit`
  (`vitest run --config vitest.config.unit.ts`) — zakres `tests/lib/**/*.test.ts`,
  **bez `globalSetup`**, `environment: node`. Biegnie 59 testów (`fsrs` 22 +
  `inactive-accounts` 37) w ~kilka sekund bez `.env.test` i bez działającego
  Supabase. Oryginalny `vitest.config.ts` (z `globalSetup`) nietknięty — `npm run
  test` nadal odpala pełny zestaw.
- Krok `- run: npm run test:unit` w `.github/workflows/ci.yml` jobie `ci`, między
  `npm run lint` a `npm run build` (najtańszy sygnał pierwszy). `node-version`
  wyrównane `22` → `22.14.0` (zgodnie z `.nvmrc`).
- Check `ci` ustawiony jako **required status check** na regule ochrony gałęzi
  `master` (`required_status_checks.contexts: ["ci"]`, `strict: true`,
  `enforce_admins: false`) — PR z czerwonym lintem lub czerwonym testem
  jednostkowym nie może zostać zmergowany. `enforce_admins: false` (nie `true`,
  wbrew pierwotnej rekomendacji planu): repo prowadzi solo-dev workflow z
  commitami prosto na `master` (cały łańcuch `/10x-implement`), a
  `enforce_admins: true` blokowałby każdy bezpośredni push (wymuszałby PR na
  każdy commit dokumentacyjny). Brama i tak egzekwuje cel Fazy 5 — czerwony `ci`
  blokuje **merge PR-a** (potwierdzone testowym PR #8); admin zachowuje
  bezpośredni push na `master` z ostrzeżeniem „Bypassed rule violations".
- **Repo przełączone na public** (`gh repo edit --visibility public`): branch
  protection i rulesets są niedostępne na prywatnym repo w darmowym planie
  GitHub (HTTP 403 „Upgrade to GitHub Pro"). Bez tego przełączenia bramy nie
  dałoby się uczynić wymaganą. Tylko `.env.example` / `.env.test.example` są
  śledzone; `.env` / `.dev.vars` / `.env.test` nigdy nie były commitowane.
- Migracja `generateObject` → `generateText` + `Output.object` w
  `src/pages/api/generate-flashcards.ts` (zdjęcie `@typescript-eslint/no-deprecated`
  bez `eslint-disable`) + wyzerowanie pre-istniejącego długu lintu (49→0:
  `lint:fix` dla 46 formatowań, dwa martwe null-guardy w
  `cleanup-inactive-accounts.ts`).

**Flaga dla §4 „Stos" (rozszerzenie).** Faza 5 dodała drugi plik konfiguracji
Vitest (`vitest.config.unit.ts`) obok istniejącego `vitest.config.ts`. To kolejna
zmiana stosu testowego poza zamrożoną §4 do odnotowania przy `/10x-test-plan
--refresh` (razem z jsdom/RTL z Faz 2–3 i katalogiem `tests/lib/`); ta faza
`--refresh` nie uruchamia.

**Wzorzec „jak działa brama CI w tym projekcie".** Job `ci`
(`.github/workflows/ci.yml`) biegnie `lint → test:unit → build` na każdym `push`
i `pull_request` do `master`. `ci` jest **wymaganym** checkiem na `master` —
czerwony lint lub czerwony test jednostkowy blokuje przycisk merge PR. Nazwa
checku to `ci` (nazwa joba), bo `test:unit` jest **krokiem** joba `ci`, nie
osobnym jobem; jeśli job kiedyś zostanie przemianowany lub rozdzielony, branch
protection trzeba zaktualizować w tym samym kroku, inaczej czeka na nieistniejącą
nazwę i blokuje wszystkie merge. Testy integracyjne/komponentowe **NIE** są w CI
(wymagają `npx supabase start`) — uruchom je lokalnie
(`npx supabase start && npm run test`) przed pushem. Brama blokuje **merge**, nie
deploy: Cloudflare Pages deployuje preview czerwonej gałęzi PR niezależnie od
GitHub Actions; produkcja i tak zawsze dostaje tylko to, co zmergowane.

Znany flaky `tests/api/study-review.test.ts` 2.4 (warstwa integracyjna) **nie
blokuje** — integracja nie jest w bramie CI. Jest follow-upem na zmianie
study-fsrs (rekomendacja: asercja inwariantu „brak lost update" lub test wyścigu
na warstwie DB), nie w zakresie Fazy 5.

**Dług lintu blokujący §3 Faza 5 — ZAMKNIĘTE (2026-09-10).** Na 2026-09-09
`npm run lint` był **czerwony** (49 błędów) z powodu pre-istniejących naruszeń w
plikach spoza zakresu testowego (`src/components/AccountDeletion.tsx`,
`src/components/ui/checkbox.tsx`, `src/components/ui/dialog.tsx`,
`src/lib/inactive-accounts.ts`, `src/pages/api/admin/cleanup-inactive-accounts.ts`,
`src/pages/api/generate-flashcards.ts`). Wyzerowany w §3 Faza 5 (46 przez
`npm run lint:fix`, 3 ręczne fixy bez `eslint-disable`) — `npm run lint` → 0.
Śledzone było w
`context/changes/study-fsrs-scheduling-integrity/follow-ups/review-fixes.md` (F1).

## 7. Czego Celowo Nie Testujemy

Wyłączenia uzgodnione podczas wdrożenia (wywiad Fazy 2, Q5). Przyszli
współtwórcy powinni je respektować, chyba że leżące u ich podstaw
założenie się zmieni.

- **Zachowanie usuwania end-to-end zadania czyszczenia kont nieaktywnych przez 2 lata** — użytkownik wyraźnie zdeprioryzował budżet testowy w tym obszarze; tylko logika przypadków brzegowych zapytania selekcji jest objęta na poziomie jednostkowym (§3 Faza 4), nie pełny efekt uboczny usuwania. Ponownie ocenić, jeśli próg retencji się zmieni lub wystąpi incydent utraty danych. (Źródło: wywiad Fazy 2, Q5.)

## 8. Rejestr Aktualności

- Strategia (§1–§5) ostatnio przejrzana: 2026-08-09
- Wersje stosu ostatnio zweryfikowane: 2026-08-09
- Referencje narzędzi natywnych dla AI ostatnio zweryfikowane: 2026-08-09 (żadna nie zaproponowana w tym wdrożeniu)

Odśwież (`/10x-test-plan --refresh`), gdy:

- pojawi się nowe ryzyko z top-3 z mapy drogowej lub archiwum,
- data `sprawdzono:` rekomendowanego narzędzia jest starsza niż trzy miesiące,
- zmieni się stos technologiczny projektu (nowy framework, nowy runner testów),
- negative-space z §7 przestanie odpowiadać temu, w co wierzy zespół.
