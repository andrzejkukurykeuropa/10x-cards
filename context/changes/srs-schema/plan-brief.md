# Add SM-2 fields to flashcards table — Krótki plan

> Pełny plan: `context/changes/srs-schema/plan.md`

## Co i dlaczego

Rozszerzamy tabelę `flashcards` o cztery pola algorytmu SM-2 (`due_date`, `easiness_factor`, `interval`, `repetitions`). To fundament wymagany przez S-04 (sesja nauki z powtórkami) — bez tych kolumn S-04 nie może planować harmonogramu ani zapisywać wyników sesji.

## Punkt wyjścia

Tabela `flashcards` istnieje z migracją F-01 i zawiera tylko pola treściowe (`question`, `answer`) oraz metadane (`created_at`, `updated_at`). Brak pól harmonogramowania SM-2.

## Pożądany stan końcowy

Po zakończeniu planu: tabela `flashcards` w Supabase zawiera 4 nowe kolumny SM-2 z właściwymi wartościami domyślnymi, indeks na `due_date` jest aktywny, a interfejs `Flashcard` w `src/types.ts` odzwierciedla nową strukturę. S-04 może od razu odczytywać i zapisywać pola SM-2.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| `due_date` domyślnie | NULL | Semantycznie poprawne — brak historii ≠ zaplanowane na dziś; S-04 obsługuje NULL jako „nigdy niepowtarzana" | Plan |
| Indeks na `due_date` | Tak, w tej samej migracji | S-04 będzie filtrować po `due_date` — lepiej mieć indeks od razu | Plan |
| Typ `easiness_factor` | NUMERIC(4,2) | Deterministyczne zaokrąglanie (2.50 zawsze to 2.50), brak floating-point niespodzianek | Plan |
| Zakres zmian typów | Tylko `Flashcard` | `FlashcardDto = Omit<Flashcard, 'user_id'>` — aktualizuje się automatycznie | Plan |

## Zakres

**W zakresie:**
- Migracja SQL: `ALTER TABLE flashcards ADD COLUMN` dla 4 pól SM-2
- Indeks `flashcards_due_date_idx` na `due_date`
- Rozszerzenie interfejsu `Flashcard` w `src/types.ts`

**Poza zakresem:**
- Zmiany w endpointach API — S-04
- Logika algorytmu SM-2 / wybór biblioteki — S-04
- Komponenty UI sesji nauki — S-04
- Jawna zmiana `FlashcardDto` (dziedziczy przez `Omit`)

## Architektura / Podejście

Addytywna migracja SQL (bez destrukcji istniejących danych) + rozszerzenie interfejsu TypeScript. Dwie krótkie fazy sekwencyjne: Faza 1 stosuje migrację, Faza 2 aktualizuje typy.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Migracja SQL | Kolumny SM-2 + indeks w bazie Supabase | Supabase CLI połączony ze środowiskiem dev — trzeba mieć działające `.dev.vars` |
| 2. Typy TypeScript | `Flashcard` rozszerzony o 4 pola SM-2 | Brak — zmiana mechaniczna |

**Wymagania wstępne:** F-01 ukończone (tabela `flashcards` istnieje); Supabase CLI zalogowane i projekt zlinkowany  
**Szacowany wysiłek:** ~1 sesja, 2 fazy

## Otwarte ryzyka i założenia

- `due_date IS NULL` musi być jawnie obsługiwane przez S-04 w zapytaniach (nie blokuje tej zmiany)
- Biblioteka SM-2 jest nieznana — schemat kolumn jest od niej niezależny (potwierdzono w roadmapie)

## Kryteria sukcesu (podsumowanie)

- `npx supabase db push --linked` kończy się bez błędów
- Cztery nowe kolumny widoczne w Supabase Dashboard z poprawnymi typami i DEFAULT
- `npm run lint` przechodzi po zmianie `src/types.ts`
