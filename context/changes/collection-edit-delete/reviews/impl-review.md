<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Edit and delete flashcards in the collection

- **Plan**: `context/changes/collection-edit-delete/plan.md`
- **Zakres**: Faza 1–2 z 2
- **Data**: 2026-07-07
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych · 1 ostrzeżenie · 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|---|---|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Ustalenia

### F1 — Globalny activeCard nie blokuje konkurencyjnych akcji

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/components/FlashcardCollection.tsx:27, 50–87`
- **Szczegóły**: Jeden globalny `activeCard` śledzi stan edycji. Gdy zapis karty A jest w locie (mode: saving), użytkownik mógł kliknąć Edytuj na karcie B — `activeCard` zostaje nadpisany, a odpowiedź od karty A trafi w `setActiveCard(prev)` z nieaktualnym `prev`.
- **Poprawka A ⭐ Zastosowana**: Dodano `disabled={activeCard?.mode === "saving"}` na przyciskach Edytuj/Usuń w trybie view — blokuje konkurencyjne akcje gdy któraś karta jest w trakcie zapisu.
- **Decyzja**: FIXED via Fix A

### F2 — DRIFT: setActiveCard(null) pośredni po sukcesie

- **Ważność**: 💡 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `FlashcardCollection.tsx:38–39`
- **Szczegóły**: Plan mówił wywołać `setActiveCard(null)` wprost po sukcesie. Implementacja zeruje stan dopiero w `.then()` effectu po refetchu — działa identycznie, ale pośrednio. Brak ryzyka funkcjonalnego.
- **Decyzja**: SKIPPED — drift funkcjonalnie identyczny

### F3 — GET /api/flashcards nie parsuje body błędu

- **Ważność**: 💡 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `FlashcardCollection.tsx:33`
- **Szczegóły**: `throw new Error(\`Błąd ${res.status}\`)` ignorował body odpowiedzi. FlashcardGenerator parsuje `{ error }` i pokazuje czytelny komunikat.
- **Poprawka**: Zmieniono na `res.json().catch(() => ({})) as { error?: string }` — parsuje body, fallback do statusu.
- **Decyzja**: FIXED

### F4 — UpdateFlashcardRequest słabszy niż kontrakt runtime

- **Ważność**: 💡 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/types.ts:21–24`
- **Szczegóły**: `{ question?: string; answer?: string }` pozwala na `{}` w typie, ale API odrzuca pusty obiekt 422. Union type wymusiłby przynajmniej jedno pole.
- **Decyzja**: SKIPPED — API i tak odrzuca 422, wystarczające dla MVP
