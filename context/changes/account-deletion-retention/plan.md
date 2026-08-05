# Plan implementacji: Usuwanie konta i retencja danych (RODO)

## Przegląd

Implementujemy dwa powiązane mechanizmy zgodności z RODO (art. 5 ust. 1 lit. e — "storage limitation"):
(1) samodzielne, nieodwracalne usunięcie własnego konta przez zalogowanego użytkownika z nowej strony ustawień,
oraz (2) automatyczne wykrywanie i usuwanie kont nieaktywnych przez 24+ miesięcy, poprzedzone e-mailem
ostrzegawczym wysyłanym 30 dni przed usunięciem. Usunięcie konta w obu przypadkach oznacza trwałe skasowanie
rekordu w Supabase Auth oraz — dzięki istniejącemu `ON DELETE CASCADE` — wszystkich powiązanych fiszek
(w tym pól SRS/FSRS).

## Analiza stanu obecnego

- Tabela `flashcards` (`supabase/migrations/20260610000000_create_flashcards.sql`) ma
  `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` — usunięcie użytkownika w
  `auth.users` automatycznie kasuje wszystkie jego fiszki. **Nie jest potrzebna żadna nowa migracja SQL
  do kaskadowego usuwania danych.**
- `src/lib/supabase.ts` tworzy klienta Supabase używającego wyłącznie klucza `anon` (`SUPABASE_KEY`) w
  kontekście sesji użytkownika (cookies). Nie ma obecnie żadnego klienta z kluczem `service_role` — a
  operacje `auth.admin.deleteUser()` / `auth.admin.listUsers()` wymagają klucza `service_role`, ponieważ
  nie są dostępne przez zwykłą sesję użytkownika.
- `astro.config.mjs` `env.schema` definiuje tylko `SUPABASE_URL`, `SUPABASE_KEY` i klucze AI — brak
  `SUPABASE_SERVICE_ROLE_KEY`.
- `src/middleware.ts` chroni trasy przez prefiks (`PROTECTED_ROUTES = ["/dashboard", "/study"]`) —
  nowa strona `/settings` musi zostać dodana do tej listy.
- Brak strony ustawień konta (`src/pages/settings.astro` nie istnieje).
- Brak jakiegokolwiek dostawcy transakcyjnych e-maili poza wbudowanym mechanizmem Supabase Auth
  (`supabase/config.toml` ma zakomentowaną sekcję `[auth.email.smtp]` do skonfigurowania Custom SMTP).
  `supabase.auth.signInWithOtp()` (wywołane po stronie serwera z kluczem `anon`, bez tworzenia nowego
  użytkownika) wyzwala wysyłkę e-maila Magic Link **z serwerów Supabase**, więc nie wymaga surowego
  połączenia SMTP/TCP z poziomu Cloudflare Workera.
- Brak frameworka testów jednostkowych w repo (brak Vitest/Jest, brak plików `*.test.ts`) — zdecydowano
  nie wprowadzać nowego narzędzia testowego dla tej zmiany (patrz "Czego NIE robimy").
- Deployment celuje w Cloudflare Pages (`wrangler.pages.jsonc`, `hints.deployment_target: cloudflare-pages`
  w `tech-stack.md`) — natywne Cron Triggery Cloudflare Workers nie są tu bezpośrednio dostępne, dlatego
  harmonogram realizujemy zewnętrznie (GitHub Actions `schedule:`) wywołując chroniony endpoint HTTP.
- Wzorce istniejących endpointów API (`src/pages/api/flashcards/[id].ts`, `src/pages/api/generate-flashcards.ts`)
  ustalają konwencję: `export const prerender = false;`, `context.locals.user` do autoryzacji, walidacja
  zod, `Response` z JSON + kod statusu, `console.error` do logowania błędów.

### Kluczowe odkrycia:

