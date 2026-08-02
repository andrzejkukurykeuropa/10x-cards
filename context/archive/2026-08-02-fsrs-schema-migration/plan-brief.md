# Migracja schematu SRS z SM-2 na FSRS (F-04) — Krótki plan

> Pełny plan: `context/changes/fsrs-schema-migration/plan.md`
> Badania: `context/changes/study-session/research.md`

## Co i dlaczego

Refaktoryzujemy tabelę `flashcards` ze schematu SM-2 (F-03) na schemat zgodny z biblioteką `ts-fsrs` (FSRS v6), wybraną w badaniach dla S-04 (sesja nauki). SM-2 i FSRS mają niekompatybilne modele stanu karty — `easiness_factor`/`interval` nie mają odpowiednika pod FSRS, a `stability`, `difficulty`, `state`, `lapses`, `last_review` nie istnieją w obecnym schemacie.

## Punkt wyjścia

Tabela `flashcards` ma dziś pola SM-2 (`due_date`, `easiness_factor`, `interval`, `repetitions`) dodane w F-03. Żaden kod aplikacji jeszcze ich nie czyta ani nie zapisuje — S-04 (jedyny konsument) nie jest zaimplementowane, więc zmiana jest bezpieczna bez ryzyka regresji.

## Pożądany stan końcowy

Tabela `flashcards` ma pełny schemat FSRS gotowy do użycia przez S-04: nowy enum `fsrs_state`, kolumny `stability`, `difficulty`, `state`, `lapses`, `last_review`, `scheduled_days` z CHECK constraints, `due_date`/`repetitions` zachowane. Istniejące wiersze mają świeży stan "New" bez potrzeby dalszej migracji przed implementacją S-04.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Biblioteka SRS | `ts-fsrs` (FSRS v6) | Lepsza trafność powtórek niż SM-2, aktywna społeczność | Badania |
| `easiness_factor`/`interval` | Usunąć całkowicie | Żaden kod ich nie czyta — zero ryzyka, brak sensu utrzymywać martwe kolumny | Plan |
| Reprezentacja `state` | Natywny enum Postgres `fsrs_state` | DB-level walidacja 4 dyskretnych stanów FSRS | Plan |
| Wartości dla istniejących wierszy | Reset do świeżego stanu FSRS (state='New', stability=0, itd.) | Brak realnej historii powtórek do zachowania w MVP | Plan |
| Nazwa zastępująca `interval` | `scheduled_days` (zamiast przemianowania `interval`) | 1:1 z nazewnictwem `ts-fsrs` Card.scheduled_days | Plan |
| CHECK constraints | difficulty 0–10, stability ≥0, lapses ≥0 | Walidacja zakresów DB-level zanim powstanie kod S-04; zakres 0–10 (nie 1–10) dopuszcza świeże karty (`ts-fsrs` `createEmptyCard()` ustawia difficulty=0) | Plan |

## Zakres

**W zakresie:**
- Jedna migracja SQL: nowy enum, drop 2 kolumn SM-2, add 6 kolumn FSRS z constraints, reset istniejących wierszy
- Aktualizacja interfejsu `Flashcard` w `src/types.ts`

**Poza zakresem:**
- Instalacja pakietu `ts-fsrs` (zadanie S-04)
- Implementacja logiki algorytmu FSRS (S-04)
- Zmiany w endpointach API lub komponentach UI (S-04)
- Konwersja danych SM-2 na przybliżone wartości FSRS (zdecydowano reset zamiast konwersji)

## Architektura / Podejście

Jedna migracja SQL wykonuje wszystkie zmiany schematu atomowo (enum → drop → add → reset danych), po niej aktualizacja typu TypeScript. Ten sam wzorzec plików co F-03 (`supabase/migrations/YYYYMMDDHHmmss_<opis>.sql` + `src/types.ts`).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Migracja SQL | Nowy schemat FSRS w tabeli `flashcards` | Kolejność `CREATE TYPE` przed `ADD COLUMN` w tym samym pliku |
| 2. Typy TypeScript | `Flashcard` interfejs zgodny ze schematem | Brak — proste odzwierciedlenie kolumn |

**Wymagania wstępne:** F-03 (schemat SM-2) już wdrożony; dostęp do `npx supabase db push --linked`.
**Szacowany wysiłek:** ~1 sesja, 2 fazy (analogiczne do F-03).

## Otwarte ryzyka i założenia

- Zakłada się, że w bazie nie ma jeszcze realnych danych produkcyjnych wartych zachowania (MVP) — stąd reset zamiast konwersji SM-2→FSRS.
- CHECK constraint `difficulty BETWEEN 0 AND 10` (nie 1–10) jest założeniem opartym na zachowaniu `createEmptyCard()` w `ts-fsrs`; jeśli S-04 ujawni inny zakres wartości podczas implementacji, constraint może wymagać korekty w kolejnej migracji.

## Kryteria sukcesu (podsumowanie)

- `npx supabase db push --linked` stosuje migrację bez błędów, nowy schemat widoczny w Supabase Dashboard
- `npm run lint` przechodzi z zaktualizowanym `Flashcard` interfejsem
- Istniejące wiersze mają spójny, świeży stan FSRS gotowy do odczytu przez S-04
