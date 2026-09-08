# Plan implementacji: Pokrycie testami dostępu/autoryzacji (Faza 1 wdrożenia testów)

## Przegląd

Wdrażamy od zera pełną infrastrukturę testową (Vitest zintegrowany z Astro 6 +
Cloudflare Workers) oraz pierwszy zestaw testów integracyjnych projektu,
pokrywających Ryzyko #1 (integralność sesji/middleware) i Ryzyko #3 (izolacja
danych między użytkownikami — RLS + filtr aplikacyjny) z
`context/foundation/test-plan.md` §3 Faza 1. Dziś w repozytorium nie istnieje
żaden runner testów ani plik `*.test.*` — ta faza jest zarówno pierwszym
testem, jak i fundamentem, na którym oprą się kolejne fazy wdrożenia (#2–#5).

## Analiza stanu obecnego

- Middleware (`src/middleware.ts:4,18-21`) chroni WYŁĄCZNIE trzy prefiksy stron
  (`/dashboard`, `/study`, `/settings`) przez dopasowanie prefiksu ścieżki —
  nie chroni żadnego endpointu `/api/*`. Każdy endpoint API sam odpowiada za
  sprawdzenie `context.locals.user` (np. `src/pages/api/flashcards.ts:13,43`,
  `src/pages/api/flashcards/[id].ts:17,74`, `src/pages/api/study/queue.ts:13`,
  `src/pages/api/study/review.ts:19`, `src/pages/api/generate-flashcards.ts:24`,
  `src/pages/api/account.ts:8`).
- Izolacja danych jest wymuszona podwójnie: politykami RLS na tabeli
  `flashcards` per operację (`supabase/migrations/20260610000000_create_flashcards.sql:31-46`,
  wszystkie ograniczone do `auth.uid() = user_id`) ORAZ jawnym filtrem
  `.eq("user_id", user.id)` w każdym zapytaniu aplikacyjnym.
- `src/lib/supabase.ts:3-20` buduje klienta SSR Supabase przez
  `@supabase/ssr`'s `createServerClient`, czytając ciasteczka z surowego
  nagłówka `Cookie` (`parseCookieHeader`) i zapisując je przez callback
  `setAll()` przekazywany do `cookies.set()`. To jedyny miejsce, gdzie
  powstaje/odświeża się sesja — testy integracyjne muszą przejść przez ten sam
  mechanizm, by były wiarygodne.
- `src/pages/api/auth/signin.ts:9-17` loguje przez
  `supabase.auth.signInWithPassword()` na kliencie zbudowanym `createClient()`
  — to jest jedyny w pełni zgodny z produkcją sposób uzyskania prawdziwych,
  poprawnie zakodowanych ciasteczek sesji do testów (patrz Krytyczne Szczegóły
  Implementacji).
- Zero plików testowych, zero konfiguracji Vitest/Jest, zero skryptu `test` w
  `package.json` — potwierdzony profil bazy testowej `none` z §4 test-plan.md.
- Stos: Astro 6 (`output: "server"`), adapter Cloudflare Workers, TypeScript
  strict, alias ścieżek `@/*` → `./src/*`, `astro:env/server` do zmiennych
  środowiskowych (`astro.config.mjs:22-31`).

## Pożądany stan końcowy

Po zakończeniu tej fazy:

- `npm run test` uruchamia Vitest i wykonuje pełny zestaw testów integracyjnych
  wobec lokalnego Supabase (`npx supabase start` musi być uruchomiony).
- Middleware, bramkowanie API i izolacja danych między dwoma niezależnymi
  użytkownikami testowymi są pokryte testami, które faktycznie przechodzą
  przez prawdziwą bazę danych i polityki RLS — nie przez atrapy.
- `context/foundation/test-plan.md` §6.2 zawiera prawdziwy, odtwarzalny wzorzec
  dodawania kolejnego testu integracyjnego API, zamiast wpisu "TBD".
- §3 Faza 1 w `test-plan.md` jest gotowa do oznaczenia jako `complete` po
  wykonaniu wszystkich kroków.

### Kluczowe odkrycia:

- `context.locals.user` służy WYŁĄCZNIE do bramkowania 401 w endpointach — nie
  wpływa na to, jako kto Supabase wykona zapytanie SQL. To zapytanie zależy
  wyłącznie od sesji zaszytej w nagłówku `Cookie`, budowanej przez
  `createClient()` (`src/lib/supabase.ts:3-20`). Test, który ustawia
  `locals.user = userA`, ale wysyła żądanie bez poprawnego ciasteczka sesji
  userA, w rzeczywistości wykona zapytanie jako rola `anon` — RLS zablokuje
  WSZYSTKIE wiersze, nie tylko cudze, co dałoby fałszywie pozytywny wynik
  testu izolacji. Każdy test Fazy 3 musi więc nieść prawdziwe ciasteczko
  sesji, nie tylko fałszywy `locals.user`.
- Surowy `INSERT INTO auth.users` (typowy wzorzec `supabase/seed.sql`) tworzy
  użytkownika, który **nie może się zalogować** — Supabase wymaga
  `encrypted_password` w formacie zgodnym z GoTrue i traktuje to jako
  niewspierane obejście. Oficjalnie rekomendowany sposób tworzenia
  użytkowników zdolnych do logowania to Admin API
  (`supabase.auth.admin.createUser()`). Realizujemy więc "seedowanie" jako
  idempotentny skrypt Node wywoływany przez `globalSetup` Vitest, a nie jako
  plik `.sql` — patrz Krytyczne Szczegóły Implementacji.

## Czego NIE robimy

- Nie dodajemy testów e2e ani narzędzi wizualnych (poza zakresem całego
  wdrożenia — patrz §4 test-plan.md).
- Nie testujemy Ryzyka #6 (czyszczenie nieaktywnych kont) ani ścieżki
  service-role (`createAdminClient()` poza tworzeniem/usuwaniem użytkowników
  testowych) — to Faza 4 wdrożenia.
- Nie naprawiamy zachowania aplikacji. Jeśli test odkryje istniejące, celowe
  (choć dyskusyjne) zachowanie — jak dopasowanie prefiksu w middleware czy
  połykanie błędów w `signout.ts` — zapisujemy je jako test regresyjny
  blokujący obecny kontrakt, a nie zmieniamy kod produkcyjny.
- Nie wpinamy testów do `.github/workflows/ci.yml` w tej fazie — to zadanie
  §3 Faza 5 "Quality-gates wiring". Ta faza dodaje wyłącznie lokalny skrypt
  `npm run test`.
- Nie tworzymy dedykowanego testu "RLS-only" obchodzącego filtr aplikacyjny
  (`.eq("user_id", ...)`). Świadomie ograniczamy się do testów na poziomie
  endpointu — patrz Otwarte Ryzyka i Założenia.

## Podejście do implementacji

Cztery fazy w kolejności koszt × sygnał: najpierw infrastruktura (bez niej
nic innego nie może powstać), potem najtańsza warstwa o wysokim sygnale
(middleware + bramkowanie 401 — czyste funkcje/fałszywe konteksty, bez
zależności od danych), na końcu najdroższa warstwa (prawdziwe dane z dwoma
użytkownikami i realną bazą), zamykane utrwaleniem wzorca w podręczniku.

## Krytyczne szczegóły implementacji

- **Odtwarzanie sesji przez prawdziwe logowanie, nie ręczne ciasteczka.**
  `@supabase/ssr` koduje sesję w ciasteczkach we własnym, wewnętrznym
  formacie (możliwe dzielenie na kilka ciasteczek `sb-<ref>-auth-token.N`).
  Ręczne odtworzenie tego formatu w teście byłoby kruche i związane z wersją
  pakietu. Zamiast tego helper logowania buduje klienta SSR **tą samą
  fabryką `createClient()` co produkcja**, z fałszywym obiektem ciasteczek,
  którego `.set()` zapisuje przekazane pary `name/value/options` do mapy w
  pamięci. Wywołanie `supabase.auth.signInWithPassword()` na tym kliencie
  uruchamia dokładnie ten sam wewnętrzny mechanizm zapisu ciasteczek co w
  produkcji — helper odczytuje z mapy gotowy, poprawnie zakodowany nagłówek
  `Cookie: name1=value1; name2=value2` do użycia w kolejnych żądaniach "jako
  ten użytkownik". Zero wiedzy o wewnętrznym formacie tokenu nie jest
  potrzebne.
- **`globalSetup` Vitest działa poza grafem modułów Vite/Astro.** Skrypt
  `tests/setup/global-setup.ts` nie może polegać na `astro:env/server` (ten
  wirtualny moduł istnieje tylko wewnątrz przetworzonego przez Vite kodu
  aplikacji). Musi jawnie wczytać `.env.test` przez `dotenv.config({ path:
  ".env.test" })` i czytać `process.env.SUPABASE_URL` /
  `process.env.SUPABASE_SERVICE_ROLE_KEY` bezpośrednio.
- **Tworzenie użytkowników testowych jest idempotentne.** Skrypt najpierw
  próbuje `admin.auth.admin.createUser({ email, password, email_confirm:
  true })`; jeśli Supabase zwróci błąd "already registered" / kod
  `email_exists`, traktuje to jako sukces (użytkownik już istnieje z
  poprzedniego przebiegu) zamiast przerywać cały przebieg testów.
- **Dwaj stali użytkownicy są dzieleni między plikami testowymi** (decyzja
  użytkownika: szybkość > pełna izolacja). Aby zapobiec przeciekaniu danych
  między testami, każdy test, który tworzy fiszkę, **musi** zarejestrować jej
  `id` i usunąć ją w bloku `afterEach`/`afterAll` przez klienta
  serwisowego (`createAdminClient()`-owy odpowiednik w `tests/helpers/`).
  Testy nie mogą zakładać, że tabela `flashcards` jest pusta na starcie —
  muszą filtrować/asertować po własnych utworzonych rekordach, nie po
  globalnym stanie tabeli.

## Faza 1: Infrastruktura testowa

### Przegląd

Instalacja Vitest zintegrowanego z konfiguracją Astro/Vite, środowisko
zmiennych testowych wskazujące na lokalny Supabase, oraz helpery
wielokrotnego użytku (fałszywy `APIContext`, logowanie z odtwarzaniem
ciasteczek, sprzątanie danych), na których oprą się Fazy 2–3.

### Wymagane zmiany:

#### 1. Zależności i skrypty

**Plik**: `package.json`

**Cel**: Dodać `vitest` jako `devDependency` oraz skrypty `test` (`vitest
run`, jednorazowe uruchomienie — używane lokalnie i w przyszłej bramie CI z
Fazy 5) i `test:watch` (`vitest`, tryb deweloperski).

**Kontrakt**: Nowe wpisy w `devDependencies` i `scripts`; brak zmian w
istniejących skryptach.

#### 2. Konfiguracja Vitest

**Plik**: `vitest.config.ts` (nowy, katalog główny repo)

**Cel**: Zintegrować Vitest z konfiguracją Vite/Astro, by `astro:env/server`
i alias `@/*` działały identycznie jak w aplikacji.

**Kontrakt**: Eksport domyślny `getViteConfig({ test: { environment: "node",
include: ["tests/**/*.test.ts"], globalSetup: ["tests/setup/global-setup.ts"],
testTimeout: 15000 } })` z `astro/config` — zgodnie z oficjalnym wzorcem
Astro dla Vitest (`getViteConfig` rozwiązuje pełną konfigurację Astro/Vite i
scala ją z konfiguracją testów, więc wirtualne moduły takie jak
`astro:env/server` rozwiązują się poprawnie bez dodatkowych aliasów).

#### 3. Zmienne środowiskowe testowe

**Pliki**: `.env.test` (nowy, **gitignored**), `.env.test.example` (nowy,
commitowany), `.gitignore` (edycja)

**Cel**: Dostarczyć `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
wskazujące na instancję uruchomioną przez `npx supabase start` (domyślnie
`http://127.0.0.1:54321` — `supabase/config.toml:11`). `.env.test.example`
dokumentuje, że wartości klucza anon/service_role należy skopiować z wyjścia
`npx supabase status`.

**Kontrakt**: Dodać `.env.test` do `.gitignore` obok istniejącego `.env`.
Zmienne czytane zarówno przez aplikację (poprzez `astro:env/server` w
plikach testowych transformowanych przez Vite, które automatycznie ładuje
`.env.test` w trybie `test`) jak i przez `global-setup.ts` (jawny `dotenv`,
patrz Krytyczne Szczegóły Implementacji).

#### 4. Stali użytkownicy testowi — stałe

**Plik**: `tests/helpers/test-users.ts` (nowy)

**Cel**: Zdefiniować stałe dane logowania dwóch niezależnych, stałych
użytkowników testowych (`TEST_USER_A`, `TEST_USER_B`: e-mail + hasło),
używane przez `global-setup.ts` do utworzenia kont i przez testy do
logowania.

**Kontrakt**: Eksportuje dwa obiekty `{ email: string; password: string }`
ze stałymi, deterministycznymi wartościami (np. `test-user-a@10x-cards.test`)
— nigdy nie generowane losowo, by dwa uruchomienia testów odwoływały się do
tych samych, znanych kont.

#### 5. Globalne utworzenie użytkowników testowych

**Plik**: `tests/setup/global-setup.ts` (nowy)

**Cel**: Uruchamiane raz przed całym przebiegiem Vitest (`globalSetup`).
Tworzy `TEST_USER_A` i `TEST_USER_B` przez Admin API, jeśli jeszcze nie
istnieją.

**Kontrakt**: Eksportuje funkcję domyślną (sygnatura zgodna z kontraktem
`globalSetup` Vitest: `async () => { ... }`, opcjonalnie zwraca funkcję
teardown). W środku: `dotenv.config({ path: ".env.test" })`, budowa klienta
service-role (`createClient` z `@supabase/supabase-js`, analogicznie do
`src/lib/supabase-admin.ts`, ale czytając `process.env` zamiast
`astro:env/server`), próba `admin.auth.admin.createUser(...)` dla obu
użytkowników z obsługą "już istnieje" jako sukcesu (patrz Krytyczne
Szczegóły Implementacji).

#### 6. Fałszywy `APIContext` i przechwytujący magazyn ciasteczek

**Plik**: `tests/helpers/api-context.ts` (nowy)

**Cel**: Zbudować minimalny, zgodny typowo obiekt przypominający
`APIContext` Astro do bezpośredniego wywoływania handlerów `GET`/`POST`/
`PATCH`/`DELETE` z plików `src/pages/api/**`, oraz prostą klasę/fabrykę
"magazynu ciasteczek" zgodną z interfejsem oczekiwanym przez
`cookies.set()` w `src/lib/supabase.ts:16-20`.

**Kontrakt**: `buildApiContext({ method, url, headers?, body?, cookies?,
locals? })` zwraca obiekt z `request: new Request(url, { method, headers,
body })`, `cookies` (magazyn z `.set()`/`.get()`/`.delete()`), `locals: {
user }`, `params` i `url: new URL(url)` — wystarczające pola, by wywołać
dowolny handler `APIRoute` z tego repozytorium (żaden obecny handler nie
czyta innych pól kontekstu). Osobna funkcja `createCookieJar()` zwraca obiekt
z `.set(name, value, options)` (zapis do wewnętrznej `Map`) i
`.toCookieHeader()` (serializacja `Map` do `"name1=value1; name2=value2"`).

#### 7. Helper logowania i sprzątania

**Plik**: `tests/helpers/test-session.ts` (nowy)

**Cel**: (a) Zalogować danego użytkownika testowego i zwrócić gotowy nagłówek
`Cookie` + obiekt `User`, przez prawdziwe wywołanie
`supabase.auth.signInWithPassword()` na kliencie zbudowanym `createClient()`
z fałszywym magazynem ciasteczek (patrz Krytyczne Szczegóły Implementacji).
(b) Usunąć podany zestaw ID fiszek przez klienta service-role, do użycia w
`afterEach` testów Fazy 3.

**Kontrakt**: `signInAsTestUser(credentials: { email; password }): Promise<{
cookieHeader: string; user: User }>`; `cleanupFlashcards(ids: string[]):
Promise<void>`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npm install` kończy się bez błędów po dodaniu `vitest`
- [ ] `npm run test` uruchamia się i kończy (nawet zerem testów na tym
      etapie) bez błędów konfiguracji Vite/`astro:env`
- [ ] `npx tsc --noEmit` (lub `npm run astro check`) nie zgłasza błędów
      typów w nowych plikach `tests/**`

#### Weryfikacja ręczna:

- [ ] Po `npx supabase start` + `npm run test` z tymczasowym testem
      wywołującym `signInAsTestUser(TEST_USER_A)`, zwrócony `cookieHeader`
      jest niepusty, a kolejne żądanie z tym nagłówkiem do dowolnego
      endpointu API zwraca dane (nie 401) — potwierdza, że mechanizm
      logowania faktycznie działa, zanim napiszemy właściwe testy w Fazie 2-3

---

## Faza 2: Middleware i bramkowanie sesji (Ryzyko #1)

### Przegląd

Testy najtańszej warstwy o wysokim sygnale: middleware ochrony stron
(czysta funkcja, bez zależności od bazy) oraz bramkowanie 401 na wszystkich
endpointach `/api/*`, które middleware pomija.

### Wymagane zmiany:

#### 1. Testy middleware

**Plik**: `tests/middleware.test.ts` (nowy)

**Cel**: Zweryfikować logikę ochrony tras w `src/middleware.ts:18-21`
bezpośrednim wywołaniem `onRequest` z fałszywym `context`/`next` (spy).

Przypadki:
- Niezalogowany użytkownik (`locals.user` ustawiane przez middleware na
  podstawie `supabase.auth.getUser()` zwracającego brak sesji — symulowane
  przez brak nagłówka `Cookie`) żądający `/dashboard`, `/study`,
  `/settings` → przekierowanie do `/auth/signin`, `next()` NIE wywołane.
  *Zachowanie asertowane*: odpowiedź przekierowania, nie wywołanie `next`.
  *Regresja wyłapana*: usunięcie/osłabienie listy `PROTECTED_ROUTES` lub
  odwrócenie warunku `if (!context.locals.user)`.
  *Źródło*: research.md §1 (`src/middleware.ts:18-21`).
- Zalogowany użytkownik (prawdziwa sesja z `signInAsTestUser`) żądający tych
  samych tras → `next()` wywołane, brak przekierowania.
  *Anty-wzorzec unikany*: testowanie wyłącznie ścieżki niezalogowanej
  (happy-path pominięty).
- Żądanie trasy publicznej (np. `/`) bez sesji → `next()` wywołane, brak
  przekierowania (kontrola negatywna — middleware nie blokuje nadmiarowo).
- **Przypadek brzegowy (wybrany do zakresu)**: żądanie `/dashboard-anything`
  (nieistniejąca trasa, ale pasująca prefiksem) bez sesji → nadal
  przekierowanie. *Cel testu*: zablokować obecne (bezpieczne, bo "fail
  closed") zachowanie jako świadomy kontrakt, nie usterkę do naprawienia —
  research.md Open Questions flaguje to jako przypadek brzegowy dopasowania
  prefiksu.
  *Źródło*: research.md §1, Open Questions.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/middleware.test.ts` — wszystkie przypadki
      przechodzą

#### Weryfikacja ręczna:

- [ ] Przegląd wyniku testu prefiksu — potwierdzić, że opis testu jasno
      komunikuje "dokumentujemy obecne zachowanie", a nie "wymagamy tego
      zachowania"

---

#### 2. Testy bramkowania 401 dla endpointów `/api/*`

**Plik**: `tests/api/auth-gating.test.ts` (nowy)

**Cel**: Dla każdego endpointu konsumującego `context.locals.user`
(`flashcards.ts` GET/POST, `flashcards/[id].ts` PATCH/DELETE,
`study/queue.ts` GET, `study/review.ts` POST, `generate-flashcards.ts` POST,
`account.ts` DELETE) zweryfikować, że wywołanie z `locals.user = null`
zwraca `401` z ciałem `{ error: "Unauthorized" }`, PRZED jakąkolwiek próbą
dostępu do bazy.

*Zachowanie asertowane*: status `401` i brak zapytania do Supabase (te
endpointy sprawdzają `user` przed budową klienta — sam status 401
wystarcza jako dowód).
*Regresja wyłapana*: nowy endpoint lub refaktoryzacja, która zapomni
sprawdzić `locals.user` przed dostępem do danych — dokładnie ryzyko
nazwane w research.md ("Any new API route is at risk of forgetting this
check — middleware provides no safety net for `/api/*`").
*Źródło*: research.md §7, §"Architecture Insights".
*Przypadek brzegowy*: `signin.ts`/`signup.ts`/`confirm.ts` są celowo
WYŁĄCZONE z tego testu — nie konsumują `locals.user`, muszą być dostępne
bez sesji.
*Anty-wzorzec unikany*: lustro implementacji — test sprawdza obserwowalny
status/treść odpowiedzi, nie to, czy funkcja wewnętrznie "wywołała"
konkretną linię kodu.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/auth-gating.test.ts` — wszystkie endpointy
      zwracają 401 bez sesji

#### Weryfikacja ręczna:

- [ ] Lista endpointów w teście ręcznie porównana z `src/pages/api/**` — brak
      pominiętego pliku konsumującego `locals.user`

---

#### 3. Test integralności logowania/wylogowania

**Plik**: `tests/api/auth-session-integrity.test.ts` (nowy)

**Cel**: Zweryfikować pełny cykl sesji: logowanie realnym użytkownikiem
testowym daje ciasteczko, z którym żądanie do chronionego endpointu danych
się powodzi (200); wylogowanie zawsze przekierowuje do `/` niezależnie od
stanu sesji.

Przypadki:
- `signInAsTestUser(TEST_USER_A)` → wywołanie `GET
  src/pages/api/flashcards.ts` z uzyskanym nagłówkiem `Cookie` i
  `locals.user` ustawionym na zwróconego usera → `200`.
  *Zachowanie asertowane*: sesja z logowania faktycznie autoryzuje kolejne
  żądanie do innego endpointu (ten sam mechanizm ciasteczek).
  *Źródło*: research.md §2, §3 (`src/lib/supabase.ts`, `signin.ts`).
- **Przypadek brzegowy (wybrany do zakresu)**: wywołanie `POST
  src/pages/api/auth/signout.ts` bez żadnej sesji (brak nagłówka `Cookie`)
  → nadal `302` przekierowanie do `/`, mimo że `supabase.auth.signOut()`
  wewnętrznie nie ma czego wylogować / może zwrócić błąd, który jest
  połykany (`signout.ts:6-9`).
  *Zachowanie asertowane*: kontrakt "zawsze przekieruj do `/`", zablokowany
  jako świadome, testowane zachowanie — nie milcząca, nieprzetestowana
  usterka.
  *Regresja wyłapana*: przyszła zmiana, która zacznie zwracać błąd/500 przy
  nieudanym wylogowaniu, złamie ten test i wymusi świadomą decyzję.
  *Źródło*: research.md §3, Open Questions ("`signout.ts` swallows
  `signOut()` errors").
  *Anty-wzorzec unikany*: milcząca migawka — test nazywa wprost, że to
  utrwalenie ISTNIEJĄCEGO zachowania, nie potwierdzenie, że jest ono
  poprawne.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/auth-session-integrity.test.ts` — oba
      przypadki przechodzą

#### Weryfikacja ręczna:

- [ ] Ręczne potwierdzenie w lokalnym Supabase Studio (`http://127.0.0.1:54323`),
      że `TEST_USER_A`/`TEST_USER_B` istnieją i mają potwierdzony e-mail

---

## Faza 3: Izolacja danych między użytkownikami (Ryzyko #3)

### Przegląd

Najdroższa warstwa: prawdziwe dane, dwóch niezależnych użytkowników,
weryfikacja że żadna operacja odczytu/zapisu jednego użytkownika nie
dotyka danych drugiego — ani przez odpowiedź 200 z cudzymi danymi, ani przez
milczący pusty wynik maskujący błąd autoryzacji.

### Wymagane zmiany:

#### 1. Izolacja fiszek (`flashcards`)

**Plik**: `tests/api/flashcards-isolation.test.ts` (nowy)

**Cel**: Użytkownik A tworzy fiszkę (`POST /api/flashcards` z sesją A).
Użytkownik B (osobna sesja, osobne wywołanie `signInAsTestUser`) próbuje:
listować (`GET`), edytować (`PATCH .../[id]`) i usuwać (`DELETE .../[id]`)
fiszkę A.

Przypadki:
- `GET` jako B nie zawiera fiszki A na liście (dowód filtra
  `.eq("user_id", ...)` w `flashcards.ts:27` I polityki SELECT w RLS).
- `PATCH` jako B na ID fiszki A → `404 Not Found` (NIE `200` z cudzymi
  danymi, NIE `500`) — dowód filtra `.eq("id", id).eq("user_id", user.id)`
  w `flashcards/[id].ts:50-56`.
- `DELETE` jako B na ID fiszki A → `404`, a fiszka A nadal istnieje po
  teście (weryfikacja przez `GET` jako A).
- **Kontrola pozytywna**: te same operacje (`PATCH`/`DELETE`) wykonane
  przez A na własnej fiszce → sukces (`200`/`204`). Bez tej kontroli test
  udowadniałby tylko "B nic nie widzi", a nie że mechanizm faktycznie
  rozróżnia właściciela od nie-właściciela.

*Zachowanie asertowane*: żądanie nie-właściciela jest odrzucane w sposób
nieodróżnialny od "zasób nie istnieje" — nigdy nie ujawnia treści.
*Regresja wyłapana*: usunięcie `.eq("user_id", ...)` z któregokolwiek
zapytania w `flashcards.ts`/`flashcards/[id].ts`.
*Źródło*: research.md §5, §7 ("Belt-and-suspenders authorization").
*Anty-wzorzec unikany*: testowanie wyłącznie ścieżki nie-właściciela bez
kontroli pozytywnej (happy-path pominięty w drugą stronę).
*Sprzątanie*: `afterEach` wywołuje `cleanupFlashcards([id fiszki A])` przez
klienta service-role — niezależnie od wyniku testu (fiszka może przetrwać
nieudany `DELETE` w teście negatywnym).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/flashcards-isolation.test.ts` — wszystkie
      przypadki (negatywne + pozytywna kontrola) przechodzą
- [ ] Tabela `flashcards` nie zawiera osieroconych rekordów testowych po
      przebiegu (sprzątanie w `afterEach` faktycznie działa)

#### Weryfikacja ręczna:

- [ ] Podgląd tabeli `flashcards` w lokalnym Supabase Studio po przebiegu
      testów — pusta lub bez rekordów testowych

---

#### 2. Izolacja kolejki i przeglądu nauki (`study/queue`, `study/review`)

**Plik**: `tests/api/study-isolation.test.ts` (nowy)

**Cel**: Analogicznie do fiszek, ale dla ścieżki nauki: użytkownik A tworzy
fiszkę, użytkownik B odpytuje `GET /api/study/queue` i próbuje `POST
/api/study/review` na ID fiszki A.

Przypadki:
- `GET /api/study/queue` jako B nie zawiera fiszki A (filtr
  `.eq("user_id", user.id)` w `study/queue.ts:25`).
- `POST /api/study/review` jako B z `id` fiszki A → `404 Not Found` (filtr
  `.eq("id", id).eq("user_id", user.id)` w `study/review.ts:48`), stan
  harmonogramu FSRS fiszki A pozostaje niezmieniony (weryfikacja przez
  odczyt jako A po próbie B).
- **Kontrola pozytywna**: `POST /api/study/review` jako A na własnej
  fiszce → `200`, pola harmonogramu (`due_date`, `stability`, itd.) się
  zmieniają.

*Zachowanie asertowane*: próba nie-właściciela nie zmienia stanu
harmonogramu nauki cudzej karty ani go nie ujawnia.
*Regresja wyłapana*: usunięcie filtra `user_id` w `study/queue.ts` lub
`study/review.ts`, lub błędne mapowanie ID między zapytaniem SELECT a UPDATE
w `review.ts`.
*Źródło*: research.md §7, §"Historical Context" (wzorzec
`.eq("user_id", user.id)` potwierdzony w poprzednich zmianach).
*Poza zakresem tego pliku*: blokada optymistyczna (`last_review`) w
`review.ts:72-77` to ochrona przed współbieżnością, nie autoryzacją — nie
testujemy jej tutaj (należy do ewentualnej przyszłej fazy współbieżności,
nie Ryzyka #1/#3).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx vitest run tests/api/study-isolation.test.ts` — wszystkie
      przypadki przechodzą

#### Weryfikacja ręczna:

- [ ] Ręczne porównanie pól harmonogramu fiszki A przed/po próbie B w
      lokalnym Supabase Studio — brak zmian

---

## Faza 4: Utrwalenie wzorców w podręczniku i finalizacja

### Przegląd

Zamknięcie fazy wdrożenia: aktualizacja `context/foundation/test-plan.md`
prawdziwym, sprawdzonym wzorcem zamiast placeholderów "TBD", tak by kolejne
fazy (i `/10x-tdd` po zakończeniu Modułu 3) miały gotowy przepis do
naśladowania.

### Wymagane zmiany:

#### 1. Aktualizacja podręcznika testów

**Plik**: `context/foundation/test-plan.md`

**Cel**: Zastąpić placeholder w §6.2 ("Dodawanie testu integracyjnego")
konkretnym, odtwarzalnym przepisem opartym na tym, co faktycznie powstało w
tej fazie: lokalizacja plików (`tests/api/*.test.ts`), wzorzec logowania
(`signInAsTestUser` z `tests/helpers/test-session.ts`), wzorzec budowy
kontekstu (`buildApiContext` z `tests/helpers/api-context.ts`), wymóg
sprzątania (`cleanupFlashcards` w `afterEach`), oraz przykład jednej
asercji "właściciel widzi, nie-właściciel dostaje 404".

**Kontrakt**: Edycja treści sekcji §6.2 (i odsyłacza w §6.1 jeśli dotyczy);
bez zmian w §1/§2 (zasada nienaruszalności strategii poza `--refresh`).

#### 2. Weryfikacja pełnego przebiegu

**Plik**: brak nowego pliku — krok weryfikacyjny

**Cel**: Uruchomić cały zestaw testów od zera (`npx supabase db reset &&
npm run test`) jako dowód, że infrastruktura + wszystkie trzy fazy testowe
działają razem, w kolejności, na czystej bazie.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- [ ] `npx supabase db reset && npm run test` — pełny przebieg zielony od
      zera
- [ ] `npm run lint` — brak nowych błędów lintera w `tests/**`

#### Weryfikacja ręczna:

- [ ] Przegląd zaktualizowanej sekcji §6.2 `test-plan.md` — czy opisany
      przepis jest wystarczający, by ktoś nieznający tej fazy dodał kolejny
      test integracyjny bez zgadywania

---

## Strategia testowania

### Testy jednostkowe:

- Brak w tej fazie — cały zakres (#1, #3) wymaga prawdziwej sesji i bazy,
  więc każdy test jest integracyjny z definicji. Testy czysto jednostkowe
  (np. mapowanie pól FSRS) należą do §3 Faza 3 test-plan.md.

### Testy integracyjne:

- Middleware (fałszywy kontekst, bez bazy)
- Bramkowanie 401 (fałszywy kontekst, bez bazy)
- Integralność logowania/wylogowania (prawdziwa sesja, lokalny Supabase)
- Izolacja fiszek i nauki między dwoma użytkownikami (prawdziwa sesja +
  prawdziwe dane, lokalny Supabase)

### Kroki testowania ręcznego:

1. `npx supabase start`, następnie `npm run test` — potwierdzić zielony
   przebieg.
2. Otworzyć lokalny Supabase Studio, potwierdzić istnienie
   `TEST_USER_A`/`TEST_USER_B` w `auth.users`.
3. Po przebiegu testów fazy 3, sprawdzić tabelę `flashcards` — brak
   osieroconych rekordów testowych.

## Uwagi dotyczące wydajności

Testy uderzają w prawdziwy lokalny Postgres/GoTrue — oczekiwany czas
przebiegu całej Fazy 1 to sekundy, nie milisekundy, na test (logowanie =
realne żądanie HTTP do lokalnego GoTrue). `testTimeout: 15000` w
`vitest.config.ts` daje margines na wolniejsze maszyny/CI.

## Uwagi dotyczące migracji

Brak migracji danych. Jedyna nowa "dana" to dwaj stali użytkownicy testowi,
tworzeni idempotentnie przez `globalSetup`, nigdy nie migrowani do
środowiska produkcyjnego (żyją wyłącznie w lokalnej instancji Supabase
uruchamianej przez `npx supabase start`).

## Addendum (po przeglądzie implementacji, 2026-09-03)

- **`astro.config.mjs` — nieplanowana, ale konieczna zmiana**: dodano
  warunek `process.env.VITEST ? undefined : cloudflare({...})` wokół
  adaptera Cloudflare. Nie było to wymienione w "Wymaganych zmianach" Fazy
  1, ale okazało się konieczne: `getViteConfig()` (używane w
  `vitest.config.ts`) ładuje pełną konfigurację Astro/Vite, a Vite plugin
  adaptera Cloudflare ustawia `resolve.external` na środowisku workera, co
  koliduje ze środowiskiem `node` Vitest. Zweryfikowano usuwając warunek i
  ponownie uruchamiając `npm run test` — przebieg kończy się błędem bez tej
  zmiany. Zatwierdzone jako świadoma adaptacja implementacyjna.

## Referencje

- Powiązane badania: `context/changes/auth-access-control-coverage/research.md`
- Plan testów (nadrzędny): `context/foundation/test-plan.md` §3 Faza 1, §2
  (Ryzyko #1, #3), Wskazówki Dotyczące Reagowania na Ryzyko

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Infrastruktura testowa

#### Automatyczne

- [x] 1.1 npm install kończy się bez błędów po dodaniu vitest — 1ae275d
- [x] 1.2 npm run test uruchamia się i kończy bez błędów konfiguracji Vite/astro:env — 1ae275d
- [x] 1.3 npx tsc --noEmit nie zgłasza błędów typów w nowych plikach tests/** — 1ae275d

#### Ręczne

- [x] 1.4 signInAsTestUser(TEST_USER_A) zwraca niepusty cookieHeader, kolejne żądanie z tym nagłówkiem zwraca dane (nie 401) — 1ae275d

### Faza 2: Middleware i bramkowanie sesji (Ryzyko #1)

#### Automatyczne

- [x] 2.1 tests/middleware.test.ts — wszystkie przypadki przechodzą — cc29e01
- [x] 2.2 tests/api/auth-gating.test.ts — wszystkie endpointy zwracają 401 bez sesji — cc29e01
- [x] 2.3 tests/api/auth-session-integrity.test.ts — oba przypadki przechodzą — cc29e01

#### Ręczne

- [x] 2.4 Przegląd opisu testu prefiksu — jasno komunikuje "dokumentujemy obecne zachowanie" — cc29e01
- [x] 2.5 Lista endpointów w auth-gating.test.ts porównana ręcznie z src/pages/api/** — brak pominięcia — cc29e01
- [x] 2.6 Potwierdzenie w lokalnym Supabase Studio istnienia i potwierdzenia e-mail TEST_USER_A/B — cc29e01

### Faza 3: Izolacja danych między użytkownikami (Ryzyko #3)

#### Automatyczne

- [x] 3.1 tests/api/flashcards-isolation.test.ts — wszystkie przypadki przechodzą — 1be819d
- [x] 3.2 Tabela flashcards bez osieroconych rekordów testowych po przebiegu — 1be819d
- [x] 3.3 tests/api/study-isolation.test.ts — wszystkie przypadki przechodzą — 1be819d

#### Ręczne

- [x] 3.4 Podgląd tabeli flashcards w Supabase Studio po testach — brak rekordów testowych — 1be819d
- [x] 3.5 Porównanie pól harmonogramu fiszki A przed/po próbie B — brak zmian — 1be819d

### Faza 4: Utrwalenie wzorców w podręczniku i finalizacja

#### Automatyczne

- [x] 4.1 npx supabase db reset && npm run test — pełny przebieg zielony od zera — c8ecce9
- [x] 4.2 npm run lint — brak nowych błędów lintera w tests/** — c8ecce9

#### Ręczne

- [x] 4.3 Przegląd zaktualizowanej sekcji §6.2 test-plan.md — przepis wystarczający bez zgadywania — c8ecce9