- `flashcards.user_id ... ON DELETE CASCADE` — kasowanie danych nauki NIE wymaga osobnego kroku usuwania
  z tabeli `flashcards`; wystarczy usunąć użytkownika z `auth.users` przez Admin API.
- `supabase.auth.admin.listUsers()` zwraca wyniki stronicowane (domyślnie `perPage: 50`) — endpoint
  czyszczenia musi iterować strony, a nie zakładać jednego wywołania.
- `signInWithOtp({ email, options: { shouldCreateUser: false } })` jest jedynym wbudowanym mechanizmem
  wysyłki niestandardowego e-maila do istniejącego użytkownika bez nowej zależności zewnętrznej — treść
  e-maila ostrzegawczego wymaga dostosowania szablonu "Magic Link" w Supabase (dashboard/`config.toml`),
  co jest krokiem konfiguracyjnym, nie kodem aplikacji.

## Pożądany stan końcowy

- Zalogowany użytkownik może przejść na `/settings`, kliknąć "Usuń konto", potwierdzić wpisując "USUŃ" +
  zaznaczając checkbox, i mieć swoje konto oraz wszystkie fiszki trwale skasowane, z automatycznym
  wylogowaniem i przekierowaniem.
- Chroniony endpoint `/api/admin/cleanup-inactive-accounts` (wywoływany przez zewnętrzny harmonogram)
  identyfikuje konta z `last_sign_in_at` starszym niż 24 miesiące i je usuwa, oraz wysyła e-mail
  ostrzegawczy do kont, które przekroczyły próg 23 miesięcy (okno 30 dni przed usunięciem).
- Weryfikacja: endpoint czyszczenia wspiera `?dryRun=true`, zwracając listę kont kwalifikujących się do
  akcji bez faktycznego usuwania/wysyłania e-maili — używane do bezpiecznej weryfikacji manualnej przed
  włączeniem harmonogramu w GitHub Actions.

## Czego NIE robimy

- Nie dodajemy nowego frameworka testów jednostkowych (Vitest/Jest) — weryfikacja logiki nieaktywności
  odbywa się przez tryb `dryRun` i testy ręczne.
- Nie dodajemy zewnętrznego dostawcy e-maili transakcyjnych (np. Resend) — używamy wyłącznie wbudowanego
  mechanizmu e-mail Supabase Auth.
- Nie budujemy dedykowanej tabeli audytu usunięć (`deletion_audit_log`) — polegamy na standardowych
  logach Cloudflare Workers Observability.
- Nie rozbudowujemy `/settings` o inne funkcje profilu (zmiana hasła, e-maila) — tylko sekcja usuwania konta.
- Nie wymagamy ponownego uwierzytelnienia hasłem przy samodzielnym usuwaniu konta — tylko modal z
  wpisaniem słowa potwierdzającego.
- Nie aktualizujemy formalnie `context/foundation/prd.md` o nowy FR w ramach tego planu (odnotowane jako
  zalecenie w roadmapie, ale nie blokuje tej implementacji).
- Nie implementujemy natywnego Cloudflare Cron Trigger — harmonogram to zewnętrzny GitHub Actions `schedule:`.

## Podejście do implementacji

Faza 1 buduje fundament (klient administracyjny z kluczem `service_role`) potrzebny przez obie ścieżki
funkcjonalne. Faza 2 dostarcza samodzielne usuwanie konta (must-have) — niezależną, w pełni funkcjonalną
całość, którą można wdrożyć osobno. Fazy 3-4 dostarczają automatyczne usuwanie nieaktywnych kont
(nice-to-have) — mogą zostać odłożone bez wpływu na Fazę 2. Ta kolejność pozwala zatrzymać się po Fazie 2,
jeśli czas jest ograniczony, zachowując pełną wartość must-have.

## Krytyczne szczegóły implementacji

