# Plan implementacji: Sesja nauki (S-04)

## Przegląd

Implementujemy `S-04: Sesja nauki z algorytmem SRS` — nową, chronioną stronę `/study`, na której zalogowany
użytkownik wybiera tryb sesji ("Do powtórki dziś" / "Wszystkie fiszki"), przegląda fiszki w losowej kolejności
(pytanie → odsłoń odpowiedź → ocena Again/Hard/Good/Easy wg `ts-fsrs`), a każda ocena aktualizuje harmonogram
powtórek fiszki w bazie danych. Sesja kończy się ekranem podsumowania.

## Analiza stanu obecnego

- Schemat DB (`flashcards`) jest już w pełni gotowy pod FSRS — F-03 i F-04 są `done`/zarchiwizowane. Kolumny:
  `due_date`, `stability`, `difficulty`, `state` (enum `fsrs_state`), `lapses`, `last_review`, `scheduled_days`,
  `repetitions` (patrz `supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql`).
- `src/types.ts` już definiuje `Flashcard`/`FlashcardDto` z pełnym zestawem pól FSRS — nie wymaga zmian poza
  dodaniem typów specyficznych dla sesji nauki.
- `ts-fsrs` **nie jest jeszcze zainstalowane** (brak w `package.json`).
- Istniejący `GET /api/flashcards` (`src/pages/api/flashcards.ts`) celowo zwraca tylko
  `id, question, answer, created_at, updated_at` — nie nadaje się do zasilenia sesji nauki (brak pól SRS).
  Potrzebny jest osobny endpoint kolejki.
- `POST /api/flashcards` (ten sam plik) wstawia nowe fiszki **bez ustawiania `due_date`** — dla nowo utworzonych
  fiszek `due_date` pozostaje `NULL`. To wpływa na zapytanie kolejki trybu "Do powtórki dziś" (patrz Krytyczne
  szczegóły implementacji).
- Wzorce do naśladowania: `src/pages/api/flashcards/[id].ts` (Zod + `createClient` + kody błędów 401/422/404/500/503),
  `src/components/FlashcardGenerator.tsx` (maszyna stanów jako discriminated union + `useRef` na aktualny stan do
  bezpiecznych async handlerów), `src/pages/dashboard.astro` (wzorzec strony chronionej + `Layout.astro`).
- `src/middleware.ts` chroni trasy przez `PROTECTED_ROUTES` — obecnie tylko `/dashboard`.
- Brak frameworka testowego w repozytorium (zero plików `*.test.*`) — weryfikacja jest wyłącznie automatyczna
  (lint/build) + ręczna.

### Kluczowe odkrycia:

- `supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql` — pełny zestaw kolumn FSRS już istnieje.
- `src/pages/api/flashcards.ts:44-46` — `POST` nie ustawia `due_date` przy tworzeniu fiszki → `NULL` dla nowych kart.
- `context/changes/study-session/ts-fsrs.md` — kontrakt `Card`/`CardInput`, `createEmptyCard()`, `fsrs()`/`repeat()`/`next()`.
- `ts-fsrs` `CardInput` wymaga pól `learning_steps` i `elapsed_days` (dziedziczone z `Card`), których nie ma w schemacie DB.

## Pożądany stan końcowy

Zalogowany użytkownik klika link "Rozpocznij naukę" na dashboardzie → trafia na `/study` → wybiera tryb →
widzi fiszki jedna po drugiej w losowej kolejności, ocenia każdą, a system trwale aktualizuje jej harmonogram
FSRS w DB (widoczne przy kolejnym wejściu: fiszki ocenione "Again" mają datę powtórki w niedalekiej przyszłości,
"Easy" — odleglejszą). Po ostatniej fiszce widzi podsumowanie sesji i wraca do dashboardu.

Weryfikacja: `npm run lint` i `npm run build` przechodzą; ręczne przejście pełnej sesji (oba tryby, w tym pusty stan)
w przeglądarce z lokalnym Supabase potwierdza poprawną aktualizację wierszy w tabeli `flashcards`.

## Czego NIE robimy

