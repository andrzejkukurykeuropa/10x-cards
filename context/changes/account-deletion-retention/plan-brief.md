# Usuwanie konta i retencja danych (RODO) — Krótki plan

> Pełny plan: `context/changes/account-deletion-retention/plan.md`

## Co i dlaczego

Budujemy zgodność z RODO (art. 5 ust. 1 lit. e — minimalizacja przechowywania danych): użytkownik może
sam trwale usunąć swoje konto w dowolnym momencie, a system automatycznie usuwa konta nieaktywne przez
24+ miesiące, wysyłając e-mail ostrzegawczy 30 dni wcześniej.

## Punkt wyjścia

Dziś nie istnieje ani strona ustawień konta, ani żaden mechanizm usuwania kont — tabela `flashcards` ma
już jednak `ON DELETE CASCADE` na `auth.users`, więc usunięcie użytkownika w Supabase Auth automatycznie
kasuje jego fiszki bez dodatkowej migracji. Brak klucza `service_role` w projekcie i brak dostawcy
e-maili transakcyjnych poza wbudowanym Supabase Auth.

## Pożądany stan końcowy

Zalogowany użytkownik klika "Usuń konto" na `/settings`, potwierdza wpisując "USUŃ", i jego konto oraz
dane znikają natychmiast i nieodwracalnie. Niezależnie, cykliczny zewnętrzny harmonogram sprawdza
wszystkie konta, ostrzega e-mailem te bliskie progu nieaktywności i usuwa te, które go przekroczyły.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Próg nieaktywności | 24 miesiące | Zgodne z praktyką organów nadzorczych (CNIL/Discord 2023) | Roadmap (research exa) |
| Mechanizm harmonogramu | Chroniony endpoint HTTP + GitHub Actions cron | Cloudflare Pages nie wspiera natywnych Cron Triggerów dla Functions | Plan |
| Wykrywanie nieaktywności | `last_sign_in_at` z Supabase Auth | Wbudowane, bez zmian schematu | Plan |
| E-mail ostrzegawczy | Tak, 30 dni przed usunięciem | Dobra praktyka RODO (prawo do bycia poinformowanym) | Roadmap |
| Dostawca e-maila ostrzegawczego | Wbudowany mechanizm Supabase (`signInWithOtp`) | Brak nowej zależności zewnętrznej, e-mail wysyłany z serwerów Supabase | Plan |
| Potwierdzenie samodzielnego usunięcia | Modal: wpisanie "USUŃ" + checkbox (bez re-auth hasłem) | Wystarczająca ochrona przed przypadkowym kliknięciem bez tarcia UX | Plan |
| Zakres strony ustawień | Minimalna, tylko sekcja usuwania konta | Unikamy rozszerzania zakresu poza potrzebę tej zmiany | Plan |
| Log audytowy usunięć | Brak dedykowanej tabeli, standardowe logi Workers | Wystarczające dla obecnej skali projektu | Plan |
| Obsługa błędów w cleanup joba | Kontynuuj mimo błędu pojedynczego konta, loguj i przejdź dalej | Częściowy sukces lepszy niż całkowita blokada; retry przy następnym uruchomieniu | Plan |
| Testy jednostkowe | Pominięte — tylko tryb `dryRun` i testy ręczne | Brak frameworka testowego w repo; unikamy dodawania nowego narzędzia dla jednej zmiany | Plan |
| Priorytet | Samodzielne usunięcie = must-have; automatyczne czyszczenie = nice-to-have | Samodzielne usunięcie to twarde prawo użytkownika (RODO art. 17); automatyzacja może poczekać | Plan |

## Zakres

**W zakresie:**
- Strona `/settings` z sekcją usuwania konta + modal potwierdzenia
- Endpoint `DELETE /api/account` usuwający konto i kaskadowo dane
- Endpoint `/api/admin/cleanup-inactive-accounts` z trybem `dryRun`, wykrywaniem po 24 miesiącach
- E-mail ostrzegawczy 30 dni przed automatycznym usunięciem
- Harmonogram GitHub Actions wywołujący endpoint czyszczenia

**Poza zakresem:**
- Nowa migracja SQL (kaskada już istnieje)
- Zewnętrzny dostawca e-maili (Resend itp.)
- Dedykowana tabela audytu usunięć
- Testy jednostkowe / nowy framework testowy
- Formalna aktualizacja `prd.md` o nowy FR
- Natywny Cloudflare Cron Trigger

## Architektura / Podejście

Klient administracyjny Supabase (`service_role`) w nowym module `src/lib/supabase-admin.ts`, używany
wyłącznie w dwóch endpointach server-side. Usuwanie samodzielne wywołuje `admin.deleteUser()`
bezpośrednio z żądania użytkownika. Usuwanie automatyczne to osobny, chroniony sekretem endpoint
wywoływany cyklicznie przez GitHub Actions `schedule:`, iterujący `admin.listUsers()` z paginacją i
klasyfikujący konta na "usuń" / "ostrzeż" / "pomiń" wg `last_sign_in_at`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Fundament (klient admin) | Sekret `service_role` + `createAdminClient()` | Przypadkowa ekspozycja klucza po stronie klienta |
| 2. Samodzielne usunięcie (must-have) | Strona ustawień + endpoint DELETE | Przypadkowe usunięcie bez wystarczającego potwierdzenia |
| 3. Wykrywanie nieaktywnych kont (nice-to-have) | Endpoint cleanup z dryRun | Błędna klasyfikacja usuwająca aktywne konta |
| 4. E-mail + harmonogram (nice-to-have) | Ostrzeżenie 23-24 mies. + GitHub Actions cron | Konto dostaje e-mail i usunięcie w tym samym przebiegu |

**Wymagania wstępne:** F-01 (tabela `flashcards`), F-04 (pola FSRS) — już ukończone i zarchiwizowane.
**Szacowany wysiłek:** ~4 fazy, Faza 1-2 to rdzeń must-have (~1-2 sesje), Fazy 3-4 opcjonalne rozszerzenie (~1-2 sesje).

## Otwarte ryzyka i założenia

- Szablon e-mail "Magic Link" w Supabase będzie współdzielony z ewentualnym przyszłym logowaniem przez
  magic link — jeśli taka funkcja powstanie, treść będzie wymagała rozróżnienia kontekstu.
- Dokładna definicja "24 miesięcy" w arytmetyce dat (kalendarzowa vs stała liczba dni) musi być spójna
  między `isInactiveForDeletion` i `isInWarningWindow`, by uniknąć luki lub nakładania się okien.

## Kryteria sukcesu (podsumowanie)

- Użytkownik może samodzielnie i nieodwracalnie usunąć swoje konto wraz z danymi z UI
- Konta nieaktywne 24+ miesiące są automatycznie usuwane, z 30-dniowym ostrzeżeniem e-mail wcześniej
- Żadne aktywne konto nigdy nie zostaje usunięte przez automatyzację (weryfikowane przez `dryRun`)
