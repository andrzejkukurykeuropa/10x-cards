<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Otwarcie sesji nauki (S-04)

- **Plan**: context/changes/study-session/plan.md
- **Scope**: Full plan (Phase 1, 2, 3 — all complete)
- **Date**: 2026-08-02
- **Verdict**: NEEDS ATTENTION (post-triage: all warnings fixed or accepted; verified via `npm run lint` and `npm run build`, both pass)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automatyczne weryfikacje potwierdzone niezależnie: `npm run lint` (exit 0) i `npm run build` (exit 0, build server ukończony).

## Findings

### F1 — Restrukturyzacja layoutu w dashboard.astro wykracza poza "dodanie jednego linku"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/pages/dashboard.astro:16-31
- **Detail**: Plan (Faza 3, punkt 3) mówił wprost: "bez zmiany istniejącego layoutu... wyłącznie dodanie
  elementu, brak zmian klas istniejących kontenerów". W praktyce `<form method="POST" class="mt-6">` zostało
  zastąpione przez `<div class="mt-6 flex items-center justify-center gap-3">` opakowujący zarówno nowy link,
  jak i przeniesiony `<form>` (który stracił swoją klasę `mt-6`). To dokładnie ten wzorzec odchylenia, który jest
  już zapisany w `context/foundation/lessons.md` ("Scope creep w integracji layoutu") — ta sama strona,
  ten sam typ zmiany. Zmiana jest funkcjonalnie rozsądna (dwa przyciski obok siebie wymagają wspólnego
  kontenera flex), ale narusza literalny zakres planu i utrwala wzorzec, który zespół już raz oznaczył jako
  problematyczny.
- **Fix A ⭐ Recommended**: Zaakceptować zmianę jako uzasadnione zaktualizowanie planu (dodać adnotację w
  plan.md, że wymagany był wspólny kontener flex dla dwóch akcji) i potwierdzić wizualnie, że nic się nie
  rozjechało.
  - Strength: Zmiana jest minimalna, celowa i koniecznа dla poprawnego wyrównania dwóch przycisków; nie ma
    ukrytych regresji wizualnych w diffie.
  - Tradeoff: Plan przestaje być dosłownym odzwierciedleniem kodu bez retroaktywnej adnotacji.
  - Confidence: HIGH — diff jest mały, czytelny i ograniczony do jednej sekcji.
  - Blind spot: Nie sprawdzono renderowania w przeglądarce na różnych szerokościach ekranu.
- **Fix B**: Cofnąć restrukturyzację — dodać link "Rozpocznij naukę" jako osobny element poza `mt-6`
  (np. nowy `<div class="mt-4">` nad istniejącym `<form class="mt-6">`), zachowując oryginalny `<form>` bez zmian.
  - Strength: Ściśle przestrzega litery planu i unika dotykania istniejącego elementu.
  - Tradeoff: Dwa przyciski nie będą wizualnie sparowane (mogą wyglądać niespójnie/nierówno).
  - Confidence: MEDIUM — nie zweryfikowano wizualnie jak wyglądałby taki układ.
  - Blind spot: Brak testu wizualnego obu wariantów.
- **Decision**: Fixed via Fix A — addendum added to plan.md documenting the accepted layout change.

### F2 — Brak kontroli współbieżności w POST /api/study/review (read-compute-update)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/study/review.ts:45-69
- **Detail**: Endpoint robi SELECT bieżącego wiersza, liczy nowy stan FSRS w pamięci procesu, a następnie
  UPDATE tymi wartościami. Dwa równoległe żądania (np. podwójne kliknięcie, duplikat requestu sieciowego) na
  tę samą fiszkę mogą wyliczyć na bazie tego samego "starego" stanu i ostatni UPDATE nadpisze wynik pierwszego,
  cicho gubiąc jedną z ocen. Plan nie przewidywał tego scenariusza, a MVP jednego użytkownika czyni to
  mało prawdopodobnym, ale możliwym (np. podwójny klik / retry po timeout w UI).
