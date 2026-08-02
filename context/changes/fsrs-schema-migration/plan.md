# Plan implementacji — Migracja schematu SRS z SM-2 na FSRS (F-04)

## Przegląd

Refaktoryzujemy tabelę `flashcards` ze schematu SM-2 (F-03: `easiness_factor`, `interval`) na schemat zgodny z biblioteką `ts-fsrs` (FSRS v6): dodajemy `stability`, `difficulty`, `state` (nowy enum `fsrs_state`), `lapses`, `last_review`, `scheduled_days`. `due_date` i `repetitions` pozostają (mapowane 1:1 na `due`/`reps` z `ts-fsrs`). To fundament wymagany przez S-04 (sesja nauki), analogiczny w zakresie do F-03: wyłącznie migracja SQL + rozszerzenie interfejsu TypeScript, bez zmian w endpointach czy komponentach (żaden kod jeszcze nie odczytuje pól SRS — S-04 nie jest zaimplementowane).

## Analiza stanu obecnego

- Tabela `flashcards` (`supabase/migrations/20260610000000_create_flashcards.sql` + `20260708000000_add_sm2_fields_to_flashcards.sql`) ma pola SM-2: `due_date` (timestamptz, null), `easiness_factor` (numeric 4,2, default 2.50), `interval` (integer, default 0), `repetitions` (integer, default 0).
- `src/types.ts` → `Flashcard` interfejs odzwierciedla te pola 1:1; `FlashcardDto = Omit<Flashcard, "user_id">` dziedziczy automatycznie.
- Grep potwierdza: **żaden kod poza `types.ts` i migracją nie odczytuje/zapisuje** `easiness_factor`, `interval`, `repetitions`, `due_date` — S-04 (jedyny konsument) nie jest zaimplementowane. Bezpieczne do zmiany bez ryzyka regresji w działającym kodzie.
- `context/changes/study-session/research.md` już rozstrzygnęło wybór biblioteki (`ts-fsrs`, FSRS v6) i zmapowało pola `ts-fsrs` `Card` na wymaganą zmianę schematu.
- Baza nie używa jeszcze żadnego natywnego typu `ENUM` w migracjach — ten plan wprowadza pierwszy (`fsrs_state`).
- Wzorzec migracji: `supabase/migrations/YYYYMMDDHHmmss_<opis>.sql`, addytywne `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` z DEFAULT; weryfikacja przez `npx supabase db push --linked`.

## Pożądany stan końcowy

Tabela `flashcards` w Supabase nie zawiera już `easiness_factor` ani `interval`; zawiera nowy typ `fsrs_state` (enum) oraz kolumny `stability`, `difficulty`, `state`, `lapses`, `last_review`, `scheduled_days` z odpowiednimi CHECK constraints i wartościami domyślnymi. Istniejące wiersze mają świeży stan FSRS (`state='New'`, `stability=0`, `difficulty=0`, `lapses=0`, `last_review=NULL`, `scheduled_days=0`, `repetitions=0`, `due_date=now()`). Interfejs `Flashcard` w `src/types.ts` odzwierciedla nowy schemat. S-04 może od razu budować na tym schemacie bez kolejnej migracji.

**Weryfikacja:** `npx supabase db push --linked` kończy się bez błędów; nowe kolumny + enum widoczne w Supabase Dashboard; `npm run lint` przechodzi.

### Kluczowe odkrycia

- `ts-fsrs`'s `createEmptyCard()` inicjalizuje `difficulty: 0` dla nowych kart (przed pierwszą powtórką) — dopiero po pierwszej ocenie `difficulty` trafia w zakres 1–10. Dlatego CHECK constraint na `difficulty` musi dopuszczać `0` (`BETWEEN 0 AND 10`), inaczej reset istniejących wierszy do świeżego stanu naruszyłby własny constraint.
- Ponieważ `stability`, `difficulty`, `state`, `lapses`, `last_review`, `scheduled_days` to **nowe** kolumny dodawane z `DEFAULT`, Postgres automatycznie wypełni istniejące wiersze wartością domyślną przy `ADD COLUMN NOT NULL DEFAULT x` — nie potrzeba osobnego `UPDATE` dla tych pól. Jawny `UPDATE` jest potrzebny tylko dla **istniejących** kolumn `repetitions` i `due_date`, które reset do świeżego stanu wymaga nadpisania ich obecnych wartości.
- `CREATE TYPE ... AS ENUM` nie wspiera `IF NOT EXISTS` — idempotencja wymaga bloku `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '...') THEN CREATE TYPE ... END IF; END$$;` (ten sam styl idempotencji co funkcja triggera w `20260610000000_create_flashcards.sql`).

## Czego NIE robimy

