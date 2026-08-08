# Poprawki UI (S-07) — Krótki plan

> Pełny plan: `context/changes/ui-improvements/plan.md`

## Co i dlaczego

Roadmapa (S-07) wymaga dwóch drobnych, ale odczuwalnych poprawek UI: (1) łatwy dostęp do `/settings` z dowolnego ekranu zamiast ręcznego wpisywania adresu, oraz (2) zastąpienie domyślnego szablonu Astro Startera na `/` prostą, dedykowaną stroną tytułową 10xCards.

## Punkt wyjścia

`Topbar.astro` już istnieje i obsługuje stan zalogowany/niezalogowany, ale jest renderowany tylko na `/`. Dashboard, sesja nauki i ustawienia mają własne, niespójne nagłówki bez linku do ustawień — dashboard ma nawet własny, osobny przycisk „Sign out”. `Welcome.astro` to nietknięty szablon startera z marketingową treścią niezwiązaną z 10xCards.

## Pożądany stan końcowy

Z każdego z czterech głównych ekranów (dashboard, study, settings, `/`) widoczny jest spójny pasek nawigacyjny z linkiem „Ustawienia”. Strona główna pokazuje nazwę 10xCards, krótki tagline i odpowiednie CTA (Sign in/Sign up dla gościa, link do dashboardu dla zalogowanego), w stylu spójnym z resztą aplikacji.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Mechanizm linku do ustawień | Rozszerzyć istniejący `Topbar.astro` (nie nowy komponent) | Reużycie gotowego, przetestowanego wzorca — najmniejsza zmiana | Plan |
| Forma linku | Zwykły link tekstowy „Ustawienia” obok Dashboard/email | Spójne z istniejącymi linkami w Topbar, bez dodatkowego UI (ikony/menu) | Plan |
| Zasięg integracji | Dodać Topbar na dashboard/study/settings | Wymaganie „z dowolnego ekranu” — te 3 strony + `/` obecnie go nie mają | Plan |
| Duplikat „Sign out” na dashboardzie | Usunąć przycisk z karty, zostawić tylko w Topbar | Topbar staje się jedynym miejscem wylogowania — unika duplikacji UI | Plan |
| Styl nowej strony tytułowej | Uproszczony `bg-cosmic` bez orbów/gwiazd, spójny z dashboard/settings | Spójność wizualna z resztą aplikacji zamiast osobnego stylu marketingowego | Plan |
| Treść strony tytułowej | Nazwa + tagline + CTA (Sign in/Sign up lub link do dashboardu) | Minimalna, ale kompletna wizytówka produktu zgodnie z wynikiem S-07 | Plan |

## Zakres

**W zakresie:**
- Rozszerzenie `Topbar.astro` o link „Ustawienia”
- Dodanie Topbar do `dashboard.astro`, `study.astro`, `settings.astro`
- Usunięcie zduplikowanego przycisku „Sign out” z karty dashboardu
- Zastąpienie treści `Welcome.astro` dedykowaną stroną 10xCards
- Ustawienie tytułu strony na `/` na „10xCards”

**Poza zakresem:**
- Zmiany w `middleware.ts` / `PROTECTED_ROUTES`
- Nowy, osobny komponent nawigacyjny (NavBar)
- Ikona trybika, menu rozwijane
- Zmiany funkcjonalności samej strony `/settings`
- Aktualizacja PRD

## Architektura / Podejście

Jeden reużywalny komponent (`Topbar.astro`) rozszerzony o nowy link i włączony na 3 dodatkowe strony Astro. Strona główna pozostaje tym samym plikiem komponentu (`Welcome.astro`), z podmienioną zawartością — bez zmian w routingu czy imporcie.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Rozszerzenie Topbar | Link „Ustawienia” w Topbar (tylko zalogowani) | Niskie — mała, izolowana zmiana |
| 2. Integracja Topbar | Topbar widoczny na dashboard/study/settings, bez duplikatu Sign out | Drobne niedopasowanie layoutu karty po usunięciu przycisku |
| 3. Nowa strona tytułowa | `/` pokazuje 10xCards zamiast szablonu startera | Brak — czysto prezentacyjne |

**Wymagania wstępne:** S-01 (istniejąca nawigacja/dashboard) — już spełnione (status: done).
**Szacowany wysiłek:** ~1 sesja w 3 fazach (drobne zmiany w 5 plikach Astro).

## Otwarte ryzyka i założenia

- Brak — zakres jest wąski, wszystkie decyzje ustalone podczas planowania.

## Kryteria sukcesu (podsumowanie)

- Link „Ustawienia” dostępny i działający z dashboard, study i settings.
- Brak zduplikowanego przycisku wylogowania na dashboardzie.
- `/` pokazuje dedykowaną stronę 10xCards zamiast szablonu Astro Startera, z poprawnym CTA zależnym od stanu zalogowania.
