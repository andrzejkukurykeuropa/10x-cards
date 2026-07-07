# Edit and delete flashcards in the collection — Krótki plan

> Pełny plan: `context/changes/collection-edit-delete/plan.md`

## Co i dlaczego

Użytkownik może edytować treść fiszek i je usuwać bezpośrednio w kolekcji. Brakuje tych akcji po zapisaniu fiszek — dziś kolekcja jest tylko do odczytu. Zmiana domyka S-03 z roadmapy (FR-007, FR-008).

## Punkt wyjścia

DB (tabela `flashcards`, RLS) już obsługuje UPDATE i DELETE dla właściciela. Brakuje warstwy API (PATCH/DELETE) i UI (przyciski + inline formularz). `FlashcardGenerator.tsx` ma gotowy wzorzec inline edit dla propozycji AI.

## Pożądany stan końcowy

Każda karta w kolekcji ma przyciski Edytuj i Usuń. Edycja zamienia kartę w formularz (inline), usuwanie pyta o potwierdzenie inline. Po operacji lista odświeża się automatycznie. Żadnych modali, żadnych nowych bibliotek.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| UX edycji | Inline edit (karta → formularz) | Spójny z istniejącym wzorcem w FlashcardGenerator | Plan |
| Potwierdzenie delete | Inline "Na pewno? Tak / Nie" | Zero nowych komponentów, wystarczające dla MVP | Plan |
| Stan UI podczas operacji | Pesymistyczny (czekaj na API) | Prostsza logika, brak ryzyka rozsynchronizowania | Plan |
| Błędy | Inline na karcie | Spójne z obecnym wzorcem w FlashcardCollection | Plan |
| Nowe biblioteki | Brak | button.tsx + textarea.tsx wystarczają | Plan |

## Zakres

**W zakresie:**
- `PATCH /api/flashcards/:id` — aktualizacja pytania i/lub odpowiedzi
- `DELETE /api/flashcards/:id` — usunięcie fiszki właściciela
- Inline edit i inline delete confirm w `FlashcardCollection.tsx`
- Typ `UpdateFlashcardRequest` w `src/types.ts`

**Poza zakresem:**
- Ręczne tworzenie nowych fiszek (FR-009)
- Toast/powiadomienia globalne
- Optymistyczne aktualizacje
- Paginacja, sortowanie
- Zmiany schematu DB

## Architektura / Podejście

Nowy plik API `src/pages/api/flashcards/[id].ts` (Astro dynamic route) eksponuje `PATCH` i `DELETE` — ten sam wzorzec auth + supabase client co istniejący `flashcards.ts`. `FlashcardCollection.tsx` dostaje per-karta state (`activeCard`) i lokalny `localRefreshKey` do samoistnego odświeżania po edit/delete, niezależny od `refreshKey` z rodzica.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. API | `PATCH` i `DELETE /api/flashcards/:id` z auth + walidacją | Astro dynamic route `[id].ts` musi leżeć w podfolderze `flashcards/` |
| 2. UI | Inline edit + inline delete confirm w `FlashcardCollection` | `activeCard` state musi wyzerować się po refresh, żeby nie zostać w starym trybie |

**Wymagania wstępne:** S-02 done (fiszki istnieją w kolekcji), Supabase RLS gotowe  
**Szacowany wysiłek:** ~1 sesja, 2 fazy

## Otwarte ryzyka i założenia

- Astro dynamic route `[id].ts` może wymagać sprawdzenia czy `context.params.id` zawsze jest stringiem (nie undefined) — dodać guard.
- `localRefreshKey` musi być uwzględniony w `useEffect` deps obok `refreshKey` — pominięcie spowoduje brak odświeżania.

## Kryteria sukcesu (podsumowanie)

- Karta w kolekcji daje się edytować i zapisać — zmiana widoczna natychmiast
- Karta daje się usunąć po potwierdzeniu — znika z listy
- Błędy operacji nie crashują aplikacji — komunikat inline
