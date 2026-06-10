---
change_id: flashcard-schema
roadmap_id: F-01
status: implemented
created: 2026-06-10
updated: 2026-06-10
prd_refs:
  - Access Control
  - Guardrails
prerequisites: []
parallel_with:
  - ai-sdk-edge-spike (F-02)
unlocks:
  - collection-view (S-01)
  - ai-generation-flow (S-02)
---

# F-01: Schemat danych fiszek

## Wynik

Tabela `flashcards` istnieje w Supabase z poprawną migracją SQL i polityką RLS — każdy użytkownik widzi tylko własne fiszki. Gotowa do odczytu i zapisu przez kolejne fragmenty.

## Zakres

- Migracja SQL tworząca tabelę `flashcards` w `supabase/migrations/`
- Kolumny: `id`, `user_id`, `question`, `answer`, `created_at`, `updated_at`
- RLS włączone z politykami per operacja (SELECT, INSERT, UPDATE, DELETE) — każdy użytkownik widzi wyłącznie własne wiersze
- Klucz obcy `user_id` → `auth.users(id)` z `ON DELETE CASCADE`
- Shared type `Flashcard` w `src/types.ts`

## Poza zakresem tej zmiany

- Logika generowania fiszek → S-02
- UI przeglądania kolekcji → S-01
- Edycja / usuwanie fiszek → S-03

## Blokady

Brak.

## Niewiadome

Brak.

## Następny krok

Uruchom `/10x-plan flashcard-schema` aby zaplanować implementację.