- **Klucz service_role**: `context/changes/deployment/deployment-plan.md` jawnie ostrzega przed użyciem
  klucza `service_role` dla klienta użytkownika ("pomija RLS"). Nowy klient administracyjny musi być
  **oddzielnym plikiem** (`src/lib/supabase-admin.ts`), używanym **wyłącznie** w endpointach
  `DELETE /api/account` i `/api/admin/cleanup-inactive-accounts` — nigdy nie eksportowanym do kodu
  klienckiego ani używanym do zwykłych zapytań na fiszkach.
- **Wyzwalanie e-maila przez `signInWithOtp`**: efektem ubocznym wywołania `signInWithOtp` jest wysłanie
  *prawdziwego* Magic Linku logującego. Treść szablonu "Magic Link" w Supabase musi zostać ręcznie
  dostosowana (poza kodem aplikacji, w Supabase Dashboard → Auth → Email Templates, lub lokalnie przez
  `[auth.email.template.magic_link]` w `config.toml`), aby komunikować kontekst "Twoje konto zostanie
  usunięte za 30 dni z powodu nieaktywności — zaloguj się, aby to przerwać". Zalogowanie się aktualizuje
  `last_sign_in_at`, co naturalnie usuwa konto z listy kwalifikującej się do usunięcia przy następnym
  uruchomieniu joba.
- **Paginacja `admin.listUsers`**: endpoint czyszczenia musi iterować strony (`page`, `perPage`) aż do
  pustego wyniku, filtrując lokalnie po `last_sign_in_at` — Supabase Admin API nie wspiera filtrowania
  po tym polu po stronie serwera.
- **Kolejność w Fazie 3**: usuwanie i wysyłka e-maili muszą być rozłączne zbiory kont (próg 24 miesięcy =
  usuń; próg 23-24 miesięcy = wyślij ostrzeżenie) — konto nie powinno dostać jednocześnie e-maila i
  zostać usunięte w tym samym przebiegu joba.

## Faza 1: Fundament — klient administracyjny Supabase

### Przegląd

Dodaje sekret `SUPABASE_SERVICE_ROLE_KEY` i dedykowany moduł tworzący klienta Supabase z pełnym dostępem
administracyjnym, wymagany przez obie kolejne fazy funkcjonalne.

### Wymagane zmiany:

#### 1. Rejestracja nowego sekretu środowiskowego

**Plik**: `astro.config.mjs`

**Cel**: Udostępnić `SUPABASE_SERVICE_ROLE_KEY` jako sekret serwerowy, analogicznie do istniejącego
`SUPABASE_KEY`, tak by był dostępny przez `astro:env/server`.

**Kontrakt**: Nowe pole `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })`
w `env.schema`, obok istniejącego `SUPABASE_KEY`.

#### 2. Klient administracyjny

**Plik**: `src/lib/supabase-admin.ts` (nowy)

**Cel**: Utworzyć funkcję `createAdminClient()` zwracającą klienta Supabase (`@supabase/supabase-js`,
nie `@supabase/ssr`, bo nie potrzebuje obsługi cookies/sesji) skonfigurowanego kluczem `service_role`,
z opcją `auth: { autoRefreshToken: false, persistSession: false }` (standardowa konfiguracja dla klientów
serwerowych bez sesji użytkownika). Zwraca `null`, gdy `SUPABASE_URL` lub `SUPABASE_SERVICE_ROLE_KEY`
nie są skonfigurowane — analogicznie do `createClient()` w `src/lib/supabase.ts`.

**Kontrakt**: `export function createAdminClient(): SupabaseClient | null`. Używany wyłącznie server-side
w endpointach z Fazy 2 i Fazy 3 — nie importowany przez żaden komponent React ani stronę `.astro`
renderowaną z danymi klienckimi.

#### 3. Konfiguracja lokalna i CI

**Plik**: `.env.example`, `.dev.vars` (dokumentacja — plik `.dev.vars` jest gitignored, więc tylko
`.env.example` jest commitowany), `.github/workflows/ci.yml` (jeśli build zacznie wymagać zmiennej)

