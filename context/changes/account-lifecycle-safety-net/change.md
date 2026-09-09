---
change_id: account-lifecycle-safety-net
title: Account-lifecycle safety net
status: implementing
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Rollout Phase 4 of context/foundation/test-plan.md: "Account-lifecycle safety net".

Risks covered: #6 — zadanie czyszczenia nieaktywnych kont usuwa dane niewłaściwego użytkownika lub uruchamia się wobec aktywnych/granicznych kont.

Test types planned: jednostkowe (przypadki brzegowe zapytania selekcji) — celowo NIE integracyjne/e2e, zgodnie z §7 negative-space (użytkownik wyraźnie zdeprioryzował end-to-end efekt usuwania w tym obszarze).

Risk response intent: udowodnij, że logika selekcji obejmuje wyłącznie konta spełniające dokładny próg nieaktywności i nigdy nie dotyka aktywnego konta ani przy ponownym uruchomieniu (idempotencja); zakwestionuj założenie "jeden udany ręczny przebieg = zapytanie selekcji bezpieczne w przypadkach brzegowych (daty graniczne, strefa czasowa, ponowienia)"; unikaj testowania efektu ubocznego usuwania end-to-end.
