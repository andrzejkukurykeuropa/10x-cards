# Sesja nauki (S-04) — Krótki plan

> Pełny plan: `context/changes/study-session/plan.md`
> Badania: `context/changes/study-session/research.md`, `context/changes/study-session/ts-fsrs.md`

## Co i dlaczego

Budujemy S-04: stronę sesji nauki, w której użytkownik ocenia swoje fiszki wg algorytmu FSRS (`ts-fsrs`), a
system aktualizuje ich harmonogram powtórek. To domyka pętlę SRS zapowiedzianą przez fundamenty F-03/F-04.

## Punkt wyjścia

Schemat DB (`flashcards`) jest już w pełni gotowy pod FSRS — F-04 (migracja SM-2→FSRS) jest zarchiwizowana.
`ts-fsrs` nie jest jeszcze zainstalowane. Istnieje wzorzec chronionej strony (`dashboard.astro`), wzorzec API
(`/api/flashcards`, `/api/flashcards/[id]`) i wzorzec maszyny stanów React (`FlashcardGenerator.tsx`) — S-04
konsekwentnie je powiela.

## Pożądany stan końcowy

Zalogowany użytkownik klika "Rozpocznij naukę" na dashboardzie, wybiera tryb ("Do powtórki dziś" / "Wszystkie
fiszki"), przechodzi przez losowo potasowane fiszki (pytanie → odsłoń odpowiedź → ocena Again/Hard/Good/Easy),
a każda ocena trwale aktualizuje harmonogram FSRS fiszki w bazie. Na koniec widzi podsumowanie sesji.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Biblioteka SRS | `ts-fsrs` (FSRS v6) | Lepsza trafność niż SM-2, schemat DB już dostosowany przez F-04 | Badania |
| Wejście do sesji | Osobna strona `/study` z linkiem z dashboardu | Czysta separacja trasy, łatwa ochrona w middleware | Plan |
| Wybór trybu | Ekran wyboru przed sesją (2 duże przyciski) | Jasny, jednorazowy wybór bez utraty kontekstu w trakcie | Plan |
| Odsłanianie odpowiedzi | Przycisk "Pokaż odpowiedź" | Prostsze i bardziej dostępne niż flip karty | Plan |
| Kolejność kart | Losowa (shuffle) na starcie sesji | Unika efektu "zawsze te same karty pierwsze" | Plan |
| Koniec sesji | Ekran podsumowania (liczba + rozkład ocen) | Domyka pętlę, daje poczucie ukończenia | Plan |
| Podgląd interwałów pod ocenami | Brak — tylko 4 przyciski oceny | Prostsze, mniej wywołań schedulera, brak wymogu od użytkownika | Plan |
| `learning_steps`/`elapsed_days` (brak kolumn DB) | `enable_short_term: false` + zawsze `0` | Brak persystencji tych pól w DB; wyłączenie logiki minutowej czyni je nieistotnymi | Plan |
| `due_date IS NULL` dla nowych fiszek | Traktowane jako "do powtórki teraz" w zapytaniu kolejki | `POST /api/flashcards` nie ustawia `due_date`; bez tej poprawki nowe fiszki nigdy nie trafią do trybu "due" | Plan |

## Zakres

**W zakresie:**
- Strona `/study` (chroniona) + komponent `StudySession.tsx`
- `GET /api/study/queue?mode=due|all`, `POST /api/study/review`
- Moduł mapujący `src/lib/services/fsrs.ts` (DB ↔ `ts-fsrs` `Card`)
- Link "Rozpocznij naukę" na dashboardzie

**Poza zakresem:**
- Tabela/historia `ReviewLog`
- Podgląd przewidywanych interwałów (`repeat()`)
- Requeue "Again" w tej samej sesji
- Zmiany w `POST /api/flashcards` (tworzenie fiszek)
- Testy automatyczne (brak frameworka w repo)

## Architektura / Podejście

`src/lib/services/fsrs.ts` izoluje resztę aplikacji od API `ts-fsrs`: `flashcardToCardInput()` mapuje wiersz DB
na `CardInput` scheduler'a (z domyślnymi `learning_steps: 0`, `due: now` gdy `due_date IS NULL`), a
`scheduleReview()` przelicza ocenę i zwraca pola gotowe do `.update()`. Dwa endpointy API (`queue`, `review`)
korzystają z tej warstwy i istniejącego wzorca `createClient`/Zod z `/api/flashcards*`. UI to jeden komponent
React (`StudySession.tsx`) jako maszyna stanów: `mode-select → loading → session → summary` (+ `empty`/`error`).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Warstwa FSRS | Instalacja `ts-fsrs` + mapowanie DB↔`Card` | Błędne mapowanie `learning_steps`/`due_date IS NULL` psuje harmonogram po cichu |
| 2. API sesji nauki | `GET /api/study/queue`, `POST /api/study/review` | Filtr `due_date IS NULL OR <= now` źle złożony (PostgREST `.or()`) pomija nowe karty |
| 3. UI sesji nauki | Strona `/study` + `StudySession.tsx` + link z dashboardu | Utrata pozycji w kolejce przy błędzie sieci podczas oceny |

**Wymagania wstępne:** F-04 (gotowe, zarchiwizowane); lokalny Supabase z fiszkami do ręcznych testów.
**Szacowany wysiłek:** ~1 sesja implementacyjna w 3 fazach.

## Otwarte ryzyka i założenia

- Zakładamy, że wyłączenie `enable_short_term` nie pogarsza jakości harmonogramu na tyle, by wymagało to
  osobnej decyzji produktowej — to uproszczenie akceptowalne dla MVP (sesje raz na dzień, nie co kilka minut).
- Filtr `due_date IS NULL OR due_date <= now()` w PostgREST (`.or()`) wymaga starannej składni — zweryfikować
  ręcznie w Fazie 2, że nie zwraca zbyt szerokiego/wąskiego zbioru.

## Kryteria sukcesu (podsumowanie)

- Użytkownik przechodzi pełną sesję nauki w obu trybach i widzi zaktualizowany harmonogram w DB
- Nowo utworzone fiszki natychmiast pojawiają się w trybie "Do powtórki dziś"
- `npm run lint` i `npm run build` przechodzą bez błędów