**Cel**: Udokumentować nowy wymagany sekret dla lokalnego developmentu; dodać jako opcjonalny do CI tylko
jeśli `npm run build` zacznie go wymagać (nie powinien, bo pole jest `optional: true`).

**Kontrakt**: Dodać linię `SUPABASE_SERVICE_ROLE_KEY=` do `.env.example` z komentarzem
`# Supabase service_role key — ODCZYT/ZAPIS z pominięciem RLS, tylko dla operacji administracyjnych (usuwanie kont). NIE eksponować po stronie klienta.`

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- TypeScript rozpoznaje `SUPABASE_SERVICE_ROLE_KEY` z `astro:env/server` bez błędów typów: `npx astro sync && npx astro check`

#### Weryfikacja ręczna:

- Lokalnie, z pustym `SUPABASE_SERVICE_ROLE_KEY` w `.dev.vars`, `createAdminClient()` zwraca `null` bez rzucania wyjątku
- Po ustawieniu klucza `service_role` z lokalnego `supabase start` w `.dev.vars`, `createAdminClient().auth.admin.listUsers()` zwraca listę użytkowników testowych bez błędu

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem, zanim przejdziesz do następnej fazy.

---

## Faza 2: Samodzielne usunięcie konta (must-have)

### Przegląd

Dostarcza kompletną, samodzielnie wdrażalną funkcję: zalogowany użytkownik usuwa własne konto i wszystkie
powiązane dane z ekranu ustawień, z potwierdzeniem chroniącym przed przypadkowym kliknięciem.

### Wymagane zmiany:

#### 1. Ochrona nowej trasy

**Plik**: `src/middleware.ts`

**Cel**: Dodać `/settings` do listy chronionych tras, tak by niezalogowani użytkownicy byli przekierowani do logowania.

**Kontrakt**: `PROTECTED_ROUTES = ["/dashboard", "/study", "/settings"]`.

#### 2. Strona ustawień

**Plik**: `src/pages/settings.astro` (nowy)

**Cel**: Minimalna strona z jedną sekcją "Usuń konto", spójna wizualnie z `src/pages/dashboard.astro`
(ten sam `Layout`, styl karty `bg-cosmic`/`backdrop-blur-xl`). Osadza React island `AccountDeletion`
z `client:load`.

**Kontrakt**: Struktura Astro identyczna z `dashboard.astro` (import `Layout`, odczyt `Astro.locals.user`),
z pojedynczym komponentem React zamiast `FlashcardDashboard`.

#### 3. Komponent React usuwania konta

**Plik**: `src/components/AccountDeletion.tsx` (nowy)

**Cel**: Przycisk "Usuń konto" otwierający modal (Dialog z `src/components/ui/`, lub prosty kontrolowany
modal jeśli komponent Dialog shadcn/ui nie jest jeszcze zainstalowany — sprawdzić przed implementacją i
w razie braku zainstalować `npx shadcn@latest add dialog`). Modal zawiera: ostrzeżenie o nieodwracalności,
pole tekstowe wymagające wpisania dokładnie "USUŃ", checkbox "Rozumiem, że ta operacja jest nieodwracalna",
przycisk potwierdzenia aktywny tylko gdy oba warunki spełnione. Po potwierdzeniu wywołuje
`DELETE /api/account`, a po sukcesie przekierowuje na `/` (wylogowanie następuje po stronie serwera
w endpointzie).

**Kontrakt**: Props: brak (czyta `user` przez kontekst strony lub przyjmuje `email` jako prop do
wyświetlenia w ostrzeżeniu). Stan lokalny: tekst wpisany, checkbox, `isDeleting`, `error`. Wywołuje
`fetch("/api/account", { method: "DELETE" })`.

#### 4. Endpoint usuwania konta

**Plik**: `src/pages/api/account.ts` (nowy)