- Żadnych zmian w endpointach API ani komponentach UI — to S-04.
- Wyboru czy implementacji logiki algorytmu FSRS (`ts-fsrs` biblioteka) — wyłącznie schemat danych.
- Instalacji pakietu `ts-fsrs` jako zależności npm — to zadanie S-04.
- Migracji/konwersji istniejących danych SM-2 na przybliżone wartości FSRS — zdecydowano reset do świeżego stanu.
- Zachowania kolumn `easiness_factor`/`interval` dla rollbacku — zdecydowano ich usunięcie.

## Podejście do implementacji

Jedna migracja SQL wykonująca wszystkie zmiany schematu atomowo (nowy typ enum, drop starych kolumn, add nowych kolumn z constraints, reset istniejących wierszy), po niej aktualizacja interfejsu TypeScript. Dwie sekwencyjne fazy — Faza 2 zależy logicznie od Fazy 1 (typy odzwierciedlają schemat).

## Krytyczne szczegóły implementacji

- **Kolejność w migracji ma znaczenie**: `CREATE TYPE fsrs_state` musi wykonać się PRZED `ALTER TABLE ... ADD COLUMN state fsrs_state ...` w tym samym pliku — Postgres wymaga, by typ istniał przed użyciem w definicji kolumny.

---

## Faza 1: Migracja SQL — schemat FSRS

### Przegląd

Tworzymy plik migracji, który: (1) tworzy enum `fsrs_state` idempotentnie, (2) usuwa `easiness_factor` i `interval`, (3) dodaje `stability`, `difficulty`, `state`, `lapses`, `last_review`, `scheduled_days` z CHECK constraints i wartościami domyślnymi, (4) resetuje istniejące wiersze (`repetitions`, `due_date`) do świeżego stanu FSRS.

### Wymagane zmiany:

#### 1. Plik migracji SQL

**Plik**: `supabase/migrations/20260802000000_migrate_flashcards_sm2_to_fsrs.sql`

**Cel**: Refaktoryzuje tabelę `flashcards` ze schematu SM-2 na schemat FSRS zgodny z `ts-fsrs`. Usuwa pola, które tracą sens pod FSRS (`easiness_factor`, `interval`), dodaje nowe pola stanu karty FSRS, i resetuje istniejące wiersze do stanu "New" (brak historii powtórek do zachowania w MVP).

**Kontrakt**:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fsrs_state') THEN
    CREATE TYPE fsrs_state AS ENUM ('New', 'Learning', 'Review', 'Relearning');
  END IF;
END$$;

ALTER TABLE flashcards
  DROP COLUMN IF EXISTS easiness_factor,
  DROP COLUMN IF EXISTS interval,
  ADD COLUMN IF NOT EXISTS stability      double precision NOT NULL DEFAULT 0 CHECK (stability >= 0),
  ADD COLUMN IF NOT EXISTS difficulty     double precision NOT NULL DEFAULT 0 CHECK (difficulty >= 0 AND difficulty <= 10),
  ADD COLUMN IF NOT EXISTS state          fsrs_state NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS lapses         integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  ADD COLUMN IF NOT EXISTS last_review    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS scheduled_days integer NOT NULL DEFAULT 0;

-- Reset existing rows to a fresh FSRS state (no SM-2 review history worth preserving in MVP)
UPDATE flashcards
SET repetitions = 0,
    due_date = now();
