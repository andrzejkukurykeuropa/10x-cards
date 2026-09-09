# Account-lifecycle safety net — Krótki plan

> Pełny plan: `context/changes/account-lifecycle-safety-net/plan.md`
> Badania: `context/changes/account-lifecycle-safety-net/research.md`

## Co i dlaczego

Faza 4 fazowego wdrożenia testów (`test-plan.md` §3). Dodajemy pokrycie **jednostkowe**
„zapytania selekcji" zadania czyszczącego nieaktywne konta — czyli dwóch czystych
klasyfikatorów w `src/lib/inactive-accounts.ts`. Broni Ryzyka #6: *zadanie usuwa dane
niewłaściwego użytkownika lub uruchamia się wobec aktywnych / granicznych kont*.
Kwestionuje założenie „jeden udany ręczny przebieg = zapytanie selekcji bezpieczne w
przypadkach brzegowych (daty graniczne, strefa czasowa, ponowienia)".

## Punkt wyjścia

Cała logika progu jest już wyekstrahowana do czystego, wstrzykiwalnego modułu
(`isInactiveForDeletion`, `isInWarningWindow` — 72 linie, zero importów, `now: Date`
jako argument). **Żaden test go nie dotyka.** `tests/lib/` zawiera dziś tylko
`fsrs.test.ts`. Historia: F1 CRITICAL — pierwsza wersja `isInactiveForDeletion` kasowała
każde nigdy-niezalogowane konto; naprawiona fallbackiem na `created_at`.

## Pożądany stan końcowy

`tests/lib/inactive-accounts.test.ts` istnieje i przechodzi, zamrażając osiem grup
zachowań brzegowych: kontrola pozytywna (aktywne konto nietknięte), kierunek + granica
24 mies., półotwarte okno ostrzeżeń 23–24 mies., **siatka wzajemnej wykluczalności**
(nigdy „usuń" i „ostrzeż" naraz), symetria fallbacku `created_at`, charakteryzacja
fail-closed (`null`/`NaN` → usuń), tolerancja arytmetyki kalendarzowej, idempotencja.
`test-plan.md` §6.1 i §6.6 opisują wzorzec dla przyszłych współtwórców.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Wejścia fail-closed (`null`/`null`, `NaN`) | Zwykła charakteryzacja — asercja `true` z komentarzem „celowy wybór F1", bez ramy „złam przy poprawce" | Zamraża zachowanie jako intencjonalne; nie sygnalizuje fałszywie, że to usterka | Plan |
| Arytmetyka kalendarzowa + strefa czasowa | Tolerancyjne właściwości (±3 dni) + `process.env.TZ = "UTC"` w pliku + jeden jawny przypadek końca miesiąca / 29 lutego jako akceptowany poślizg | Nie-flaky między strefami i długościami miesięcy; nie odtwarza `setMonth` | Plan (research OQ2) |
| Jawny test idempotencji | Jeden test na klasyfikator (podwójne wywołanie z tym samym `now`) | Bezpośrednia odpowiedź na „przy ponownym uruchomieniu" ze sformułowania Ryzyka #6 | Plan |
| Luka cyklu życia markera `retention_warning_sent_at` | Tylko notatka w planie („Czego NIE robimy" + „Otwarte ryzyka") + §6.6 | Leży w endpointcie, nie w czystej funkcji — poza §7; kandydat na osobny `/10x-new` | Plan (research OQ1) |
| Przypięcie strefy | `process.env.TZ = "UTC"` w pliku testu (Node 22 re-odczytuje dynamicznie) | Unika zmiany `vitest.config.ts` / `setupFiles` → §4 „Stos" nie wymaga `--refresh` | Plan |

## Zakres

**W zakresie:**
- Jeden nowy plik `tests/lib/inactive-accounts.test.ts` (osiem grup `describe`)
- Aktualizacja `test-plan.md` §6.1 (placeholder Fazy 4) i §6.6 (nowy akapit „Faza 4")
- Domknięcie `change.md`

**Poza zakresem:**
- Jakikolwiek test endpointu `cleanup-inactive-accounts.ts` (pętla `listUsers`,
  `deleteUser`, `signInWithOtp`, `dryRun`, auth, bramki `503`)
- Test efektu ubocznego usuwania end-to-end (§7 negative-space)
- Test dedupu e-maila ostrzegawczego (marker żyje w endpointcie)
- Naprawa luki cyklu życia markera
- Jakakolwiek zmiana `src/` lub `vitest.config.ts`

## Architektura / Podejście

Kopia struktury `tests/lib/fsrs.test.ts`: docblock `SCOPE` + `ZASADA ASERCJI`, zamrożony
`const NOW` na poziomie modułu przekazywany jawnie, throwing-helper zamiast `!`/`as`
(ESLint strict bez override dla `tests/**`), data-driven `for...of` + `it()`. Asercje to
**właściwości** (kierunek zmiany, przynależność do okna, wzajemna wykluczalność,
symetria fallbacku), nigdy liczby liczone przez `setMonth`. Strefa przypięta jednym
przypisaniem `process.env.TZ` na górze pliku.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Testy jednostkowe klasyfikatorów + podfaza §6.1 | `tests/lib/inactive-accounts.test.ts` (8 grup) + wypełnione `test-plan.md` §6.1/§6.6 + domknięty `change.md` | Siatka wzajemnej wykluczalności musi realnie łamać się przy rozjeździe progów — inaczej test tylko „przechodzi" bez sygnału |

**Wymagania wstępne:** `.env.test` (istnieje); lokalny Supabase dla `globalSetup`
(`npx supabase start`); Node 22.
**Szacowany wysiłek:** ~1 sesja, jedna faza.

## Otwarte ryzyka i założenia

- Luka cyklu życia markera `retention_warning_sent_at` — realna, ale poza zakresem
  (endpoint, nie czysta funkcja); kandydat na osobny `/10x-new`.
- Przypięcie strefy w pliku zależy od dynamicznego re-odczytu `process.env.TZ` przez
  Node 22 — gdyby CI zeszło poniżej Node 13, przenieść do `setupFiles` (+ `--refresh` §4).
- `npm run lint` pozostaje czerwony z powodu długu w `src/` — weryfikacja zakresowana do
  `npx eslint tests/lib/inactive-accounts.test.ts`.

## Kryteria sukcesu (podsumowanie)

- `npx vitest run tests/lib/inactive-accounts.test.ts` zielony; `npx eslint` na pliku → 0.
- Ręczna zmiana `WARNING_THRESHOLD_MONTHS` → `24` łamie grupę „wzajemna wykluczalność"
  (dowód sygnału), wraca do zieleni po cofnięciu.
- `test-plan.md` §6.1 bez `TBD` dla Fazy 4; §6.6 ma kompletny akapit „Faza 4".