- **Fix**: Dodać optymistyczną blokadę w warunku UPDATE, np. `.eq("last_review", current.last_review)` (lub
  porównanie `repetitions`), i zwrócić 409/404 gdy `data` jest puste po UPDATE (wskazuje na race).
  - Strength: Minimalna zmiana, nie wymaga migracji ani transakcji SQL, chroni przed cichą utratą danych.
  - Tradeoff: UI musi obsłużyć dodatkowy kod błędu (retry z odświeżeniem stanu karty).
  - Confidence: MEDIUM — zależy od tego, jak PostgREST zwraca pusty wynik przy niepasującym warunku `.eq`.
  - Blind spot: Brak testów potwierdzających zachowanie przy realnym race (trudne do odtworzenia ręcznie).
- **Decision**: Fixed — dodano optymistyczną blokadę (`.eq("last_review", ...)` / `.is("last_review", null)`) i
  409 Conflict przy niedopasowaniu w src/pages/api/study/review.ts.

### F3 — scheduleReview() nie jest opakowane w try/catch w review.ts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/study/review.ts:61
- **Detail**: Jeśli `scheduleReview` (lub `ts-fsrs` wewnętrznie) rzuci wyjątek dla nieoczekiwanego kształtu danych,
  błąd ominie spójny wzorzec `console.error` + `500 Internal server error` stosowany dla błędów SELECT/UPDATE
  i zamiast tego wypłynie jako nieobsłużony wyjątek Astro. Niespójne z wzorcem `[id].ts`, który konsekwentnie
  loguje i zwraca ujednolicony JSON błędu.
- **Fix**: Opakować wywołanie `scheduleReview` w try/catch, logować przez `console.error("[study/review] scheduleReview error:", err)` i zwracać `500` z tym samym formatem JSON co pozostałe gałęzie błędów.
- **Decision**: Fixed — dodano try/catch wokół scheduleReview z console.error i 500 w src/pages/api/study/review.ts.

### F4 — stateRef aktualizowany podczas render zamiast w useEffect (odejście od wzorca FlashcardGenerator.tsx)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/StudySession.tsx:46-49
- **Detail**: Kod zawiera skopiowany komentarz "Updated after each render (not during render) — safe to read in
  async event handlers", identyczny jak w `FlashcardGenerator.tsx:201`, ale implementacja różni się:
  `FlashcardGenerator.tsx` faktycznie aktualizuje ref w `useEffect(() => { stateRef.current = state; }, [state])`,
  podczas gdy `StudySession.tsx` robi `stateRef.current = state;` bezpośrednio w ciele funkcji komponentu —
  czyli właśnie podczas renderu, wbrew własnemu komentarzowi. Mutowanie refów podczas renderu jest odradzane
  przez React poza wąskimi przypadkami lazy-init i może zachowywać się nieprzewidywalnie ze Strict Mode
  podwójnym renderowaniem lub przyszłym concurrent renderingiem.
- **Fix**: Przenieść przypisanie do `useEffect(() => { stateRef.current = state; }, [state]);`, zgodnie z
  ustalonym wzorcem w `FlashcardGenerator.tsx`, i poprawić/zachować komentarz (będzie wtedy zgodny z kodem).
- **Decision**: Fixed — przypisanie stateRef.current przeniesione do useEffect w src/components/StudySession.tsx.

### F5 — Brak jawnego sortowania w GET /api/study/queue

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/study/queue.ts:25-31
- **Detail**: Zapytanie ma `.limit(500)` bez `.order(...)`. Plan nie wymagał kolejności (tasowanie po stronie
  klienta), więc to zgodne z planem — ale przy kolekcji >500 fiszek wynik bazy jest niedeterministyczny i może
  systematycznie pomijać najstarsze przeterminowane karty w trybie "due" zamiast dawać im priorytet. Poza
  zakresem MVP jednego użytkownika (uwaga o wydajności w planie to potwierdza), ale warto odnotować dla
  przyszłego skalowania.
- **Fix**: Dodać `.order("due_date", { ascending: true, nullsFirst: true })` przy okazji przyszłej pracy nad
  paginacją; nie wymaga akcji teraz.
- **Decision**: SKIPPED — poza zakresem MVP jednego użytkownika, do rozważenia przy przyszłej pracy nad paginacją.