**Cel**: Usunąć konto zalogowanego użytkownika i wszystkie powiązane dane (przez kaskadę FK), a następnie
wylogować sesję.

**Kontrakt**: `export const prerender = false;` + `export const DELETE: APIRoute`. Logika: (1) sprawdź
`context.locals.user`, zwróć 401 jeśli brak; (2) `createAdminClient()`, zwróć 503 jeśli `null`;
(3) `await admin.auth.admin.deleteUser(user.id)` — kaskada FK usuwa fiszki automatycznie; (4) jeśli
błąd, zaloguj i zwróć 500; (5) po sukcesie, użyj zwykłego klienta sesji (`createClient`) do
`await supabase.auth.signOut()`; (6) zwróć `204 No Content`. Wzorzec obsługi błędów jak w
`src/pages/api/flashcards/[id].ts`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Endpoint zwraca 401 dla żądania bez sesji (weryfikowalne przez `curl` bez cookies)

#### Weryfikacja ręczna:

- Zalogowany użytkownik testowy widzi `/settings` z sekcją "Usuń konto"
- Kliknięcie "Usuń konto" bez wpisania "USUŃ" nie aktywuje przycisku potwierdzenia
- Po poprawnym potwierdzeniu, konto znika z `auth.users` (weryfikacja w Supabase Studio), fiszki znikają z tabeli `flashcards`, użytkownik jest wylogowany i przekierowany na `/`
- Próba zalogowania się starymi danymi po usunięciu kończy się błędem "Invalid credentials"
- Niezalogowany użytkownik odwiedzający `/settings` jest przekierowany na `/auth/signin`

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem, zanim przejdziesz do następnej fazy.

---

## Faza 3: Wykrywanie i usuwanie nieaktywnych kont (nice-to-have)

### Przegląd

Dostarcza chroniony endpoint, który identyfikuje konta nieaktywne 24+ miesiące (wg `last_sign_in_at`) i
je usuwa, z trybem `dryRun` do bezpiecznej weryfikacji przed pierwszym uruchomieniem produkcyjnym.

### Wymagane zmiany:

#### 1. Sekret autoryzacyjny endpointu

**Plik**: `astro.config.mjs`

**Cel**: Dodać `CLEANUP_ENDPOINT_SECRET` jako sekret serwerowy do autoryzacji wywołań z zewnętrznego harmonogramu.

**Kontrakt**: `CLEANUP_ENDPOINT_SECRET: envField.string({ context: "server", access: "secret", optional: true })`.

#### 2. Moduł logiki wykrywania nieaktywności

**Plik**: `src/lib/inactive-accounts.ts` (nowy)

**Cel**: Czysta funkcja pomocnicza obliczająca próg dat i klasyfikująca użytkownika jako
"do usunięcia" (nieaktywny 24+ miesiące) na podstawie `last_sign_in_at`. Wydzielona z endpointu, by
mogła być pokryta w przyszłości testami jednostkowymi bez zależności od requestu HTTP.

**Kontrakt**: `export function isInactiveForDeletion(lastSignInAt: string | null, now?: Date): boolean` —
zwraca `true`, gdy różnica między `now` a `lastSignInAt` wynosi ≥ 24 miesiące (730 dni jako przybliżenie
24×30.44 — udokumentować w komentarzu dokładną definicję "miesiąca" użytą do obliczeń, np. `Date` z
`setMonth(-24)` dla poprawnej arytmetyki kalendarzowej zamiast stałej liczby dni).

#### 3. Endpoint czyszczenia

**Plik**: `src/pages/api/admin/cleanup-inactive-accounts.ts` (nowy)

**Cel**: Iterować wszystkich użytkowników przez `admin.listUsers()` (paginacja), klasyfikować każdego
przez `isInactiveForDeletion`, i albo zwrócić listę (tryb `dryRun`), albo faktycznie usunąć kwalifikujące
się konta jedno po drugim, kontynuując mimo błędów pojedynczych kont.

