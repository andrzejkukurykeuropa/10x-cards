# Plan implementacji F-01 — Schemat danych fiszek

## Przegląd

Tworzymy fundament danych dla całej aplikacji: tabelę `flashcards` w Supabase z migracją SQL, politykami RLS per użytkownik i typem TypeScript `Flashcard` w `src/types.ts`. Ten fundament jest warunkiem wstępnym dla S-01 (przeglądanie kolekcji) i S-02 (generowanie AI).

## Analiza stanu obecnego

- `supabase/migrations/` — **nie istnieje**; trzeba stworzyć katalog i pierwszy plik migracji
- `src/types.ts` — **nie istnieje**; F-01 jest właścicielem jego stworzenia (S-01 plan błędnie zakładał jego tworzenie — F-01 go wyprzedza jako wymaganie wstępne)
- `supabase/config.toml` — istnieje; `project_id = "10x-astro-starter"`; projekt jest zlinkowany (`supabase/.temp/linked-project.json` istnieje)
- Klient Supabase SSR: `src/lib/supabase.ts` — gotowy do użycia przez endpointy

## Pożądany stan końcowy

Po zakończeniu tego planu:
- Tabela `flashcards` istnieje w zdalnej bazie Supabase z poprawnymi kolumnami, triggerem `updated_at` i włączonym RLS
- Każdy użytkownik widzi, wstawia, aktualizuje i usuwa wyłącznie własne wiersze (izolacja przez `user_id = auth.uid()`)
- `src/types.ts` eksportuje interfejs `Flashcard` używany przez S-01 i S-02

**Weryfikacja:** `npx supabase db push --linked` kończy się bez błędów; tabela widoczna w Supabase Dashboard z czterema politykami RLS.

### Kluczowe odkrycia

- S-01 (`context/changes/collection-view/plan.md`) definiuje dokładny kontrakt tabeli, który F-01 musi dostarczyć — schemat jest już ustalony
- Projekt jest zlinkowany ze zdalnym Supabase — weryfikacja przez `npx supabase db push --linked`
- Brak katalogu `supabase/migrations/` — `supabase db push` powinien obsłużyć go automatycznie lub stworzymy go ręcznie

## Czego NIE robimy

- Kolumna `source` (ai/manual) — defer do S-02 (F-01 jest minimalny)
- Endpoint API do pobierania fiszek → S-01
- UI kolekcji → S-01
- Logika generowania → S-02
- Edycja / usuwanie → S-03

## Podejście do implementacji

Dwie fazy bez zależności między sobą — można je implementować w dowolnej kolejności, ale logicznie: najpierw schemat (Faza 1), potem typ (Faza 2).

- **Faza 1**: Migracja SQL — tworzy tabelę, trigger i polityki RLS; aplikowana na zdalnym Supabase
- **Faza 2**: Typ TypeScript — `src/types.ts` z interfejsem `Flashcard` odzwierciedlającym schemat tabeli

## Faza 1: Migracja SQL — tabela i RLS

### Przegląd

Tworzymy plik migracji SQL w `supabase/migrations/` definiujący tabelę `flashcards` z kluczem obcym do `auth.users`, triggerem auto-aktualizującym `updated_at` oraz czterema politykami RLS izolującymi dane per użytkownik.

### Wymagane zmiany

#### 1. Plik migracji SQL

**Plik**: `supabase/migrations/20260610000000_create_flashcards.sql`

**Cel**: Tworzy tabelę `flashcards`, funkcję triggera `update_updated_at_column()` (jeśli nie istnieje), trigger na tabeli, włącza RLS i definiuje cztery polityki per-operacja izolujące dane użytkownika.

**Kontrakt**:

```sql
-- Funkcja triggera (idempotentna — CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela
CREATE TABLE IF NOT EXISTS flashcards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indeks na user_id (przyspieszenie zapytań filtrowanych przez RLS)
CREATE INDEX IF NOT EXISTS flashcards_user_id_idx ON flashcards(user_id);

-- Trigger updated_at
CREATE TRIGGER set_flashcards_updated_at
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flashcards"
  ON flashcards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flashcards"
  ON flashcards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flashcards"
  ON flashcards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own flashcards"
  ON flashcards FOR DELETE
  USING (auth.uid() = user_id);
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Migracja jest zaaplikowana bez błędów: `npx supabase db push --linked`

#### Weryfikacja ręczna

- Tabela `flashcards` widoczna w Supabase Dashboard → Table Editor
- Zakładka "RLS" tabeli pokazuje 4 aktywne polityki
- Trigger `set_flashcards_updated_at` widoczny w Database → Triggers

**Uwaga implementacyjna:** Po zakończeniu fazy i przejściu automatycznej weryfikacji, zatrzymaj się na ręczne potwierdzenie że migracja jest widoczna w Supabase Dashboard przed przejściem do Fazy 2.

---

## Faza 2: Typ TypeScript `Flashcard`

### Przegląd

Tworzymy `src/types.ts` z interfejsem `Flashcard` odzwierciedlającym schemat tabeli. To jest autorytatywna definicja używana przez S-01 (endpoint GET + komponent) i S-02 (zapis zaakceptowanych fiszek).

### Wymagane zmiany

#### 1. Plik typów współdzielonych

**Plik**: `src/types.ts`

**Cel**: Eksportuje interfejs `Flashcard` jako kontrakt między warstwą danych (Supabase) a warstwą aplikacji (endpointy, komponenty). Plik jest własnością F-01; kolejne zmiany (S-01, S-02) dodają własne typy do tego samego pliku.

**Kontrakt**:

```typescript
export interface Flashcard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`

#### Weryfikacja ręczna

- Plik `src/types.ts` istnieje i eksportuje `Flashcard`

---

## Strategia testowania

Brak testów jednostkowych dla samej migracji SQL (Supabase nie oferuje unit testów w ramach CLI w tym projekcie). Weryfikacja odbywa się przez:
1. Skuteczne zastosowanie migracji (`db push --linked` bez błędów)
2. Ręczne potwierdzenie struktury w Supabase Dashboard

## Referencje

- Roadmap: `context/foundation/roadmap.md` — F-01
- PRD: `context/foundation/prd.md` — Access Control, Guardrails
- Kontrakt tabeli oczekiwany przez S-01: `context/changes/collection-view/plan.md` § Wymagania wstępne
- Klient Supabase: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: SQL Migration — table and RLS

#### Automated

- [x] 1.1 Apply migration via `npx supabase db push --linked` without errors — 9036168

#### Manual

- [x] 1.2 Verify flashcards table visible in Supabase Dashboard → Table Editor — 9036168
- [x] 1.3 Verify 4 RLS policies active on flashcards table — 9036168
- [x] 1.4 Verify trigger set_flashcards_updated_at visible in Database → Triggers — 9036168

### Phase 2: TypeScript type

#### Automated

- [x] 2.1 Create src/types.ts with Flashcard interface
- [x] 2.2 Lint passes: npm run lint
