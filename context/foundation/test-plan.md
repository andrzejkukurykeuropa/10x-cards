# Plan Testów

> Fazowe wdrożenie testów dla tego projektu. Strategia jest zamrożona na
> górze (§1–§5); wzorce podręcznika na dole (§6) uzupełniają się w miarę
> realizacji faz. Przeczytaj przed napisaniem jakiegokolwiek nowego testu.
>
> Odświeżenie: uruchom ponownie `/10x-test-plan --refresh`, gdy plan jest
> nieaktualny (patrz §8).
>
> Ostatnia aktualizacja: 2026-08-09

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
| 2 | Generowanie fiszek przez AI cicho przestaje działać (żądanie zawodzi, streaming się psuje lub zniekształcone propozycje docierają do UI przeglądu) | Wysoki | Średnie | wywiad Q1; PRD US-01/FR-003; roadmap F-02/S-02; hot-spot `src/pages/api/` (obszar generate-flashcards.ts) |
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
| #2 | Żądanie generowania zwraca dobrze uformowany zestaw propozycji pytanie/odpowiedź lub czysty, widoczny błąd — nigdy cichego zawieszenia lub zniekształconego payloadu docierającego do UI przeglądu | "Streaming happy-path w dev dowodzi, że edge runtime obsługuje wszystkie tryby awarii AI SDK (timeout, błąd dostawcy, częściowy stream)" | Kontrakt żądanie/odpowiedź `generate-flashcards.ts`, zachowanie streamingu na runtime Cloudflare Workers, kształty błędów dostawcy z `ai` SDK | integracyjny (mockowanie dostawcy AI na granicy sieci) | nadmierne mockowanie wewnętrznego streamingu `ai` SDK tak, że test nigdy nie ćwiczy prawdziwej granicy parsowania/streamingu |
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
| 2 | AI generation reliability | Wykrywanie cichych awarii w kontrakcie żądania/odpowiedzi generowania i streamingu | #2, #5 | integracyjne | not started | — |
| 3 | Study/FSRS scheduling integrity | Obrona poprawności stanu przeglądu i kolejności kart w silnie zmiennym obszarze nauki | #4 | jednostkowe + integracyjne | not started | — |
| 4 | Account-lifecycle safety net | Ograniczenie logiki selekcji zadania czyszczącego do uzgodnionego zakresu, z poszanowaniem negative-space w §7 | #6 | jednostkowe | not started | — |
| 5 | Quality-gates wiring | Zablokowanie jednostkowych + integracyjnych jako wymaganej bramy CI na każdym PR | przekrojowe | bramy | not started | — |

**Słownictwo statusów** (stałe): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

## 4. Stos

W tym projekcie nie istnieje dziś żadne narzędzie testowe —
`package.json` nie ma runnera testów, nie ma pliku konfiguracji testów ani
żadnych plików `*.test.*`/`*.spec.*` w całym repozytorium. To profil bazy
testowej `none`.

| Warstwa | Narzędzie | Wersja | Notatka |
|---|---|---|---|
| jednostkowe + integracyjne | brak jeszcze — patrz Faza 1 | — | Astro 6 + runtime Cloudflare Workers; Vitest jest domyślnym wyborem dla projektów Astro/Vite i działa z tą samą konfiguracją `astro:env` |
| mockowanie API | brak jeszcze — patrz Faza 2 | — | Mockuj dostawcę AI (`ai` SDK) i klienta Supabase na granicy sieci, nie wewnętrznie |
| e2e | brak jeszcze — nieuwzględnione w tym wdrożeniu | — | Żadna faza obecnie nie proponuje e2e; klasyczne + integracyjne pokrycie natywne dla AI oceniono jako wystarczające dla skali MVP |
| dostępność | brak jeszcze — nieuwzględnione w tym wdrożeniu | — | Poza zakresem tego wdrożenia; wrócić, jeśli pojawią się regresje UI |
| (opcjonalnie) natywne dla AI | nieocenione w tym wdrożeniu | n/a | Nie zaproponowano warstwy natywnej dla AI; koszt × sygnał nie uzasadnił jej przy obecnej skali |

**Narzędzia ugruntowania stosu (bieżąca sesja):**
- Dokumentacja: niedostępne w bieżącej sesji — brak MCP dokumentacji/Context7; powyższa rekomendacja opiera się wyłącznie na inspekcji lokalnych manifestów; sprawdzono: 2026-08-09
- Wyszukiwanie: niedostępne w bieżącej sesji — brak MCP Exa.ai/wyszukiwania webowego; sprawdzono: 2026-08-09
- Runtime/przeglądarka: nieużyte — brak narzędzia przeglądarki/Playwright MCP w tej sesji; sprawdzono: 2026-08-09
- Dostawca/platforma: nieużyte — brak MCP GitHub/Cloudflare/Supabase w tej sesji; sprawdzono: 2026-08-09

## 5. Bramy Jakości

| Brama | Gdzie | Wymagana? | Wykrywa |
|---|---|---|---|
| lint + typecheck | lokalnie + CI | wymagana (już okablowana) | dryf składniowy/typów |
| build | CI | wymagana (już okablowana) | błędy przerywające build |
| jednostkowe + integracyjne | lokalnie + CI | wymagana po §3 Faza 1 | regresje logiki i kontroli dostępu |
| e2e na ścieżkach krytycznych | — | nieplanowana w tym wdrożeniu | — |
| smoke test przed produkcją | — | nieplanowany w tym wdrożeniu | — |

## 6. Wzorce Podręcznika

Jak dodawać nowe testy w tym projekcie. Każda podsekcja jest wypełniana,
gdy odpowiednia faza wdrożenia zostanie zrealizowana; wcześniej podsekcja
zawiera "TBD — patrz §3 Faza N."

### 6.1 Dodawanie testu jednostkowego
- TBD — patrz §3 Faza 3 (wzorzec mapowania pól FSRS) oraz §3 Faza 4 (wzorzec przypadków brzegowych zapytania selekcji czyszczenia).

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

Uruchomienie: `npx supabase start` (raz), następnie `npm run test` (lub
`npx vitest run <plik>` dla pojedynczego pliku). Pełny przebieg od zera:
`npx supabase db reset && npm run test`.

### 6.3 Dodawanie testu e2e
- Nieuwzględnione w tym wdrożeniu — patrz §4.

### 6.4 Dodawanie testu dla nowego endpointu API
- TBD — patrz §3 Faza 2 dla wzorca żądanie/odpowiedź + mockowanie dostawcy dla endpointów opartych na AI.

### 6.5 Dodawanie testu dla nowej tabeli wspieranej przez Supabase RLS
- TBD — patrz §3 Faza 1 dla wzorca sprawdzania własności dwóch tożsamości.

### 6.6 Notatki per faza wdrożenia
(Wypełniane w miarę realizacji faz.)

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