**Kontrakt**: `export const prerender = false;` + `export const POST: APIRoute`. Autoryzacja: nagłówek
`Authorization: Bearer <CLEANUP_ENDPOINT_SECRET>`, 401 jeśli brak/niepoprawny. Query param `dryRun`
(`"true"`/`"false"`, domyślnie `"false"`). Odpowiedź JSON: `{ processed: number, deleted: string[], errors: { userId: string, message: string }[], dryRun: boolean }`.
Błąd usunięcia pojedynczego konta jest łapany per-iterację (`try/catch` w pętli), logowany przez
`console.error`, dodawany do `errors[]`, i **nie przerywa** przetwarzania pozostałych kont.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Endpoint zwraca 401 bez poprawnego nagłówka `Authorization` (weryfikowalne przez `curl`)

#### Weryfikacja ręczna:

- Z `?dryRun=true` i danymi testowymi w lokalnym Supabase (konto z `last_sign_in_at` ustawionym ręcznie na >24 miesiące wstecz przez SQL), endpoint zwraca to konto na liście `deleted` bez faktycznego usunięcia (konto nadal istnieje w `auth.users` po wywołaniu)
- Z `dryRun=false`, to samo konto testowe zostaje faktycznie usunięte, a jego fiszki znikają kaskadowo
- Konto aktywne (niedawne `last_sign_in_at`) nigdy nie pojawia się na liście `deleted`
- Endpoint kontynuuje przetwarzanie pozostałych kont, gdy jedno z wielu testowych kont powoduje błąd (symulowane np. nieprawidłowym ID)

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem, zanim przejdziesz do następnej fazy.

---

## Faza 4: E-mail ostrzegawczy i harmonogram (nice-to-have, zależne od Fazy 3)

### Przegląd

Dodaje 30-dniowe okno ostrzegawcze przed automatycznym usunięciem oraz zewnętrzny harmonogram (GitHub
Actions) wywołujący endpoint z Fazy 3 cyklicznie.

### Wymagane zmiany:

#### 1. Klasyfikacja "w oknie ostrzegawczym"

**Plik**: `src/lib/inactive-accounts.ts`

**Cel**: Dodać drugą funkcję klasyfikującą konta w oknie 23-24 miesięcy nieaktywności (kandydaci do
e-maila ostrzegawczego), rozłączną ze zbiorem kwalifikującym się do usunięcia.

**Kontrakt**: `export function isInWarningWindow(lastSignInAt: string | null, now?: Date): boolean` —
`true` dla nieaktywności w przedziale [23 miesiące, 24 miesięcy). Wzajemnie wykluczające się z
`isInactiveForDeletion` (żadne konto nie spełnia obu jednocześnie).

#### 2. Rozszerzenie endpointu czyszczenia o wysyłkę ostrzeżeń

**Plik**: `src/pages/api/admin/cleanup-inactive-accounts.ts`

**Cel**: W tej samej iteracji `listUsers()`, dla kont w oknie ostrzegawczym wywołać
`supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })` (klient `anon`, nie
administracyjny — to zwykłe wywołanie auth, nie wymaga `service_role`) zamiast usuwania.

**Kontrakt**: Rozszerzona odpowiedź JSON: dodać pole `warned: string[]`. Błędy wysyłki e-maila trafiają
do tego samego `errors[]` co błędy usuwania, z dodatkowym polem `action: "delete" | "warn"` do
rozróżnienia w logach.

#### 3. Dostosowanie szablonu e-mail Magic Link (konfiguracja, nie kod)

**Plik**: `supabase/config.toml` (dla lokalnego dev) + ręczna konfiguracja w Supabase Dashboard (produkcja)

**Cel**: Odkomentować i wypełnić `[auth.email.template.magic_link]` treścią komunikującą kontekst
usunięcia konta z powodu nieaktywności, z wyjaśnieniem że zalogowanie się przerywa proces.

