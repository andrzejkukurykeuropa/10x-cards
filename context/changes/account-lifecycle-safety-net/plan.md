# Plan implementacji: Account-lifecycle safety net (test-plan §3 Faza 4, Ryzyko #6)

## Przegląd

Faza 4 fazowego wdrożenia z `context/foundation/test-plan.md` (§3). Dostarcza pokrycie
jednostkowe „zapytania selekcji" zadania czyszczącego nieaktywne konta — konkretnie
dwóch **czystych klasyfikatorów** w `src/lib/inactive-accounts.ts`:
`isInactiveForDeletion()` i `isInWarningWindow()`.

Jeden nowy plik `tests/lib/inactive-accounts.test.ts`. **Zero zmian w `src/`**, zero
zmian w konfiguracji runnera. Zamyka Ryzyko #6 na warstwie, którą test-plan §2 (wiersz
#6) i §7 uzgodniły jako jedyną w zakresie: „jednostkowy (przypadki brzegowe zapytania
selekcji) — celowo nie integracyjny/e2e".

## Analiza stanu obecnego

- **„Zapytanie selekcji" nie jest zapytaniem SQL.** Składa się z pętli offsetowej
  `listUsers` w handlerze POST (`src/pages/api/admin/cleanup-inactive-accounts.ts:77-163`,
  poza zakresem) i **klasyfikacji per konto** przez dwie czyste funkcje w
  `src/lib/inactive-accounts.ts` (72 linie, zero importów, wstrzykiwalny `now: Date`).
- **Klasyfikatory są jedyną testowalną powierzchnią Fazy 4** — warstwa `tests/lib/`
  (§6.1 test-planu), środowisko `node`, zero mocka, brak Supabase w samych asercjach.
- **Żaden istniejący test nie dotyka `src/lib/inactive-accounts.ts`** (grep po `tests/`
  → 0 trafień). `tests/lib/` zawiera dziś tylko `fsrs.test.ts` (22 testy) — nowy plik
  będzie drugi.
- **Historia F1 (CRITICAL)** — pierwsza wersja `isInactiveForDeletion` kasowała każde
  nigdy-niezalogowane konto (`null last_sign_in_at` → natychmiastowe usunięcie). Fix:
  parametr `createdAt` jako fallback. Faza 4 zamraża to zachowanie testem
  charakteryzacyjnym.
- **`npm run lint` jest czerwony** (49 błędów w plikach `src/` spoza zakresu, m.in.
  `inactive-accounts.ts`, `cleanup-inactive-accounts.ts`). Weryfikacja lintu Fazy 4
  musi być zakresowana do nowego pliku: `npx eslint tests/lib/inactive-accounts.test.ts`.
  Nowy plik **nie może** dokładać naruszeń.
- **ESLint bez override dla `tests/**`**: pełny `strictTypeChecked`. `!` (non-null
  assertion) i `x as T` zawężające `null` są **zabronione** → wzorzec throwing-helper
  `toMs()` z `fsrs.test.ts:44-48`.

### Kluczowe odkrycia

- `src/lib/inactive-accounts.ts:8-9` — `DELETION_THRESHOLD_MONTHS = 24`,
  `WARNING_THRESHOLD_MONTHS = 23`.
