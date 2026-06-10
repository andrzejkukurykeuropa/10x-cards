---
name: 10x-plan-review
description: >
  Review implementation plans for substance, feasibility, and architectural fitness.
  Use when user asks to review a plan, says "is this plan good", "check my plan",
  "review this plan", mentions plan review, or references a plan file and asks
  for feedback. Also trigger when user finishes /10x-plan and wants validation
  before starting /10x-implement.
---

# Przegląd planu

Wykrywaj problemy merytoryczne w planie implementacji, zanim zostanie napisana choćby jedna linia kodu. Wadliwy plan kosztuje godziny — wadliwy przegląd kosztuje minuty.

Tam, gdzie `/10x-impl-review` pyta „czy zbudowaliśmy to, co zaplanowaliśmy?”, to narzędzie pyta „czy ten plan faktycznie zadziała?”.

Dwa tryby:
- **Świeży przegląd**: analiza → ustalenia → interaktywna selekcja
- **Wznowienie selekcji**: wczytaj zapisany raport i przejdź do selekcji poszczególnych problemów

## Rozwiązanie wejścia

1. Argument wskazuje na zapisany plik przeglądu (zawiera `<!-- PLAN-REVIEW-REPORT -->`) → **wznowienie selekcji** (przejdź do kroku 6)
2. Argument to `<change-id>` i istnieje `context/changes/<change-id>/plan.md` → przejrzyj ten plan
3. Podana ścieżka planu (np. `@context/changes/<change-id>/plan.md`) → użyj jej
4. Brak argumentu → wyświetl listę `context/changes/*/plan.md` (najnowsze według `change.md.updated`) poprzez zapytanie użytkownika:
5. Flaga `--quick` → tryb tylko dokumentu (pominięcie kroku 3)

Jeśli rozwiązana ścieżka planu zaczyna się od `context/archive/`, odmów napisania recenzji: wydrukuj „Ta zmiana jest zarchiwizowana. Recenzje nie są dołączane do zarchiwizowanych planów.” i ZATRZYMAJ.

## Krok 1: Wczytanie i skanowanie spójności wewnętrznej

Wczytaj cały plik planu. Wczytaj również sąsiedni `plan-brief.md` w tym samym folderze zmiany, jeśli istnieje. Wczytaj `context/foundation/lessons.md`, jeśli jest obecny, i użyj zaakceptowanych reguł jako priorytetów podczas skanowania pod kątem problemów merytorycznych / wykonalności / naruszenia kontraktu — ustalenie, które powtarza znaną, powtarzającą się regułę, powinno ważyć więcej, a nie mniej. Wyodrębnij:
- **Pożądany stan końcowy** i **Kryteria sukcesu**
- **Analiza bieżącego stanu** — udokumentowane ograniczenia i pułapki
- **Granice zakresu** — „Czego NIE robimy”
- **Fazy** — ścieżki plików, zmiany, zależności
- **Decyzje** i **założenia** (jawne i niejawne)
- **Sekcja postępu** — kanoniczny blok `## Progress` na dole planu (patrz `references/progress-format.md`)

Przed jakąkolwiek weryfikacją kodu, sprawdź plan pod kątem jego wewnętrznej spójności. Te trzy skany często wychwytują najcenniejsze problemy — problemy, które autor planu odkrył, ale nie doprowadził do końca:

- **Sprzeczność**: czy analiza bieżącego stanu dokumentuje ograniczenie, które implementacja ignoruje? (np. „npm nie uruchamia preuninstall dla zależności”, a jednak fazy na tym polegają)
