---
change_id: study-fsrs-scheduling-integrity
title: Study/FSRS scheduling integrity test coverage
status: implementing
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Rollout Phase 3 of context/foundation/test-plan.md: "Study/FSRS scheduling integrity".

Risks covered: #4 — Logika harmonogramowania FSRS uszkadza stan powtórek lub pokazuje karty w złej kolejności, a użytkownik traci postęp nauki (Wysoki × Średnie).

Test types planned: jednostkowe + integracyjne.

Risk response intent (#4): udowodnić, że zakończony przegląd aktualizuje pola harmonogramu WŁAŚCIWEJ karty i kolejka najbliższych powtórek to odzwierciedla, oraz że powtarzane uruchomienia nigdy nie cofają już zaplanowanej karty. Zakwestionować założenie "poprawność biblioteki ts-fsrs implikuje, że nasz endpoint przeglądu poprawnie ją okablowuje". Unikać anty-wzorca: skopiowana kalkulacja produkcyjna (asercja tego samego wzoru, który liczy kod) — oczekiwany harmonogram wyprowadzić niezależnie.