- Nie tworzymy tabeli/historii `ReviewLog` — `ts-fsrs` zwraca `log`, ale go nie utrwalamy (poza zakresem S-04/FR-011/012).
- Nie pokazujemy podglądu przewidywanych interwałów pod przyciskami ocen (`repeat()` pozostaje niewykorzystany).
- Nie zmieniamy zachowania `POST /api/flashcards` (tworzenie fiszek) — problem `due_date IS NULL` rozwiązujemy
  wyłącznie po stronie zapytania kolejki sesji nauki, nie w S-02/S-03.
- Nie dodajemy requeue "w locie" fiszek ocenionych "Again" w tej samej sesji — kolejka jest pobierana raz na start.
- Nie dodajemy paczki `@open-spaced-repetition/binding` (WASM optymalizator wag) — niepotrzebna i niewspierana na edge.
- Nie zmieniamy stylu/layoutu `dashboard.astro` poza dodaniem jednego linku (zgodnie z lekcją o scope creep w layoucie).

## Podejście do implementacji

Trzy fazy, każda budująca na poprzedniej: (1) warstwa domenowa mapująca wiersz DB ↔ `Card` z `ts-fsrs`,
(2) dwa endpointy API korzystające z tej warstwy, (3) UI konsumujące API. Wzorce Zod/`createClient`/kodów błędów
i maszyny stanów React są 1:1 przeniesione z istniejących S-01/S-02/S-03.

## Krytyczne szczegóły implementacji

- **Brakująca kolumna `learning_steps` / deprecated `elapsed_days`**: `ts-fsrs` `CardInput` wymaga obu pól, ale
  schemat DB (F-04) ich nie przechowuje. Rozwiązanie: skonfigurować scheduler z
  `generatorParameters({ enable_short_term: false })` (wyłącza logikę krótkoterminowych kroków nauki w minutach,
  więc `learning_steps` jest nieużywane funkcjonalnie) i zawsze mapować `learning_steps: 0`, `elapsed_days: 0` przy
  rekonstrukcji `CardInput` z wiersza DB. Bez tego karty w stanie `Learning`/`Relearning` byłyby planowane
  w interwałach minutowych zamiast dziennych, co nie pasuje do modelu sesji "raz na jakiś czas", a i tak nie
  mielibyśmy gdzie trwale zapisać postępu kroku między sesjami.
- **`due_date IS NULL` dla nowo utworzonych fiszek**: `POST /api/flashcards` nie ustawia `due_date`, więc nowe
  karty mają `due_date = NULL`. Zapytanie kolejki trybu "Do powtórki dziś" musi traktować `due_date IS NULL` jako
  "do powtórki teraz" (nowa karta, stan `New`) — filtr: `due_date.is.null OR due_date <= now()` (PostgREST `.or()`),
  a przy mapowaniu takiego wiersza na `CardInput` pole `due` ustawiane jest na `now()` (analogicznie do
  `createEmptyCard()`). Bez tej poprawki świeżo wygenerowane fiszki nigdy nie pojawiłyby się w trybie "Do powtórki dziś".

## Faza 1: Warstwa FSRS (mapowanie DB ↔ `ts-fsrs`)

### Przegląd

Dodajemy zależność `ts-fsrs` i moduł domenowy, który izoluje resztę aplikacji od szczegółów API biblioteki:
konwersję wiersza `flashcards` na `CardInput`, przeliczenie oceny przez scheduler i konwersję wyniku z powrotem
na pola do zapisania w DB. Rozszerzamy `types.ts` o typy specyficzne dla sesji nauki.

### Wymagane zmiany:

#### 1. Instalacja zależności

**Plik**: `package.json`

**Cel**: Dodać `ts-fsrs` jako zależność runtime (pakiet czysto TS/JS, bez API Node-specific — działa w Cloudflare
Workers, potwierdzone w `context/changes/study-session/ts-fsrs.md`).

**Kontrakt**: `npm install ts-fsrs` dodaje wpis do `dependencies`.

#### 2. Typy sesji nauki

**Plik**: `src/types.ts`

**Cel**: Dodać typy używane przez API i UI sesji nauki, spójne z istniejącym `FlashcardDto`.

**Kontrakt**: Dodać na końcu pliku:
```typescript
export type StudyMode = "due" | "all";
export type StudyRating = "again" | "hard" | "good" | "easy";

export interface SubmitReviewRequest {
  id: string;
  rating: StudyRating;
}
```

