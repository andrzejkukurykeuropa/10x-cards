# Plan implementacji F-03 — Schemat SM-2 w bazie danych

## Przegląd

Rozszerzamy tabelę `flashcards` o cztery pola algorytmu SM-2: `due_date`, `easiness_factor`, `interval`, `repetitions`. To fundament wymagany przez S-04 (sesja nauki). Zakres zmiany: jedna migracja SQL + rozszerzenie interfejsu TypeScript. Żadnych zmian w endpointach ani komponentach.

## Analiza stanu obecnego

- Tabela `flashcards` istnieje (`supabase/migrations/20260610000000_create_flashcards.sql`) z kolumnami: `id`, `user_id`, `question`, `answer`, `created_at`, `updated_at` — brak pól SM-2.
- `src/types.ts` eksportuje `Flashcard` i `FlashcardDto = Omit<Flashcard, 'user_id'>` — `FlashcardDto` zaktualizuje się automatycznie po rozszerzeniu `Flashcard`.
- Wzorzec migracji addytywnych: `ALTER TABLE ... ADD COLUMN` z DEFAULT dla istniejących wierszy; weryfikacja przez `npx supabase db push --linked`.
- Brak warstwy serwisowej — endpointy odpytują Supabase bezpośrednio; odczyt nowych pól SM-2 przez endpointy należy do S-04.

## Pożądany stan końcowy

Po zakończeniu planu tabela `flashcards` w Supabase zawiera 4 nowe kolumny SM-2 z właściwymi wartościami domyślnymi dla istniejących wierszy, indeks na `due_date` jest aktywny, a interfejs `Flashcard` w `src/types.ts` odzwierciedla nową strukturę. S-04 może od razu odczytywać i zapisywać pola SM-2 bez kolejnej migracji.

**Weryfikacja:** `npx supabase db push --linked` kończy się bez błędów; kolumny widoczne w Supabase Dashboard; `npm run lint` przechodzi.

### Kluczowe odkrycia

- Wzorzec migracji z F-01 (`supabase/migrations/YYYYMMDDHHmmss_<opis>.sql`) — stosujemy konsekwentnie.
- `FlashcardDto` jest definiowany jako `Omit<Flashcard, 'user_id'>` — dodanie pól do `Flashcard` automatycznie rozszerza DTO bez osobnych zmian.
- `due_date = NULL` oznacza fiszkę nigdy niepowtarzaną; S-04 będzie filtrować `WHERE due_date IS NULL OR due_date <= now()` dla trybu „Wszystkie fiszki" oraz `WHERE due_date <= now()` dla trybu „Do powtórki dziś".

## Czego NIE robimy

- Żadnych zmian w endpointach API — odczyt/zapis pól SM-2 należy do S-04.
- Żadnych zmian w komponentach UI — to S-04.
- Wyboru biblioteki SM-2 (ts-fsrs, supermemo itp.) — schemat jest niezależny od implementacji algorytmu.
- Logiki algorytmu SM-2 — wyłącznie schemat danych.
- Zmiany `FlashcardDto` na jawny zapis — dziedziczy przez `Omit`.

## Podejście do implementacji

Dwie sekwencyjne fazy: najpierw migracja SQL (fundament bazy), potem typy TypeScript (kontrakt warstwy aplikacji). Faza 2 jest szybka i zależy logicznie od Fazy 1 (typy odzwierciedlają schemat).

---

## Faza 1: Migracja SQL — pola SM-2 i indeks

### Przegląd

Tworzymy plik migracji `ALTER TABLE flashcards ADD COLUMN` dla czterech pól SM-2 oraz indeks na `due_date`. Istniejące wiersze otrzymują domyślne wartości (NULL dla `due_date`, 2.50 dla `easiness_factor`, 0 dla `interval` i `repetitions`).

### Wymagane zmiany

#### 1. Plik migracji SQL

**Plik**: `supabase/migrations/20260708000000_add_sm2_fields_to_flashcards.sql`

**Cel**: Addytywnie rozszerza tabelę `flashcards` o pola wymagane przez algorytm SM-2. Istniejące wiersze dostają wartości startowe odpowiadające „nigdy niepowtarzana fiszka". Indeks na `due_date` przygotowuje wydajne zapytania S-04.