**Kontrakt**: Sekcja `[auth.email.template.magic_link]` z `subject` i `content_path` wskazującym na nowy
plik `supabase/templates/magic_link_retention_warning.html`. Uwaga: ten sam szablon Magic Link jest
używany do zwykłego logowania — jeśli projekt w przyszłości doda logowanie przez magic link dla innych
celów, treść będzie wymagała rozróżnienia kontekstu (poza zakresem tej zmiany, odnotowane jako ryzyko).

#### 4. Harmonogram GitHub Actions

**Plik**: `.github/workflows/cleanup-inactive-accounts.yml` (nowy)

**Cel**: Cykliczne (np. raz dziennie, `cron: "0 3 * * *"`) wywołanie produkcyjnego endpointu przez `curl`
z nagłówkiem autoryzacyjnym z sekretu repozytorium.

**Kontrakt**: Workflow z `on.schedule` + `workflow_dispatch` (dla ręcznego uruchomienia testowego),
krok `curl -X POST -H "Authorization: Bearer ${{ secrets.CLEANUP_ENDPOINT_SECRET }}" https://<production-url>/api/admin/cleanup-inactive-accounts`,
sprawdzający kod odpowiedzi HTTP i failujący job przy błędzie (`--fail` flaga curl).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- `isInactiveForDeletion` i `isInWarningWindow` nigdy nie zwracają `true` jednocześnie dla tego samego `lastSignInAt` (weryfikowalne ręcznie przez wywołanie obu funkcji z tymi samymi danymi w konsoli/REPL)

#### Weryfikacja ręczna:

- Konto testowe z `last_sign_in_at` ustawionym na dokładnie 23,5 miesiąca wstecz otrzymuje e-mail (widoczny w lokalnym Inbucket, `http://127.0.0.1:54324`) z poprawną treścią ostrzegawczą
- Zalogowanie się linkiem z e-maila aktualizuje `last_sign_in_at`, przez co konto znika z listy `warned` przy kolejnym uruchomieniu joba
- Ręczne uruchomienie workflow (`workflow_dispatch`) w GitHub Actions kończy się sukcesem przeciwko środowisku stagingowemu/testowemu
- Harmonogram `cron` jest widoczny i poprawnie sformatowany w zakładce Actions repozytorium

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem.

---

## Strategia testowania

### Testy jednostkowe:

- Brak — świadomie pominięte (patrz "Czego NIE robimy"). Logika dat w `isInactiveForDeletion` /
  `isInWarningWindow` weryfikowana ręcznie przez tryb `dryRun` i wywołania z konsoli deweloperskiej.

### Testy integracyjne:

- Brak automatycznych — weryfikacja end-to-end odbywa się ręcznie na lokalnym stosie Supabase (`npx supabase start`).

### Kroki testowania ręcznego:

1. Utworzyć konto testowe, ręcznie cofnąć `last_sign_in_at` w `auth.users` przez SQL (`UPDATE auth.users SET last_sign_in_at = now() - interval '25 months' WHERE email = '...'`)
2. Wywołać `/api/admin/cleanup-inactive-accounts?dryRun=true` i zweryfikować, że konto pojawia się na liście `deleted` bez faktycznego usunięcia
3. Wywołać bez `dryRun` i zweryfikować faktyczne usunięcie konta oraz kaskadowe usunięcie jego fiszek
4. Powtórzyć z kontem w oknie 23-24 miesięcy i zweryfikować wysyłkę e-maila ostrzegawczego w Inbucket
5. Przetestować samodzielne usunięcie konta przez UI `/settings`, weryfikując wylogowanie i zniknięcie konta

## Uwagi dotyczące wydajności

