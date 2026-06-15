---
change_id: collection-view
roadmap_id: S-01
status: impl_reviewed
created: 2026-06-10
prd_refs:
  - FR-006
prerequisites:
  - flashcard-schema (F-01)
parallel_with:
  - ai-sdk-edge-spike (F-02)
---

# S-01: Przeglądanie kolekcji

## Wynik

Zalogowany użytkownik może zobaczyć listę swoich fiszek w kolekcji (lub pusty stan zachęcający do wygenerowania pierwszych). Widok dostępny z poziomu dashboardu.

## Zakres

- Strona/widok kolekcji fiszek (`/collection` lub analogicznie w dashboardzie)
- Lista kart: pytanie + odpowiedź per fiszka
- Pusty stan gdy brak fiszek (CTA do generowania)
- Dane pobierane z tabeli `flashcards` przez Supabase (RLS — tylko fiszki zalogowanego użytkownika)

## Poza zakresem tej zmiany

- Edycja / usuwanie fiszek → S-03
- Generowanie fiszek → S-02
- Akcje na fiszkach (accept/reject) → S-02

## Blokady

Brak.

## Niewiadome

Brak.

## Następny krok

Uruchom `/10x-plan` aby zaplanować implementację.