- `src/lib/inactive-accounts.ts:18-37` — `isInactiveForDeletion(lastSignInAt, createdAt = null, now = new Date())`:
  `reference = lastSignInAt ?? createdAt`; `reference === null` → `true`;
  `Number.isNaN(...)` → `true`; `threshold = now` z `setMonth(getMonth() - 24)`
  (arytmetyka **kalendarzowa**); `return lastActivity.getTime() <= threshold.getTime()`
  (granica należy do „usuń").
- `src/lib/inactive-accounts.ts:50-72` — `isInWarningWindow(...)`: `null` → `false`;
  `NaN` → `false`; półotwarte okno `lastActivity <= (now − 23 mies.) && lastActivity > (now − 24 mies.)`;
  docstring (`:42-49`) gwarantuje wzajemną wykluczalność z `isInactiveForDeletion`.
- `tests/lib/fsrs.test.ts:1-48` — wzorzec warstwy: `import { describe, expect, it } from "vitest"`,
  SUT z `@/lib/...`, docblock `SCOPE` + `ZASADA ASERCJI`, zamrożony `const NOW` na
  poziomie modułu przekazywany jawnie do każdego wywołania, data-driven
  `for (const x of [...]) { it(...) }`, throwing-helper zamiast `!`/`as`.
- `vitest.config.ts:1-12` — `environment: "node"`, `include: ["tests/**/*.test.{ts,tsx}"]`
  (nowy plik łapany automatycznie), `globalSetup: ["tests/setup/global-setup.ts"]`
  (biegnie zawsze; wymaga `.env.test` — istnieje — i osiągalnego lokalnego Supabase; nie
  wymaga `db reset` ani danych w tabelach).
- Node 22 re-odczytuje `process.env.TZ` przy każdej operacji `Date` → ustawienie
  `process.env.TZ = "UTC"` na górze pliku testowego wystarcza do przypięcia strefy
  bez zmiany `vitest.config.ts` ani `setupFiles`.
- Wzorzec domykania fazy (`context/changes/study-fsrs-scheduling-integrity/plan.md:232-261`):
  faza kończy się **podfazą** aktualizującą `test-plan.md` §6, nie osobną fazą.

## Pożądany stan końcowy

`tests/lib/inactive-accounts.test.ts` istnieje i przechodzi. Zamraża:

1. **Kontrolę pozytywną** — aktywne konto nigdy nie jest ani usuwane, ani ostrzegane.
2. **Kierunek i przynależność** — konto starsze niż próg 24 mies. → „usuń"; konto w
   oknie 23–24 mies. → „ostrzeż"; nowsze → żadne.
3. **Wzajemną wykluczalność** — dla siatki wartości wokół obu granic dokładnie jedno z
   {usuń, ostrzeż, żadne}, **nigdy oba `true`** — łapie każdą przyszłą rozjazd stałych
   progów.
4. **Symetrię fallbacku `created_at`** — `last_sign_in_at = null` z `created_at = X`
   klasyfikuje się identycznie jak `last_sign_in_at = X`.
5. **Zachowanie fail-closed** — brak referencji (`null`/`null`) i niepoprawny znacznik
   (`NaN`) → `isInactiveForDeletion` `true` (regresja F1 zamrożona jako **celowy wybór
   projektowy**).
6. **Tolerancję arytmetyki kalendarzowej** — poślizg `setMonth` na końcu miesiąca /
   29 lutego udokumentowany jako akceptowany (±1–3 dni), nie usterka.
7. **Idempotencję** — klasyfikator wywołany dwukrotnie z tym samym `now` → identyczny
   wynik (bezpośrednia odpowiedź na „przy ponownym uruchomieniu" ze sformułowania
   Ryzyka #6).

`test-plan.md` §6.1 (placeholder Fazy 4) i §6.6 (nowy akapit „Faza 4") wypełnione.
Weryfikacja: `npx vitest run tests/lib/inactive-accounts.test.ts` zielony;
`npx eslint tests/lib/inactive-accounts.test.ts` → 0.

## Czego NIE robimy

- **Żadnego testu efektu ubocznego usuwania end-to-end** — dwuletnie zachowanie
  usuwania zadania czyszczącego jest jawnie w §7 negative-space (wywiad Fazy 2, Q5).
- **Żadnego testu endpointu** `src/pages/api/admin/cleanup-inactive-accounts.ts` —
  pętla `listUsers`, `deleteUser`, `signInWithOtp`, `updateUserById`, gałąź `dryRun`,
  auth `timingSafeEqual`, bramki `503`. `dryRun` nie zmienia klasyfikacji, tylko efekt
  uboczny — żaden test Fazy 4 go nie dotyka.
- **Żadnego testu dedupu e-maila ostrzegawczego** — marker
  `user_metadata.retention_warning_sent_at` żyje w endpointcie (`:118`), nie w czystej
  funkcji; `isInWarningWindow` sam o nim nie wie.
- **Żadnej naprawy luki cyklu życia markera** (patrz „Otwarte ryzyka") — to naprawa
  produkcyjna, nie test; poza zakresem Fazy 4.
- **Żadnej zmiany `src/`** ani `vitest.config.ts` — Faza 4 jest czysto testowa.
- **Żadnego re-odtwarzania `setMonth`** w asercjach (anty-wzorzec §6.1 pkt 4) —
  asertujemy właściwości (kierunek, przynależność, wykluczalność), nie liczby.

## Podejście do implementacji

Kopiuj strukturę `tests/lib/fsrs.test.ts` 1:1: docblock `SCOPE` (cytuje test-plan §3
Faza 4, Ryzyko #6) + `ZASADA ASERCJI` (właściwość, nie wartość; charakteryzacja
fail-closed jest jawnie oznaczona jako „celowy wybór F1, nie regresja"), zamrożony
`NOW` na poziomie modułu, throwing-helper do zawężania `string | null`, data-driven
`for...of` + `it()`.

`process.env.TZ = "UTC"` jest ustawione na górze pliku (pierwsza linia wykonywalna po
importach) z komentarzem wyjaśniającym, że Node 22 re-odczytuje tę zmienną i że
klasyfikatory liczą progi przez `setMonth` na lokalnym `Date`.

Wartości `NOW` i `lastActivity` w każdej grupie są wybrane w środku dnia i środku
miesiąca (np. `2026-06-15T12:00:00.000Z`), z wyjątkiem grupy „koniec miesiąca", która
celowo używa 31. dnia / 29 lutego. Asercje granic używają tolerancji ±3 dni (spójnej z
tolerancją dzienną self-healing z F4), nigdy porównania co do milisekundy.

## Krytyczne szczegóły implementacji

### Sekwencjonowanie i cykl życia

`process.env.TZ = "UTC"` musi być ustawione **przed** pierwszym wywołaniem dowolnej
funkcji SUT (czyli przed pierwszym `it()`), ale po importach. Umieść je jako pierwszą
instrukcję modułu po blokach `import`. Node 22 podnosi zmianę przy każdym `new Date()` /
`setMonth`, więc nie trzeba `setupFiles` ani restartu workerów.

### Specyfikacja tolerancji kalendarzowej

Klasyfikatory liczą `threshold` przez `new Date(now); threshold.setMonth(getMonth() - 24)`.
Dla `now` w 31. dniu miesiąca, gdy miesiąc `now − 24` (lub `− 23`) ma < 31 dni,
`setMonth` przeskakuje do początku następnego miesiąca (np. `2026-05-31` → próg liczony
od `2024-09-31` → `2024-10-01`, poślizg ~1 dnia). Test „koniec miesiąca" **dokumentuje
to jako akceptowane** komentarzem blokowym — mieści się w tolerancji dziennej cronu
(F4) — i asertuje wyłącznie kierunek (`lastActivity` wyraźnie starsza niż próg → `true`;
wyraźnie nowsza → `false`), z marginesem ≥ 3 dni po obu stronach granicy.

## Faza 1: Testy jednostkowe klasyfikatorów nieaktywności + podfaza §6.1

### Przegląd

Napisz `tests/lib/inactive-accounts.test.ts` pokrywający osiem grup zachowań brzegowych
obu klasyfikatorów, następnie wypełnij placeholdery `test-plan.md` §6.1 i §6.6 dla
Fazy 4.

### Wymagane zmiany

#### 1. Plik testu jednostkowego

**Plik**: `tests/lib/inactive-accounts.test.ts` (nowy)

**Cel**: Zamrozić zachowanie brzegowe `isInactiveForDeletion` i `isInWarningWindow` tak,
by każda przyszła regresja logiki selekcji (rozjazd stałych progów, utrata fallbacku
`created_at`, odwrócenie granicy, zmiana kierunku fail-closed) łamała test. Dowodzi
kryterium Ryzyka #6: „usuwa wyłącznie konta spełniające dokładny próg nieaktywności, a
aktywne konto nigdy nie zostaje dotknięte przy ponownym uruchomieniu".

**Kontrakt**: nowy plik w warstwie `tests/lib/` (§6.1). Import
`{ isInactiveForDeletion, isInWarningWindow } from "@/lib/inactive-accounts"`. Struktura
z `fsrs.test.ts`:

- Docblock modułu: `SCOPE (test-plan §3 Faza 4, Ryzyko #6)` + `ZASADA ASERCJI`
  (właściwość, nie wartość; nie odtwarzać `setMonth`; charakteryzacja fail-closed jawnie
  oznaczona „celowy wybór F1, NIE regresja do złamania przy poprawce").
- `process.env.TZ = "UTC";` — pierwsza instrukcja po importach, z komentarzem.
- `const NOW = new Date("2026-06-15T12:00:00.000Z");` na poziomie modułu, przekazywany
  jako 3. argument do **każdego** wywołania SUT.
- Helper `monthsBefore(now: Date, months: number, dayShift = 0): string` — zwraca ISO
  string `now` cofnięte o `months` (przez `setMonth`) i opcjonalnie `dayShift` dni;
  używany do budowania wejść „X miesięcy temu ± N dni". (Nie asertuje niczego — tylko
  konstruuje wejścia; nie jest re-implementacją SUT, bo SUT porównuje instanty, a helper
  tylko produkuje znaczniki.)
- Grupy `describe` (data-driven gdzie sensowne):
  1. **`describe("kontrola pozytywna — aktywne konto")`** — `last_sign_in_at` = wczoraj
     względem `NOW`: `isInactiveForDeletion` `false` ORAZ `isInWarningWindow` `false`.
  2. **`describe("isInactiveForDeletion — kierunek i granica 24 mies.")`** — dla
     `[monthsBefore(NOW, 24, -10), monthsBefore(NOW, 30)]` → `true`; dla
     `[monthsBefore(NOW, 24, +10), monthsBefore(NOW, 12)]` → `false`. Osobny `it`
     dokumentujący „granica należy do »usuń«": wejście ~na progu (margines ujemny kilku
     dni) → `true`.
  3. **`describe("isInWarningWindow — półotwarte okno (24 mies, 23 mies]")`** — wejście
     `monthsBefore(NOW, 23, -10)` → `true`; `monthsBefore(NOW, 24, +5)` (tuż wewnątrz od
     strony usunięcia) → `true`; `monthsBefore(NOW, 22)` (za młode) → `false`;
     `monthsBefore(NOW, 30)` (już do usunięcia) → `false`. W każdym przypadku asercja
     dopełniająca: `isInactiveForDeletion` daje wynik przeciwny/rozłączny.
  4. **`describe("wzajemna wykluczalność — siatka wokół obu granic")`** — dla siatki
     `for (const m of [12, 22, 22.8, 23, 23.5, 24, 24.5, 30])` (miesiące przez
     `monthsBefore`), zbuduj `[isInactiveForDeletion(x), isInWarningWindow(x)]` i
     asertuj: nigdy `[true, true]`; policz `true` w krotce ≤ 1. Dodatkowo dla wejść
     wyraźnie w każdej strefie — dokładnie jedno z {usuń, ostrzeż, żadne}. **To jest
     centralny test fazy** (research OQ3): łapie każdą zmianę `DELETION_THRESHOLD_MONTHS`
     / `WARNING_THRESHOLD_MONTHS`, która otworzyłaby lukę lub nakładkę między oknami
     (`plan-brief.md:82`).
  5. **`describe("symetria fallbacku created_at")`** — dla kilku wartości `v`:
     `isInactiveForDeletion(null, v, NOW) === isInactiveForDeletion(v, null, NOW)` oraz
     to samo dla `isInWarningWindow`. Osobny `it`: świeże `created_at` (miesiąc temu),
     `last_sign_in_at = null` → oba klasyfikatory `false`.
  6. **`describe("fail-closed — brak referencji i niepoprawny znacznik (charakteryzacja F1)")`**
     — komentarz blokowy: „dokumentujemy celowy wybór projektowy F1 (`inactive-accounts.ts:24-31`):
     brak referencji lub śmieciowy znacznik → traktuj jako do usunięcia. To NIE jest
     świadoma regresja — nie oczekujemy, że poprawka to zmieni." Przypadki:
     `isInactiveForDeletion(null, null, NOW)` → `true`;
     `isInactiveForDeletion("not-a-date", null, NOW)` → `true`;
     `isInactiveForDeletion("not-a-date", "also-bad", NOW)` → `true`;
     `isInWarningWindow(null, null, NOW)` → `false`;
     `isInWarningWindow("not-a-date", null, NOW)` → `false`.
  7. **`describe("tolerancja arytmetyki kalendarzowej — koniec miesiąca / 29 lutego")`**
     — komentarz blokowy: „poślizg `setMonth` ±1–3 dni na granicach miesięcy o różnej
     długości jest akceptowany (spójny z tolerancją dzienną self-healing F4); asertujemy
     tylko kierunek z marginesem ≥ 3 dni." Przypadki: `NOW_EOM = new Date("2026-05-31T12:00:00.000Z")`
     i `NOW_LEAP = new Date("2028-02-29T12:00:00.000Z")` (lokalne stałe grupy) —
     `lastActivity` = 25 miesięcy temu → `isInactiveForDeletion` `true`; `lastActivity`
     = 20 miesięcy temu → `false`; analogiczna para dla `isInWarningWindow`.
  8. **`describe("idempotencja / determinizm")`** — dla reprezentatywnego zestawu wejść
     (aktywne, w oknie ostrzeżenia, do usunięcia, `null`): dwa kolejne wywołania
     `isInactiveForDeletion(x, y, NOW)` zwracają identyczną wartość; to samo dla
     `isInWarningWindow`. Komentarz: „klasyfikator jest bezstanowy i re-wyprowadza wynik
     z wejścia przy każdym uruchomieniu — to jest »bezpieczeństwo przy ponownym
     uruchomieniu« z Ryzyka #6 na warstwie czystej funkcji."
- Ograniczenia ESLint: bez `!` / `as` zawężającego `null`; jeśli trzeba zawęzić wynik
  helpera, użyj throwing-helper jak `toMs` z `fsrs.test.ts`. `process.env.TZ` — przypisanie
  jest OK (żadna reguła tego nie blokuje). Uruchom `npx eslint` na pliku przed
  zamknięciem podfazy.

**Fragment** (jedyna nieoczywista część — przypięcie strefy + dlaczego wystarcza):

```ts
import { describe, expect, it } from "vitest";
import { isInactiveForDeletion, isInWarningWindow } from "@/lib/inactive-accounts";

// Klasyfikatory liczą próg przez `new Date(now).setMonth(getMonth() - 24)` — arytmetyka
// na LOKALNYCH polach Date. Node 22 re-odczytuje `process.env.TZ` przy każdej operacji
// Date, więc to jedno przypisanie przypina strefę dla całego pliku bez `setupFiles`.
process.env.TZ = "UTC";

const NOW = new Date("2026-06-15T12:00:00.000Z");
```

#### 2. Podfaza — wypełnij `test-plan.md` §6.1 i §6.6

**Plik**: `context/foundation/test-plan.md`

**Cel**: Zamienić placeholder `§3 Faza 4 … wciąż TBD` (koniec §6.1) na opis wzorca
przypadków brzegowych zapytania selekcji, oraz dodać akapit „Faza 4" w §6.6 — tak by
§6 czytało się jako kompletna „książka kucharska" dla Ryzyka #6 po tej fazie.

**Kontrakt**: sekcja `### 6.1 Dodawanie testu jednostkowego` (ostatni akapit) i sekcja
`### 6.6 Notatki per faza wdrożenia` (nowy akapit) w `test-plan.md`. §1–§5 **nietknięte**.
§4 „Stos" **nie wymaga** flagi `--refresh` — Faza 4 nie dodaje narzędzi ani `setupFiles`
(przypięcie strefy jest jednolinijkowe w pliku testu).

Treść §6.1 (zastępuje placeholder): lokalizacja `tests/lib/inactive-accounts.test.ts`;
`process.env.TZ = "UTC"` na górze (dlaczego); zamrożony `NOW`; siatka wzajemnej
wykluczalności jako centralna asercja właściwości (nigdy oba `true`, ≤ 1 `true` w
krotce); charakteryzacja fail-closed jawnie odróżniona od „świadomej regresji" (§6.4
pkt 7) — tu **nie** oczekujemy złamania przy poprawce; tolerancja kalendarzowa ±3 dni
zamiast porównania co do milisekundy; komenda `npx vitest run tests/lib/inactive-accounts.test.ts`.

Treść §6.6 (nowy akapit „**Faza 4 — Account-lifecycle safety net (Ryzyko #6).**"):
wskazanie na §6.1; zestaw = `tests/lib/inactive-accounts.test.ts` (osiem grup
`describe`); jawna notatka, że endpoint `cleanup-inactive-accounts.ts` pozostaje bez
testu celowo (§7) i że luka cyklu życia markera `retention_warning_sent_at` jest
odnotowana jako kandydat na osobny `/10x-new`, nie jako test.

#### 3. Podfaza — domknięcie change.md

**Plik**: `context/changes/account-lifecycle-safety-net/change.md`

**Cel**: Po zaimplementowaniu i zielonych testach — `status: implemented`, `updated`
na datę zamknięcia. (Wiersz §3 Faza 4 w `test-plan.md` przesuwa orchestrator
`/10x-test-plan` na następnym uruchomieniu.)

**Kontrakt**: frontmatter `change.md`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- [ ] Testy przechodzą: `npx vitest run tests/lib/inactive-accounts.test.ts`
- [ ] Nowy plik jest czysty w ESLint: `npx eslint tests/lib/inactive-accounts.test.ts` → 0 błędów
- [ ] Cała suita jednostkowa `tests/lib/` nadal zielona: `npx vitest run tests/lib/`
- [ ] Reszta zestawu bez regresji: `npm run test` (wymaga `npx supabase start` + `.env.test`)
- [ ] `test-plan.md` §6.1 nie zawiera już `TBD` dla Fazy 4; §6.6 ma akapit „Faza 4"

#### Weryfikacja ręczna

- [ ] Siatka wzajemnej wykluczalności faktycznie łamie się przy ręcznej zmianie
      `WARNING_THRESHOLD_MONTHS` na `24` w `src/lib/inactive-accounts.ts` (i wraca do
      zieleni po cofnięciu) — dowód, że test pilnuje spójności progów, nie tylko
      przechodzi
- [ ] Test charakteryzacji fail-closed czyta się jako „celowy wybór", nie jako „usterka
      do naprawienia" — komentarz nie sugeruje regresji
- [ ] §6.1 czyta się jako instrukcja użyteczna dla kogoś spoza tej sesji (osoba wie,
      gdzie dodać test dla nowej reguły retencji)

**Uwaga implementacyjna**: Po zielonych weryfikacjach automatycznych zatrzymaj się na
ręczne potwierdzenie (w szczególności test „mutacji progu" powyżej — wykonać go raz
ręcznie), zanim oznaczysz fazę jako `complete`.

## Strategia testowania

### Testy jednostkowe

- Osiem grup `describe` opisanych w Fazie 1 §1. Wszystkie na prawdziwych funkcjach z
  `@/lib/inactive-accounts` — zero mocka, zero Supabase w asercjach.
- Kluczowe przypadki brzegowe: granica 24 mies. (należy do „usuń"), półotwarte okno
  ostrzeżeń, `null`/`null`, `NaN` znacznik, fallback `created_at` (symetria), koniec
  miesiąca / 29 lutego (tolerancja), siatka wzajemnej wykluczalności, podwójne wywołanie
  (idempotencja).

### Testy integracyjne

- **Brak** — §7 negative-space. Endpoint `cleanup-inactive-accounts.ts` celowo bez
  testu integracyjnego/e2e.

### Kroki testowania ręcznego

1. `npx vitest run tests/lib/inactive-accounts.test.ts` — zielony.
2. Zmień `WARNING_THRESHOLD_MONTHS` z `23` na `24` w `src/lib/inactive-accounts.ts`;
   uruchom test ponownie — grupa „wzajemna wykluczalność" musi się złamać. Cofnij
   zmianę; test wraca do zieleni.
3. Przejrzyj komentarz blokowy grupy „fail-closed" — potwierdź, że mówi „celowy wybór",
   nie „znane ryzyko do złamania przy poprawce".
4. Przeczytaj zaktualizowaną §6.1 — potwierdź, że opisuje, jak dodać test dla nowej
   reguły progu retencji.

## Uwagi dotyczące wydajności

Brak. Osiem grup czystych funkcji — cały plik biegnie < 50 ms (por. `fsrs.test.ts`:
22 testy w 12 ms). `globalSetup` dolicza stały narzut niezależny od tego pliku.

## Uwagi dotyczące migracji

Brak — żadnych zmian schematu, danych ani kodu produkcyjnego.

## Referencje

- Powiązane badania: `context/changes/account-lifecycle-safety-net/research.md`
- Ryzyko #6 i wskazówki reagowania: `context/foundation/test-plan.md` §2 (wiersz #6),
  §3 (Faza 4), §6.1, §7
- Wzorzec warstwy jednostkowej: `context/foundation/test-plan.md` §6.1;
  żywy przykład `tests/lib/fsrs.test.ts:1-48`
- Wzorzec domykania fazy (podfaza §6): `context/changes/study-fsrs-scheduling-integrity/plan.md:232-261`
- SUT: `src/lib/inactive-accounts.ts:8-72`
- Historia F1 (regresja do zamrożenia): `context/archive/2026-08-04-account-deletion-retention/reviews/impl-review.md:23-40`

## Otwarte ryzyka i założenia

- **Luka cyklu życia markera `retention_warning_sent_at`** (research Open Question 1):
  marker nigdy nie jest czyszczony przy logowaniu → konto ostrzeżone → użytkownik
  loguje się (wychodzi z okna) → ~23 mies. później znów nieaktywne → `alreadyWarned`
  = `true` → drugi e-mail ostrzegawczy **stłumiony** → konto usunięte po 24 mies. **bez
  świeżego ostrzeżenia**. To realna luka guardrailu „prawo do bycia poinformowanym",
  ale leży w endpointcie (`cleanup-inactive-accounts.ts:118`), nie w czystej funkcji —
  **poza zakresem Fazy 4** (§7). Kandydat na osobny `/10x-new` (naprawa produkcyjna).
  Odnotowane tutaj i w §6.6; nie tworzymy pliku follow-up.
- **Założenie: Node 22 re-odczytuje `process.env.TZ` dynamicznie.** Zweryfikowane dla
  środowiska projektu (`.nvmrc` = v22.14.0). Gdyby CI kiedyś zeszło do Node < 13,
  przypięcie strefy w pliku przestałoby działać i grupa „koniec miesiąca" mogłaby stać
  się flaky — wtedy przenieść `TZ` do `setupFiles` (i wtedy flaga `--refresh` dla §4).
- **Założenie: lokalny Supabase jest dostępny przy `npm run test`.** `globalSetup` biegnie
  dla każdego pliku i tworzy użytkowników testowych. Pojedynczy plik
  (`npx vitest run tests/lib/inactive-accounts.test.ts`) też uruchamia `globalSetup`,
  ale nie dotyka żadnej tabeli.
- **Założenie: `npm run lint` pozostaje czerwony z powodu długu w `src/`.** Weryfikacja
  Fazy 4 jest zakresowana do `npx eslint tests/lib/inactive-accounts.test.ts`. Dług
  `src/` blokuje §3 Fazę 5, nie Fazę 4.

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po
> zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Testy jednostkowe klasyfikatorów nieaktywności + podfaza §6.1

#### Automatyczne

- [x] 1.1 Testy przechodzą: `npx vitest run tests/lib/inactive-accounts.test.ts` — ff09314
- [x] 1.2 Nowy plik czysty w ESLint: `npx eslint tests/lib/inactive-accounts.test.ts` → 0 błędów — ff09314
- [x] 1.3 Suita `tests/lib/` nadal zielona: `npx vitest run tests/lib/` — ff09314
- [x] 1.4 Reszta zestawu bez regresji: `npm run test` — ff09314
- [x] 1.5 `test-plan.md` §6.1 bez `TBD` dla Fazy 4; §6.6 ma akapit „Faza 4" — ff09314

#### Ręczne

- [x] 1.6 Test wzajemnej wykluczalności łamie się przy ręcznej zmianie `WARNING_THRESHOLD_MONTHS` → `24` i wraca po cofnięciu — ff09314
- [x] 1.7 Komentarz grupy „fail-closed" czyta się jako „celowy wybór", nie „usterka" — ff09314
- [x] 1.8 §6.1 czyta się jako instrukcja użyteczna dla osoby spoza sesji — ff09314
- [x] 1.9 `change.md` → `status: implemented`, `updated` zaktualizowane
