<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: S-01 — Przeglądanie kolekcji

- **Plan**: context/changes/collection-view/plan.md
- **Zakres**: Wszystkie fazy (1–4)
- **Data**: 2026-06-15
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|---|---|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | WARNING |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Ustalenia

### F1 — Surowy error.message Supabase zwracany klientowi

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/flashcards.ts:23-25
- **Szczegóły**: `return new Response(JSON.stringify({ error: error.message }), { status: 500 })` ujawnia tekst błędu PostgREST/Supabase, który może zawierać szczegóły schematu, nazwy tabel i szczegóły polityk RLS.
- **Poprawka**: Zaloguj błąd po stronie serwera (console.error), zwróć generyczny payload: `{ error: "Internal server error" }`.
  - Siła: Standardowa praktyka — nie przecieka szczegółów wewnętrznych.
  - Kompromis: Debugging produkcji wymaga logów zamiast odpowiedzi klienta.
  - Pewność: HIGH.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: FIXED

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔬 WYSOKI — stawka architektoniczna; pomyśl dokładnie przed podjęciem decyzji
- **Wymiar**: Architektura
- **Lokalizacja**: src/pages/dashboard.astro:31, src/components/FlashcardCollection.tsx:13-25
- **Szczegóły**: Kolekcja jest widokiem tylko do odczytu renderowanym po stronie klienta (useEffect → fetch → setState). Reguła projektu: "Astro components for static content; React only when client interactivity is required." Powoduje dodatkowy round-trip + hydration bundle. Plan celowo wybrał to podejście, więc jest to drift względem wytycznych projektu.
- **Poprawka A ⭐ Zalecana**: Pozostaw jak jest — zaplanuj refactor na SSR jako osobną zmianę gdy S-02 doda interaktywność do dashboardu.
  - Siła: Minimalne ryzyko regresji; S-02 i tak dotknie dashboardu.
  - Kompromis: Wyższy czas pierwszego bajtu do momentu refactoru.
  - Pewność: HIGH.
  - Martwy punkt: Harmonogram S-02.
- **Poprawka B**: Refactor na Astro SSR już teraz — fetch danych w frontmatter, usuń React island.
  - Siła: Zgodność z regułą Astro-first; lepszy UX.
  - Kompromis: Więcej pracy teraz; S-02 może i tak wymagać reaktywności.
  - Pewność: MEDIUM.
  - Martwy punkt: Czy S-02 będzie wymagać client-state na dashboardzie?
- **Decyzja**: ACCEPTED (Poprawka A — refactor SSR zaplanowany przy S-02)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/flashcards.ts:17-21
- **Szczegóły**: `.select(...).eq(...).order(...)` bez `.limit()` — pobiera całą kolekcję w jednym zapytaniu. Koszt rośnie liniowo z rozmiarem kolekcji. Supabase domyślnie zwraca max 1000 wierszy.
- **Poprawka A ⭐ Zalecana**: Dodaj tymczasowy `.limit(100)` jako guard, zaplanuj właściwą paginację jako osobną zmianę.
  - Siła: Szybka ochrona; nie blokuje S-01.
  - Kompromis: Arbitralne ograniczenie — niewidoczne dla użytkownika bez UI paginacji.
  - Pewność: HIGH.
  - Martwy punkt: Czy użytkownicy MVP będą mieć >100 fiszek?
- **Poprawka B**: Pomiń — zaadresuj w dedykowanej zmianie paginacji.
  - Siła: YAGNI dla MVP.
  - Kompromis: Potencjalny problem jeśli S-02 generuje dużo fiszek szybko.
  - Pewność: MEDIUM.
  - Martwy punkt: Brak limitu Supabase = 1000 wierszy.
- **Decyzja**: SKIPPED (dedykowana zmiana paginacji)

- **Ważność**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/types.ts:1-7, src/pages/api/flashcards.ts:17
- **Szczegóły**: `select("id, question, answer, created_at, updated_at")` — brak `user_id`. Komponent typuje odpowiedź jako `Flashcard[]`, ale `user_id` jest zawsze `undefined`. Plan wspominał o `FlashcardDto` dla odpowiedzi API.
- **Poprawka**: Dodaj `FlashcardDto = Omit<Flashcard, "user_id">` w `src/types.ts` i użyj go w endpoincie i komponencie.
- **Decyzja**: FIXED

- **Ważność**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; historia commitów jest niezmiennym faktem
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/changes/collection-view/plan.md, Faza 1
- **Szczegóły**: Plan mówił "Utwórz src/types.ts", ale plik istniał już z commitu d69dff5 (flashcard-schema). Zawartość jest prawidłowa.
- **Poprawka**: Brak wymaganych działań — notatka historyczna.
- **Decyzja**: SKIPPED (notatka historyczna, brak wymaganych działań)

- **Ważność**: ℹ️ OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; zmiana jest nieszkodliwa
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/pages/dashboard.astro:9-11
- **Szczegóły**: Linie 9-11 zmieniają klasy kontenera layoutu (niezaplanowane w Fazie 4). Zmiana jest wizualna, nie behawioralna.
- **Poprawka**: Brak wymaganych działań — akceptowalne jako kosmetyka przy integracji.
- **Decyzja**: ACCEPTED-AS-RULE: Scope creep w integracji layoutu