Przy obecnej skali projektu (`target_scale.users: small` w `prd.md`) paginacja `admin.listUsers()` przez
kilkadziesiąt/kilkaset kont mieści się bez problemu w limicie czasu wykonania Cloudflare Workera. Jeśli
baza użytkowników znacząco urośnie, endpoint będzie wymagał przetwarzania wsadowego/kolejkowego — poza
zakresem tej zmiany.

## Uwagi dotyczące migracji

Brak migracji SQL — schemat `flashcards` już wspiera kaskadowe usuwanie. Nowe sekrety
(`SUPABASE_SERVICE_ROLE_KEY`, `CLEANUP_ENDPOINT_SECRET`) muszą zostać dodane do `.dev.vars` (lokalnie) i
do sekretów produkcyjnych Cloudflare Pages / GitHub Actions przed wdrożeniem odpowiednich faz.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` (S-06: `account-deletion-retention`)
- Migracja kaskady: `supabase/migrations/20260610000000_create_flashcards.sql`
- Wzorzec endpointu API: `src/pages/api/flashcards/[id].ts`
- Ostrzeżenie o kluczu service_role: `context/changes/deployment/deployment-plan.md:160`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Fundament — klient administracyjny Supabase

#### Automatyczne

- [x] 1.1 Lint przechodzi
- [x] 1.2 Build przechodzi
- [x] 1.3 TypeScript rozpoznaje `SUPABASE_SERVICE_ROLE_KEY` bez błędów typów

#### Ręczne

- [x] 1.4 `createAdminClient()` zwraca `null` bez klucza skonfigurowanego
- [x] 1.5 `createAdminClient().auth.admin.listUsers()` działa z lokalnym kluczem service_role

### Faza 2: Samodzielne usunięcie konta (must-have)

#### Automatyczne

- [ ] 2.1 Lint przechodzi
- [ ] 2.2 Build przechodzi
- [ ] 2.3 Endpoint zwraca 401 bez sesji

#### Ręczne

- [ ] 2.4 `/settings` widoczne z sekcją "Usuń konto"
- [ ] 2.5 Przycisk potwierdzenia nieaktywny bez wpisania "USUŃ"
- [ ] 2.6 Konto i fiszki znikają po potwierdzeniu, użytkownik wylogowany i przekierowany
- [ ] 2.7 Logowanie starymi danymi po usunięciu kończy się błędem
- [ ] 2.8 Niezalogowany użytkownik przekierowany z `/settings` na `/auth/signin`

### Faza 3: Wykrywanie i usuwanie nieaktywnych kont (nice-to-have)

#### Automatyczne

- [ ] 3.1 Lint przechodzi
- [ ] 3.2 Build przechodzi
- [ ] 3.3 Endpoint zwraca 401 bez poprawnego nagłówka Authorization

#### Ręczne

- [ ] 3.4 `dryRun=true` zwraca konto testowe bez faktycznego usunięcia
- [ ] 3.5 `dryRun=false` faktycznie usuwa konto testowe i jego fiszki
- [ ] 3.6 Konto aktywne nigdy nie pojawia się na liście `deleted`
- [ ] 3.7 Endpoint kontynuuje mimo błędu pojedynczego konta

### Faza 4: E-mail ostrzegawczy i harmonogram (nice-to-have, zależne od Fazy 3)

#### Automatyczne

- [ ] 4.1 Lint przechodzi
- [ ] 4.2 Build przechodzi
- [ ] 4.3 `isInactiveForDeletion` i `isInWarningWindow` wzajemnie się wykluczają

#### Ręczne

- [ ] 4.4 Konto w oknie 23-24 miesięcy otrzymuje e-mail w lokalnym Inbucket z poprawną treścią
- [ ] 4.5 Zalogowanie się linkiem z e-maila usuwa konto z listy `warned` przy kolejnym uruchomieniu
- [ ] 4.6 Ręczne uruchomienie `workflow_dispatch` kończy się sukcesem
- [ ] 4.7 Harmonogram `cron` widoczny i poprawny w zakładce Actions
