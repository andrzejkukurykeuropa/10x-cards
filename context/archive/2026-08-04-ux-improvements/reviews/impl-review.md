<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Poprawki wizualne i UX (S-05)

- **Plan**: context/changes/ux-improvements/plan.md
- **Scope**: Full plan (Phase 1 + 2 + 3)
- **Date**: 2026-08-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — "Zaakceptuj wszystkie" może wysłać pustą/białoznakową treść dla edytowanej propozycji

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/FlashcardGenerator.tsx:298-312
- **Detail**: W pojedynczym trybie edycji przycisk „Zapisz” jest zablokowany, dopóki `editQuestion`/`editAnswer` nie są niepuste (`disabled={!editQuestion.trim() || !editAnswer.trim()}`, linia 118) — to jedyny strażnik, `handleEditSave` (linie 332-337) sam nie waliduje treści. `handleAcceptAll` (linie 298-312) omija ten strażnik UI całkowicie: dla propozycji `isEditing === true` bierze `p.editQuestion`/`p.editAnswer` wprost i wywołuje `handleAccept` programowo, bez sprawdzenia `trim()`. API (`src/pages/api/flashcards.ts:8-9`, `z.string().trim().min(1)`) odrzuci taki request, więc dane nie zostaną zapisane — ale użytkownik zobaczy niepotrzebny błąd zapisu i propozycja wróci do trybu edycji z komunikatem `saveError`, mimo że nigdy nie kliknął „Zapisz” dla tej karty.
- **Fix**: W `handleAcceptAll`, dla propozycji `isEditing`, pomiń wywołanie `handleAccept` (pozostaw w stanie `pending`/`isEditing`) gdy `!p.editQuestion.trim() || !p.editAnswer.trim()`, analogicznie do warunku `disabled` przycisku „Zapisz”.
- **Decision**: FIXED — dodano filtr wykluczający edytowane propozycje z pustą/białoznakową treścią przed wysłaniem (`src/components/FlashcardGenerator.tsx`). Zweryfikowano `npm run build`.

### F2 — „Zakończ sesję” nie jest zablokowany podczas trwającego zapisu oceny

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/StudySession.tsx:244-256, 95-97
- **Detail**: Przycisk oceny karty jest blokowany podczas zapisu (`disabled={state.submitting}`, linia 289), ale nowy przycisk „Zakończ sesję” (linia 244) i przycisk potwierdzenia „Zakończ” (`handleConfirmExit`, linia 255) nie sprawdzają `state.submitting`. `handleConfirmExit` (linie 95-97) nawiguje natychmiast przez `window.location.href = "/dashboard"`, bez oczekiwania na zakończenie `fetch("/api/study/review")`. Użytkownik może kliknąć „Zakończ sesję” → potwierdzić w trakcie trwającego zapisu oceny i przerwać żądanie w locie, tracąc właśnie ocenianą kartę (wcześniejsze oceny pozostają zapisane).
- **Fix**: Zablokować przycisk „Zakończ sesję” (i/lub przycisk potwierdzenia „Zakończ”) gdy `state.submitting === true`, analogicznie do istniejącego wzorca na przyciskach oceny.
- **Decision**: FIXED — dodano `disabled={state.submitting}` do przycisków „Zakończ sesję” i „Zakończ” (`src/components/StudySession.tsx`). Zweryfikowano `npm run build`.

## Observations

- **O1 — `handleAccept` zmieniony z `stateRef`-owej mutacji na funkcyjny `setState`** (src/components/FlashcardGenerator.tsx:278-286): nieopisane wprost w kontrakcie planu dla Fazy 2, ale ściśle powiązane i uzasadnione komentarzem w kodzie — zapobiega race condition przy współbieżnych zapisach z „Zaakceptuj wszystkie”. Nie wymaga akcji.