**Kontrakt**:

```sql
ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS due_date          timestamptz        NULL,
  ADD COLUMN IF NOT EXISTS easiness_factor   NUMERIC(4,2)  NOT NULL DEFAULT 2.50,
  ADD COLUMN IF NOT EXISTS interval          integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repetitions       integer       NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS flashcards_due_date_idx ON flashcards (due_date);
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Migracja stosuje się bez błędów: `npx supabase db push --linked`

#### Weryfikacja ręczna

- Tabela `flashcards` w Supabase Dashboard → Table Editor pokazuje 4 nowe kolumny
- Kolumna `due_date` ma typ `timestamptz`, nullable
- Kolumna `easiness_factor` ma typ `numeric`, DEFAULT 2.50
- Indeks `flashcards_due_date_idx` widoczny w Database → Indexes

**Uwaga implementacyjna**: Po zakończeniu fazy i przejściu automatycznej weryfikacji, zatrzymaj się na ręczne potwierdzenie struktury w Supabase Dashboard przed przejściem do Fazy 2.

---

## Faza 2: Typy TypeScript — rozszerzenie interfejsu Flashcard

### Przegląd

Rozszerzamy interfejs `Flashcard` w `src/types.ts` o cztery nowe pola. `FlashcardDto` (zdefiniowany jako `Omit<Flashcard, 'user_id'>`) zaktualizuje się automatycznie — brak osobnych zmian DTO.

### Wymagane zmiany

#### 1. Interfejs Flashcard

**Plik**: `src/types.ts`

**Cel**: Dodaje cztery pola SM-2 do interfejsu `Flashcard`, odzwierciedlając nową strukturę tabeli. `due_date` jest nullable (wartość `null` oznacza „nigdy niepowtarzana").

**Kontrakt**: Interfejs `Flashcard` rozszerzony o:
```typescript
due_date: string | null;
easiness_factor: number;
interval: number;
repetitions: number;
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi bez błędów: `npm run lint`

#### Weryfikacja ręczna

- `src/types.ts` eksportuje `Flashcard` z czterema nowymi polami
- `FlashcardDto` (przez `Omit`) pośrednio zawiera nowe pola (brak `user_id`, reszta obecna)

---

## Strategia testowania

### Kroki testowania ręcznego

1. Po `npx supabase db push --linked` otwórz Supabase Dashboard → Table Editor → `flashcards`
2. Sprawdź, że kolumny `due_date`, `easiness_factor`, `interval`, `repetitions` istnieją z poprawnymi typami i DEFAULT
3. Wstaw testowy wiersz bez podawania pól SM-2 — sprawdź, że `due_date = NULL`, `easiness_factor = 2.50`, `interval = 0`, `repetitions = 0`
4. Sprawdź Database → Indexes: `flashcards_due_date_idx` istnieje na kolumnie `due_date`

## Uwagi dotyczące migracji

Migracja jest addytywna i niedestrukcyjna — istniejące wiersze otrzymują wartości DEFAULT, żadne dane nie są tracone. Rollback: ręczny `ALTER TABLE flashcards DROP COLUMN` dla każdej kolumny (nie dotyczy MVP).

## Referencje

- Roadmap: `context/foundation/roadmap.md` — F-03, S-04
- Poprzednia migracja (wzorzec): `supabase/migrations/20260610000000_create_flashcards.sql`
- Plan F-01 (wzorzec): `context/archive/2026-06-10-flashcard-schema/plan.md`
- Typy współdzielone: `src/types.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: SQL Migration — SM-2 fields and index

#### Automated

- [x] 1.1 Apply migration via `npx supabase db push --linked` without errors — f09bc39

#### Manual

- [x] 1.2 Verify 4 new columns visible in Supabase Dashboard → Table Editor — f09bc39
- [x] 1.3 Verify due_date is timestamptz and nullable, easiness_factor is numeric DEFAULT 2.50 — f09bc39
- [x] 1.4 Verify index flashcards_due_date_idx visible in Database → Indexes — f09bc39

### Phase 2: TypeScript types — extend Flashcard interface

#### Automated

- [x] 2.1 Lint passes: npm run lint — ada055f

#### Manual

- [x] 2.2 Verify Flashcard interface has 4 new SM-2 fields in src/types.ts — ada055f