#### 3. Moduł mapujący FSRS

**Plik**: `src/lib/services/fsrs.ts` (nowy)

**Cel**: Ukryć szczegóły biblioteki `ts-fsrs` za trzema funkcjami: budowa `CardInput` z wiersza `Flashcard`,
przeliczenie oceny na nowy stan karty, konwersja wyniku na obiekt do `.update()` w Supabase. Jedno miejsce
odpowiedzialne za obie pułapki opisane w "Krytyczne szczegóły implementacji" (`learning_steps`/`elapsed_days`
oraz `due_date IS NULL` → `due: now`).

**Kontrakt**:
```typescript
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type CardInput, type Grade } from "ts-fsrs";
import type { Flashcard, StudyRating } from "@/types";

export const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

const RATING_TO_GRADE: Record<StudyRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

// row → CardInput: due_date NULL traktowany jak "teraz" (nowa karta); learning_steps/elapsed_days zawsze 0
// (nieużywane przy enable_short_term: false, brak kolumny w DB).
export function flashcardToCardInput(row: Pick<Flashcard, "due_date" | "stability" | "difficulty" |
  "scheduled_days" | "repetitions" | "lapses" | "state" | "last_review">, now: Date): CardInput;

// zastosowanie oceny użytkownika, zwraca pola gotowe do zapisu w tabeli flashcards
export function scheduleReview(
  row: Pick<Flashcard, "due_date" | "stability" | "difficulty" | "scheduled_days" | "repetitions" | "lapses" | "state" | "last_review">,
  rating: StudyRating,
  now: Date,
): Pick<Flashcard, "due_date" | "stability" | "difficulty" | "scheduled_days" | "repetitions" | "lapses" | "state" | "last_review">;
```
`scheduleReview` wywołuje `scheduler.next(flashcardToCardInput(row, now), now, RATING_TO_GRADE[rating])`, a
następnie mapuje `result.card` z powrotem: `due_date: card.due.toISOString()`, `repetitions: card.reps`,
`last_review: card.last_review ? card.last_review.toISOString() : null`, resztę pól 1:1 (`stability`,
`difficulty`, `state`, `lapses`, `scheduled_days`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi bez błędów
- `npx astro check` (lub `npm run build`) nie zgłasza błędów typów w nowych plikach

#### Weryfikacja ręczna:

- Ręczne wywołanie `scheduleReview` (np. z tymczasowego skryptu/REPL) dla świeżej karty (`due_date: null, state: "New", reps: 0, ...`) zwraca sensowne wartości (np. `state` zmienia się na `Learning`/`Review` w zależności od oceny, `due_date` w przyszłości)

**Uwaga implementacyjna**: Po zakończeniu tej fazy zatrzymaj się na ręczne potwierdzenie działania mapowania przed przejściem do Fazy 2.

---

## Faza 2: API sesji nauki

### Przegląd

Dwa nowe endpointy API korzystające z warstwy Fazy 1: pobranie kolejki fiszek do sesji oraz zapis oceny
pojedynczej fiszki z przeliczeniem harmonogramu.

### Wymagane zmiany:

#### 1. Endpoint kolejki sesji

**Plik**: `src/pages/api/study/queue.ts` (nowy)

**Cel**: Zwrócić fiszki zalogowanego użytkownika dla wybranego trybu sesji, z pełnym zestawem pól potrzebnych
UI i późniejszemu zapisowi oceny (SRS + treść).

**Kontrakt**: `GET /api/study/queue?mode=due|all`, `export const prerender = false`. Query param `mode`
walidowany przez `z.enum(["due", "all"]).catch("due")`. Auth przez `context.locals.user` (401 jeśli brak).
`createClient` jak w `flashcards.ts` (503 jeśli brak). Zapytanie:
`select("id, question, answer, due_date, stability, difficulty, state, lapses, last_review, scheduled_days, repetitions")`
filtrowane `.eq("user_id", user.id)`; dla `mode === "due"` dodatkowo
`.or(\`due_date.is.null,due_date.lte.${new Date().toISOString()}\`)` (patrz Krytyczne szczegóły implementacji —
`NULL` = nowa karta, traktowana jako do powtórki teraz). Limit `500` wierszy (analogicznie do `.limit(100)`
w istniejącym `GET /api/flashcards`, tu wyżej bo to źródło całej sesji). Kolejność zwracana przez zapytanie jest
nieistotna — losowanie kolejności odbywa się po stronie klienta (Faza 3). Błąd DB → 500; brak Supabase → 503.

#### 2. Endpoint zapisu oceny

**Plik**: `src/pages/api/study/review.ts` (nowy)

**Cel**: Przyjąć ocenę użytkownika dla jednej fiszki, przeliczyć nowy stan FSRS przez `scheduleReview` i
zapisać go w DB, zwracając zaktualizowaną fiszkę.

**Kontrakt**: `POST /api/study/review`, `export const prerender = false`. Body zgodne z `SubmitReviewRequest`,
walidacja Zod: `z.object({ id: z.uuid(), rating: z.enum(["again", "hard", "good", "easy"]) })`. Przepływ:
401 jeśli brak usera → parse JSON (422 przy błędzie) → walidacja Zod (422) → `SELECT` bieżącego wiersza po
`id` + `eq("user_id", user.id)` z tymi samymi kolumnami SRS co w kolejce (404 jeśli brak / `PGRST116`, wzorem
`[id].ts`) → `scheduleReview(row, rating, new Date())` → `UPDATE` tabeli `flashcards` zwróconymi polami,
`.eq("id", id).eq("user_id", user.id).select(...).single()` → 200 z zaktualizowaną fiszką (kolumny jak w
kolejce). Błędy DB → 500.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi
- `npm run build` przechodzi (wymaga `SUPABASE_URL`/`SUPABASE_KEY`)

#### Weryfikacja ręczna:

- `curl`/przeglądarka z aktywną sesją: `GET /api/study/queue?mode=all` zwraca fiszki zalogowanego użytkownika z polami SRS
- `GET /api/study/queue?mode=due` dla świeżo utworzonej fiszki (via S-02) zwraca ją mimo `due_date IS NULL`
- `POST /api/study/review` z poprawnym `id` i `rating: "good"` aktualizuje wiersz w DB (sprawdzić w Supabase Studio: `due_date` w przyszłości, `state` zmieniony, `repetitions` +1)
- Żądanie z `id` innego użytkownika lub nieistniejącym → 404 (weryfikacja RLS/filtra `user_id`)
- Nieprawidłowy `rating` → 422

**Uwaga implementacyjna**: Zatrzymaj się tutaj na ręczne potwierdzenie testów API (np. przez `curl` z ciasteczkiem sesji lub REST Client) przed przejściem do Fazy 3.

---

## Faza 3: UI sesji nauki

### Przegląd

Chroniona strona `/study` z komponentem React realizującym pełny przepływ: wybór trybu → ładowanie kolejki
(z losową kolejnością) → karta pytanie/odpowiedź z oceną → pusty stan → podsumowanie. Link wejściowy z dashboardu.

### Wymagane zmiany:

#### 1. Ochrona trasy

**Plik**: `src/middleware.ts`

**Cel**: Dodać `/study` do listy tras wymagających zalogowania, analogicznie do `/dashboard`.

**Kontrakt**: `const PROTECTED_ROUTES = ["/dashboard", "/study"];`

#### 2. Strona sesji nauki

**Plik**: `src/pages/study.astro` (nowy)

**Cel**: Strona-host dla komponentu React, w stylu wizualnym `dashboard.astro` (ten sam `Layout`, `bg-cosmic`,
kontener `max-w-*`), z linkiem powrotnym do dashboardu.

**Kontrakt**: Struktura analogiczna do `dashboard.astro`: `--- import Layout ... import StudySession ... ---`,
w treści nagłówek "Sesja nauki" + link `<a href="/dashboard">← Powrót do dashboardu</a>` + `<StudySession client:load />`.

#### 3. Link wejściowy z dashboardu

**Plik**: `src/pages/dashboard.astro`

**Cel**: Dodać jeden link/przycisk "Rozpocznij naukę" prowadzący do `/study`, bez zmiany istniejącego layoutu
kontenerów (zgodnie z lekcją o scope creep w layoucie — wyłącznie dodanie elementu, brak zmian klas istniejących kontenerów).

**Kontrakt**: Dodać `<a href="/study" class="...">Rozpocznij naukę</a>` w sekcji nagłówkowej, obok/pod istniejącym
powitaniem użytkownika, stylizowany spójnie z istniejącym przyciskiem "Sign out" (te same klasy `rounded-lg
border border-white/20 bg-white/10 ...`).

#### 4. Komponent sesji nauki

**Plik**: `src/components/StudySession.tsx` (nowy)

**Cel**: Maszyna stanów (discriminated union, wzorem `FlashcardGenerator.tsx`) obsługująca cały przepływ sesji.

**Kontrakt**:
```typescript
type SessionState =
  | { status: "mode-select" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty"; mode: StudyMode }
  | {
      status: "session";
      mode: StudyMode;
      queue: FlashcardDto[];
      index: number;
      revealed: boolean;
      submitting: boolean;
      submitError: string | null;
      ratingCounts: Record<StudyRating, number>;
    }
  | { status: "summary"; reviewed: number; ratingCounts: Record<StudyRating, number> };
```
Przepływ zdarzeń:
- `handleSelectMode(mode)`: `status: "loading"` → `fetch(\`/api/study/queue?mode=${mode}\`)` → jeśli pusta tablica:
  `status: "empty"`; w przeciwnym razie potasuj tablicę (Fisher–Yates) i przejdź do `status: "session"` z
  `index: 0, revealed: false, ratingCounts` wyzerowanym dla wszystkich 4 ocen.
- `handleReveal()`: ustawia `revealed: true` na bieżącym stanie sesji (pokazuje odpowiedź + 4 przyciski oceny).
- `handleRate(rating)`: `submitting: true` → `POST /api/study/review { id: queue[index].id, rating }` → sukces:
  inkrementuj `ratingCounts[rating]`; jeśli `index + 1 < queue.length` → następna karta (`index+1, revealed:false,
  submitting:false, submitError:null`); w przeciwnym razie → `status: "summary"` z `reviewed: queue.length` i
  `ratingCounts`. Błąd: `submitting:false, submitError` ustawiony, karta pozostaje widoczna do ponowienia.
- Ekran `empty`: komunikat zależny od `mode` ("Brak fiszek do powtórki dziś 🎉" dla `due` / "Kolekcja jest pusta"
  dla `all") + przycisk powrotu do wyboru trybu (`status: "mode-select"`) + link do `/dashboard`.
- Ekran `summary`: liczba przejrzanych fiszek + rozkład ocen (4 liczby) + przycisk "Powrót do dashboardu"
  (`window.location.href = "/dashboard"` lub `<a>`) + przycisk "Nowa sesja" (`status: "mode-select"`).
- Przyciski oceny renderowane wyłącznie 4 warianty bez podglądu interwałów (decyzja z rundy pytań) — użyć
  `Button` z `@/components/ui/button`, etykiety: "Again" / "Hard" / "Good" / "Easy" (spójne z nazwami `ts-fsrs`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Weryfikacja ręczna:

- Zalogowany użytkownik: link "Rozpocznij naukę" na `/dashboard` prowadzi do `/study`
- Niezalogowany użytkownik wchodzący na `/study` jest przekierowany do `/auth/signin`
- Wybór trybu "Wszystkie fiszki" pokazuje karty w losowej kolejności (różnej przy kolejnym uruchomieniu)
- Kliknięcie "Pokaż odpowiedź" odsłania odpowiedź i 4 przyciski oceny
- Ocena karty zapisuje się (weryfikacja w Supabase Studio) i przechodzi do kolejnej karty
- Po ostatniej karcie pojawia się ekran podsumowania z poprawną liczbą i rozkładem ocen
- Tryb "Do powtórki dziś" z pustą kolejką pokazuje pusty stan zamiast błędu
- Błąd sieci przy zapisie oceny pokazuje komunikat inline, umożliwia ponowienie bez utraty pozycji w kolejce

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się na ręczne potwierdzenie pełnego przejścia sesji (oba tryby + pusty stan) przed uznaniem S-04 za ukończone.

---

## Strategia testowania

### Testy jednostkowe:

Brak frameworka testowego w repozytorium — nie wprowadzamy go w ramach S-04 (poza zakresem). Poprawność logiki
mapowania FSRS weryfikowana ręcznie w Fazie 1.

### Testy integracyjne:

Brak — weryfikacja przez ręczne wywołania API (Faza 2) i pełny przepływ UI (Faza 3).

### Kroki testowania ręcznego:

1. Zaloguj się, wejdź na `/dashboard`, kliknij "Rozpocznij naukę".
2. Wybierz "Wszystkie fiszki", oceń kilka kart różnymi ocenami, potwierdź podsumowanie.
3. Sprawdź w Supabase Studio, że `due_date`, `stability`, `difficulty`, `state`, `lapses`, `repetitions`,
   `last_review` zaktualizowały się zgodnie z oceną.
4. Wróć do `/study`, wybierz "Do powtórki dziś" — karty ocenione na "Easy" (daleki `due_date`) nie powinny się
   pojawić; karty ocenione na "Again" (bliski `due_date`) powinny.
5. Utwórz nową fiszkę przez generator AI (S-02), natychmiast sprawdź tryb "Do powtórki dziś" — nowa fiszka
   (`due_date IS NULL`) musi się pojawić.
6. Wyloguj się, spróbuj wejść na `/study` bezpośrednio — oczekiwane przekierowanie do logowania.

## Uwagi dotyczące wydajności

Kolejka sesji ograniczona do 500 wierszy — wystarczające dla MVP jednego użytkownika; brak paginacji w v1.

## Uwagi dotyczące migracji

Brak migracji danych — schemat DB jest już gotowy (F-04, zarchiwizowane). Ta zmiana jest czysto aplikacyjna.

## Referencje

- Badanie bibliotek SRS: `context/changes/study-session/research.md`
- Dokumentacja `ts-fsrs`: `context/changes/study-session/ts-fsrs.md`
- Migracja schematu FSRS: `supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql`
- Wzorzec endpointu API: `src/pages/api/flashcards/[id].ts`
- Wzorzec maszyny stanów React: `src/components/FlashcardGenerator.tsx`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Warstwa FSRS (mapowanie DB ↔ ts-fsrs)

#### Automatyczne

- [x] 1.1 npm run lint przechodzi bez błędów — 670fbb8
- [x] 1.2 npx astro check (lub npm run build) nie zgłasza błędów typów w nowych plikach — 670fbb8

#### Ręczne

- [x] 1.3 Ręczne wywołanie scheduleReview dla świeżej karty zwraca sensowne wartości — 670fbb8

### Faza 2: API sesji nauki

#### Automatyczne

- [x] 2.1 npm run lint przechodzi — d26efad
- [x] 2.2 npm run build przechodzi — d26efad

#### Ręczne

- [x] 2.3 GET /api/study/queue?mode=all zwraca fiszki zalogowanego użytkownika z polami SRS — d26efad
- [x] 2.4 GET /api/study/queue?mode=due dla świeżo utworzonej fiszki zwraca ją mimo due_date IS NULL — d26efad
- [x] 2.5 POST /api/study/review z poprawnym id i rating aktualizuje wiersz w DB — d26efad
- [x] 2.6 Żądanie z id innego użytkownika lub nieistniejącym → 404 — d26efad
- [x] 2.7 Nieprawidłowy rating → 422 — d26efad

### Faza 3: UI sesji nauki

#### Automatyczne

- [x] 3.1 npm run lint przechodzi
- [x] 3.2 npm run build przechodzi

#### Ręczne

- [ ] 3.3 Link "Rozpocznij naukę" na /dashboard prowadzi do /study
- [ ] 3.4 Niezalogowany użytkownik wchodzący na /study jest przekierowany do /auth/signin
- [ ] 3.5 Tryb "Wszystkie fiszki" pokazuje karty w losowej kolejności
- [ ] 3.6 "Pokaż odpowiedź" odsłania odpowiedź i 4 przyciski oceny
- [ ] 3.7 Ocena karty zapisuje się i przechodzi do kolejnej karty
- [ ] 3.8 Ekran podsumowania pokazuje poprawną liczbę i rozkład ocen
- [ ] 3.9 Tryb "Do powtórki dziś" z pustą kolejką pokazuje pusty stan
- [ ] 3.10 Błąd sieci przy zapisie oceny pokazuje komunikat inline z możliwością ponowienia