```

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Migracja stosuje się bez błędów: `npx supabase db push --linked`

#### Weryfikacja ręczna:

- Tabela `flashcards` w Supabase Dashboard → Table Editor nie zawiera już `easiness_factor` ani `interval`
- Kolumny `stability`, `difficulty`, `state`, `lapses`, `last_review`, `scheduled_days` widoczne z poprawnymi typami i DEFAULT
- Typ enum `fsrs_state` widoczny w Database → Types z wartościami `New`, `Learning`, `Review`, `Relearning`
- Istniejący (testowy) wiersz ma `state='New'`, `stability=0`, `difficulty=0`, `lapses=0`, `last_review=NULL`, `scheduled_days=0`, `repetitions=0`, `due_date` ≈ teraz
- Próba wstawienia `difficulty=11` lub `stability=-1` kończy się błędem CHECK constraint

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu automatycznej weryfikacji, zatrzymaj się na ręczne potwierdzenie struktury w Supabase Dashboard przed przejściem do Fazy 2.

---

## Faza 2: Typy TypeScript — aktualizacja interfejsu Flashcard

### Przegląd

Aktualizujemy interfejs `Flashcard` w `src/types.ts`, usuwając `easiness_factor` i `interval`, dodając nowe pola FSRS. `FlashcardDto` (przez `Omit<Flashcard, "user_id">`) aktualizuje się automatycznie.

### Wymagane zmiany:

#### 1. Interfejs Flashcard

**Plik**: `src/types.ts`

**Cel**: Odzwierciedla nowy schemat FSRS tabeli `flashcards` w warstwie typów aplikacji — usuwa pola SM-2, dodaje pola stanu karty FSRS z typami zgodnymi z `ts-fsrs` `Card`.

**Kontrakt**: Interfejs `Flashcard` traci `easiness_factor: number` i `interval: number`; zyskuje:

```typescript
stability: number;
difficulty: number;
state: "New" | "Learning" | "Review" | "Relearning";
lapses: number;
last_review: string | null;
scheduled_days: number;
```

`due_date: string | null` i `repetitions: number` pozostają bez zmian.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi bez błędów: `npm run lint`

#### Weryfikacja ręczna:

- `src/types.ts` eksportuje `Flashcard` bez `easiness_factor`/`interval`, z sześcioma polami FSRS opisanymi wyżej
- `FlashcardDto` (przez `Omit`) pośrednio zawiera nowe pola (brak `user_id`, reszta obecna)

---

## Strategia testowania

### Testy jednostkowe:

- Brak — zmiana wyłącznie schematu/typów, brak logiki biznesowej do testowania jednostkowo w tym planie.

### Testy integracyjne:

- Brak — S-04 (jedyny konsument tych pól) nie jest jeszcze zaimplementowane.

### Kroki testowania ręcznego:

1. Po `npx supabase db push --linked` otwórz Supabase Dashboard → Table Editor → `flashcards`
2. Sprawdź brak kolumn `easiness_factor`, `interval`
3. Sprawdź obecność i typy kolumn `stability` (double precision), `difficulty` (double precision), `state` (fsrs_state), `lapses` (integer), `last_review` (timestamptz, null), `scheduled_days` (integer)
4. Sprawdź Database → Types: enum `fsrs_state` z wartościami `New`, `Learning`, `Review`, `Relearning`
5. Sprawdź istniejący wiersz testowy: `state='New'`, `stability=0`, `difficulty=0`, `lapses=0`, `last_review=NULL`, `scheduled_days=0`, `repetitions=0`, `due_date` ≈ czas migracji
6. Spróbuj ręcznie wstawić/zaktualizować wiersz z `difficulty=11` lub `stability=-1` — oczekiwany błąd CHECK constraint

## Uwagi dotyczące wydajności

Brak nowych indeksów potrzebnych w tym planie — istniejący `flashcards_due_date_idx` (z F-03) pozostaje wystarczający dla zapytań S-04 filtrujących po `due_date`.

## Uwagi dotyczące migracji

Migracja jest częściowo destrukcyjna (usuwa `easiness_factor`, `interval`) — świadoma decyzja, ponieważ żaden kod nie czyta tych pól. Rollback: ręczne odtworzenie kolumn SM-2 (`ALTER TABLE flashcards ADD COLUMN easiness_factor ...`) i ręczne `DROP TYPE fsrs_state` + `DROP COLUMN` dla pól FSRS (nie dotyczy MVP — brak realnych danych do zachowania).

## Referencje

- Roadmap: `context/foundation/roadmap.md` — F-04, S-04
- Badania: `context/changes/study-session/research.md` (mapowanie pól `ts-fsrs` Card → schemat SQL)
- Poprzednia migracja (wzorzec): `supabase/migrations/20260708000000_add_sm2_fields_to_flashcards.sql`
- Archiwalny plan F-03 (wzorzec fazowania): `context/archive/2026-07-08-srs-schema/plan.md`
- Typy współdzielone: `src/types.ts`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Migracja SQL — schemat FSRS

#### Automatyczne

- [x] 1.1 Migracja stosuje się bez błędów: npx supabase db push --linked

#### Ręczne

- [x] 1.2 Tabela flashcards nie zawiera już easiness_factor ani interval
- [x] 1.3 Kolumny stability, difficulty, state, lapses, last_review, scheduled_days widoczne z poprawnymi typami i DEFAULT
- [x] 1.4 Typ enum fsrs_state widoczny z wartościami New, Learning, Review, Relearning
- [x] 1.5 Istniejący wiersz testowy ma świeży stan FSRS (state='New', stability=0, difficulty=0, lapses=0, last_review=NULL, scheduled_days=0, repetitions=0, due_date ≈ teraz)
- [x] 1.6 Próba wstawienia difficulty=11 lub stability=-1 kończy się błędem CHECK constraint

### Faza 2: Typy TypeScript — aktualizacja interfejsu Flashcard

#### Automatyczne

- [ ] 2.1 Lint przechodzi bez błędów: npm run lint

#### Ręczne

- [ ] 2.2 Flashcard interfejs bez easiness_factor/interval, z sześcioma nowymi polami FSRS w src/types.ts
- [ ] 2.3 FlashcardDto (przez Omit) pośrednio zawiera nowe pola
