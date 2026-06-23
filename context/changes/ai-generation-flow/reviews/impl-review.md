<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: ai-generation-flow

- **Plan**: context/changes/ai-generation-flow/plan.md
- **Zakres**: Wszystkie fazy (1–3 z 3)
- **Data**: 2025-01-27
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 4 ostrzeżenia, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|---|---|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | OBSERVATION |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Ustalenia

### F1 — Retry na edytowanej fiszce zapisuje oryginalne dane

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/components/FlashcardGenerator.tsx:309-314
- **Szczegóły**: handleEditSave ustawia { isEditing: false } i wywołuje handleAccept z edytowanymi wartościami. Jeśli POST się nie powiedzie, karta wraca do pending ale editQuestion/editAnswer są utracone. Retry wywołuje handleAccept bez argumentów i zapisuje oryginalne proposal.question/answer zamiast edytowanych.
- **Poprawka**: W handleAccept catch block (L284-289) przywróć editQuestion/editAnswer z q i a: updateProposalPatch(id, { disposition: "pending", saveError: "...", editQuestion: q, editAnswer: a, isEditing: true }) — użytkownik wraca do trybu edycji z zachowanymi zmianami.
  - Siła: Minimalny patch; dane edytowane nigdy nie giną; UX jasny.
  - Kompromis: Karta wraca do isEditing=true (użytkownik widzi pola edycji).
  - Pewność: HIGH — bug potwierdzony analizą kodu.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED — przywraca editQuestion/editAnswer w catch block, karta wraca do trybu edycji z zachowanymi zmianami

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/components/FlashcardGenerator.tsx:257-261
- **Szczegóły**: handleAccept nie sprawdza czy proposal.disposition === "saving" przed wysłaniem. Szybki dwuklik retry może wysłać duplicate POST i doprowadzić do dwóch wpisów w DB.
- **Poprawka**: Dodaj guard: if (proposal.disposition === "saving") return; po L261.
  - Siła: Jedna linia; eliminuje klasę duplicate-save.
  - Kompromis: Drobny.
  - Pewność: HIGH.
  - Martwy punkt: Nie sprawdzono unikalności server-side w DB.
- **Decyzja**: FIXED — dodano guard `if (proposal.disposition === "saving") return;`

### F3 — Brak AbortController w FlashcardCollection

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/components/FlashcardCollection.tsx:17-29
- **Szczegóły**: useEffect nie anuluje poprzedniego fetcha przy zmianie refreshKey. Starszy fetch może ukończyć się po nowszym i nadpisać dane; setState po unmount powoduje React warning.
- **Poprawka**: Dodaj AbortController: const ctrl = new AbortController(); fetch(url, { signal: ctrl.signal }); return () => ctrl.abort(); W catch ignoruj AbortError.
  - Siła: Standardowy wzorzec React; zapobiega race i memory leak.
  - Kompromis: Kilka linii boilerplate.
  - Pewność: HIGH.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED — AbortController z cleanup, AbortError ignorowany w catch

### F4 — generate-flashcards.ts zmieniony poza zakresem planu

- **Ważność**: 👁 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/pages/api/generate-flashcards.ts
- **Szczegóły**: Plan zawierał barierę "No changes to POST /api/generate-flashcards logic". Zmiana systemu prompt (angielski → polski) nastąpiła poza planem, na żądanie użytkownika w trakcie implementacji.
- **Poprawka**: Dodaj aneks do plan.md dokumentując zmianę jako odkryty zakres.
- **Decyzja**: FIXED — udokumentowano w plan.md jako aneks A1

### F5 — GET /api/flashcards bez limitu/paginacji

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/flashcards.ts:23-27
- **Szczegóły**: GET zwraca całą kolekcję bez limitu. Każdy refresh pobiera wszystkie fiszki. Przy dużej kolekcji degraduje performance i bandwidth.
- **Poprawka**: Dodaj .limit(100) do query Supabase.
  - Siła: Jednolinijkowe zabezpieczenie.
  - Kompromis: Pierwsze 100 fiszek — akceptowalne dla MVP.
  - Pewność: HIGH.
  - Martwy punkt: Brak.
- **Decyzja**: FIXED — dodano .limit(100)

### F6 — Zod schema bez .trim() — API akceptuje whitespace-only

- **Ważność**: 👁 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/flashcards.ts:7-9
- **Szczegóły**: z.string().min(1) przepuszcza whitespace-only strings. UI blokuje puste pytania, ale granica API powinna być niezależna.
- **Poprawka**: z.string().trim().min(1) dla question i answer.
- **Decyzja**: FIXED — z.string().trim().min(1)

### F7 — Template strings zamiast cn() w FlashcardGenerator

- **Ważność**: 👁 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/FlashcardGenerator.tsx:80-82, 344
- **Szczegóły**: Warunkowe klasy Tailwind budowane przez template literals, gdzie reguła projektu wymaga cn() z @/lib/utils.
- **Poprawka**: Zastąp template strings wywołaniami cn(...).
- **Decyzja**: SKIPPED
