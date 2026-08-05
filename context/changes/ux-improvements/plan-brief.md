# Poprawki wizualne i UX (S-05) — Krótki plan

> Pełny plan: `context/changes/ux-improvements/plan.md`

## Co i dlaczego

Trzy niezależne poprawki UX zgłoszone po ukończeniu S-02/S-03/S-04: (1) możliwość zaakceptowania wszystkich propozycji AI jednym kliknięciem zamiast pojedynczo, (2) możliwość przerwania sesji nauki w dowolnym momencie, (3) poprawka kontrastu tekstu na przyciskach z jasnym tłem, czytelnego dopiero po najechaniu myszą.

## Punkt wyjścia

Dziś: przegląd propozycji AI (`FlashcardGenerator.tsx`) wymaga akceptacji/edycji/odrzucenia każdej propozycji osobno; sesja nauki (`StudySession.tsx`) nie ma żadnego przycisku wyjścia — jedyne wyjście to statyczny link poza komponentem lub nawigacja przeglądarki; przyciski wariantu `outline`/`ghost` (`button.tsx`) nie ustawiają jawnego koloru tekstu i dziedziczą go z rodzica, co na ciemnych stronach z jasnym tłem przycisku daje biały tekst na białym tle w stanie domyślnym.

## Pożądany stan końcowy

Użytkownik klika „Zaakceptuj wszystkie” i wszystkie nieodrzucone propozycje (z uwzględnieniem edycji) trafiają do kolekcji jednym ruchem. W trakcie sesji nauki widoczny jest przycisk „Zakończ sesję”, który po potwierdzeniu z podsumowaniem postępu wraca do dashboardu bez utraty już zapisanych ocen. Tekst na przyciskach `outline`/`ghost` jest czytelny od razu, bez najeżdżania myszą.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Treść przy „Zaakceptuj wszystkie” | Zapisuje aktualną (edytowaną) treść | Respektuje pracę użytkownika włożoną w edycję przed masową akceptacją | Plan |
| Obsługa błędów przy zapisie zbiorczym | Kontynuuj pozostałe, pokaż błąd per-propozycja z opcją ponowienia | Jeden nieudany zapis nie powinien blokować reszty; istniejący mechanizm `saveError` już to obsługuje | Plan |
| Zapis zbiorczy | Równoległe żądania (`Promise.allSettled`) do istniejącego `POST /api/flashcards`, bez nowego endpointu batch | Prostsze, wystarczające przy 3-10 propozycjach, nie zmienia kontraktu API | Plan |
| Potwierdzenie przerwania sesji | Panel z podsumowaniem postępu („Oceniono X/Y”) zamiast natychmiastowego wyjścia | Zapobiega przypadkowej utracie kontekstu sesji bez realnego ryzyka utraty danych (oceny i tak są zapisane) | Plan |
| Cel przekierowania po przerwaniu | Zawsze `/dashboard` | Spójne z istniejącymi linkami powrotu w pustym stanie i podsumowaniu | Plan |
| Implementacja panelu potwierdzenia | Lekki wbudowany stan komponentu, bez nowej zależności Dialog/shadcn | Repozytorium nie ma zainstalowanego komponentu Dialog; unikamy nowej zależności dla prostego przypadku | Plan |
| Zakres poprawki kontrastu | Tylko warianty `outline`/`ghost` w `button.tsx`, jawny `text-foreground` | Naprawia problem u źródła (komponent), działa niezależnie od tła strony-rodzica, bez ryzyka dla innych wariantów | Plan |
| Umiejscowienie „Zaakceptuj wszystkie” | Góra listy propozycji, obok licznika | Widoczne bez przewijania, spójne z istniejącym licznikiem statusu | Plan |
| Umiejscowienie „Zakończ sesję” | Nagłówek aktywnej sesji (zastępuje funkcjonalnie statyczny link z `study.astro`, który nie ma dostępu do stanu postępu) | Zawsze widoczny w trakcie sesji, ma dostęp do `ratingCounts`/`index` do wyświetlenia w potwierdzeniu | Plan |

## Zakres

**W zakresie:**
- Przycisk „Zaakceptuj wszystkie” w `FlashcardGenerator.tsx` + logika zbiorczego zapisu
- Przycisk „Zakończ sesję” + panel potwierdzenia w `StudySession.tsx`
- Poprawka `text-foreground` dla wariantów `outline`/`ghost` w `button.tsx`

**Poza zakresem:**
- Endpoint wsadowy (`batch insert`) dla fiszek
- Log przeglądów / cofanie oceny w sesji nauki
- Audyt wariantów `default`/`destructive`/`secondary`/`link` przycisku
- Nowe testy automatyczne (repo obecnie ich nie ma dla tych przepływów)
- Nowa zależność Dialog/shadcn

## Architektura / Podejście

Trzy niezależne fazy, każda ograniczona do jednego pliku komponentu, bez zmian API ani schematu danych. Kolejność: najpierw izolowana poprawka CSS/wariantu (Faza 1), potem rozszerzenie istniejącej logiki zapisu o wariant zbiorczy z równoległymi żądaniami i obsługą częściowych błędów (Faza 2), na końcu nowy stan UI potwierdzenia w maszynie stanów sesji nauki (Faza 3).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Kontrast przycisków | Czytelny tekst domyślny na `outline`/`ghost` we wszystkich użyciach | Niezamierzona zmiana wyglądu na stronach, gdzie tekst był już poprawny |
| 2. Zaakceptuj wszystkie | Masowa akceptacja propozycji AI z zachowaniem edycji i obsługą błędów częściowych | Race condition przy równoległych zapisach modyfikujących współdzielony stan `proposals` |
| 3. Przerwanie sesji | Bezpieczne wyjście z sesji nauki z potwierdzeniem postępu | Utrata stanu `revealed`/`index` przy błędnym zarządzaniu nowym polem `confirmingExit` |

**Wymagania wstępne:** S-02, S-03, S-04 ukończone (potwierdzone — status `done` w roadmapie).
**Szacowany wysiłek:** ~1 sesja, 3 fazy (każda to zmiana w jednym pliku, bez nowej infrastruktury).

## Otwarte ryzyka i założenia

- Brak testów automatycznych oznacza, że regresje w istniejących przepływach (pojedyncza akceptacja, pełne ukończenie sesji) będą wykryte wyłącznie ręcznie.
- Równoległe żądania w „Zaakceptuj wszystkie” (`Promise.allSettled`) zakładają, że każdy wywoływany `handleAccept` bezpiecznie aktualizuje stan przez `stateRef`/funkcyjny `setState` bez nadpisywania się nawzajem — wzorzec już istnieje w kodzie (`updateProposalPatch` operuje na najnowszym stanie), ale warto zwrócić uwagę podczas implementacji.

## Kryteria sukcesu (podsumowanie)

- Jednym kliknięciem można zaakceptować wszystkie propozycje AI (z uwzględnieniem edycji), z per-propozycja obsługą błędów.
- Sesję nauki można bezpiecznie przerwać w dowolnym momencie bez utraty już ocenionych kart.
- Tekst na przyciskach `outline`/`ghost` jest czytelny w stanie domyślnym na wszystkich ekranach aplikacji.
