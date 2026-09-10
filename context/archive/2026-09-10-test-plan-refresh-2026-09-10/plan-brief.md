# Odświeżenie test-plan §4/§6/§8 — Krótki plan

> Pełny plan: `context/changes/test-plan-refresh-2026-09-10/plan.md`
> Badania: `context/changes/test-plan-refresh-2026-09-10/research.md`

## Co i dlaczego

Fazowe wdrożenie testów (§3, Fazy 1–5, wszystkie `complete`) dodało pełną
suite Vitest, ale zamrożona §4 „Stos" w `context/foundation/test-plan.md`
wciąż mówi profil bazy testowej `none` — „brak runnera, brak configu, brak
plików `*.test.*`". To wyzwalacz §8 „zmienił się runner testów". Odświeżenie
**wyłącznie dokumentacyjne**: doprowadzić §4, §6.1, §6.4, §6.6 i §8 do
zgodności z kodem. Bez nowej fazy wdrożenia, bez kodu testów, bez re-oceny
ryzyk.

## Punkt wyjścia

`test-plan.md` opisuje projekt bez testów. W rzeczywistości: `vitest ^4.1.11`,
dwa configi (`vitest.config.ts` integracyjny z `globalSetup`;
`vitest.config.unit.ts` jednostkowy bez), ~111 testów / 13 plików, devDeps
jsdom/RTL/dotenv, seam mocka `@ai-sdk/groq`, job CI `ci` = `lint → test:unit →
build`. §6.6 nosi trzy flagi „§4 wymaga `--refresh`" (Fazy 2, 3, 5). §6.4
opisuje kontrakt AI jako `generateObject`, choć Faza 5 zmigrowała endpoint na
`generateText` + `Output.object`. §8 datowane 2026-08-09.

## Pożądany stan końcowy

§4 opisuje faktyczny stos: profil `meaningful`, Vitest z dwoma configami
(rozróżnienie unit/integration jako nagłówkowa różnica), realne wersje
pakietów, tabela narzędzi ugruntowania ostemplowana `2026-09-10` z
web-search „dostępne". §6.6 bez otwartych flag „wymaga `--refresh`". §6.1 i
§6.4 spójne z rzeczywistością. §8 datowane `2026-09-10`. §1, §2, §3, §5, §7
**bajt w bajt niezmienione**.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Profil bazy testowej | `meaningful` (z `none`) | 13 plików / ~111 testów, dwa configi, w CI | Badania |
| Cytowanie liczb testów | Opisywać warstwy, nie totale (jeśli liczba: 111/13/59) | Totale dryfują co fazę | Badania |
| §6.4 `generateObject` | Zamienić na `generateText` + `Output.object` w tym odświeżeniu | Ta sama klasa nieaktualności; niespójne naprawiać §4 zostawiając §6.4 błędne | Plan (wywiad) |
| §2 `generateObject` | Nietknięte | §2 zamrożone; rozjazd §2↔§6.4 akceptowany | change.md |
| §8 data strategii | Bump do 2026-09-10 z notatką „tylko brzmienie §4" | Odświeżenie dotyka §4; nagłówek już nosi tę datę | Plan (wywiad) |
| §6.6 flagi | Rozwiązać w czasie przeszłym (wskazać §4), nie kasować per-fazowych wpisów | Wpisy dokumentują dostarczone artefakty | Badania |
| Struktura configów Vitest | Nie ruszać — tylko dokumentować | Zmiana doc-only | change.md |
| Niezacommitowana edycja `inactive-accounts.test.ts` | Nie składać | Resztka po Fazie 4, niezwiązana | Badania |

## Zakres

**W zakresie:** §4 proza + tabela stosu + tabela narzędzi ugruntowania; §6.1
pkt 1 (dwa configi, `test:unit`); §6.4 (rzeczownik API, 3 miejsca); §6.6
(3 flagi Faz 2/3/5); §8 (3 daty); nagłówek „Ostatnia aktualizacja".

**Poza zakresem:** §1, §2 (+ Wskazówki Dotyczące Reagowania na Ryzyko), §3,
§5, §7; jakikolwiek kod testów / configi Vitest / `package.json` /
`ci.yml`; nowa faza wdrożenia; re-ocena ratingów §2; osobny `/10x-new` dla
§6.4; wpis §6.6 Fazy 4 („NIE wymaga `--refresh`").

## Architektura / Podejście

Dwie fazy, jeden plik (`context/foundation/test-plan.md`). Faza 1 =
przepisanie §4 (proza + obie tabele) — serce odświeżenia. Faza 2 = drobne
korekty aktualności w §6.1/§6.4/§6.6/§8/nagłówku. Rozdział trzyma duży
przepis osobno od jednolinijkowych korekt, żeby `git diff` był czytelny do
przeglądu. Weryfikacja: kotwice `grep` na usuniętych frazach + `prettier
--check` + `git diff` potwierdzający zero zmian w zamrożonych sekcjach +
`npm run test:unit` zielony (dowód, że kod nietknięty).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Przepisanie §4 „Stos" | §4 opisuje profil `meaningful`, dwa configi, realne wersje, tabelę narzędzi z datą 2026-09-10 | Przypadkowa edycja zamrożonej §2/§3 sąsiadującej z §4; pominięcie wiersza e2e/a11y (który ma zostać) |
| 2. Korekty §6.1/§6.4/§6.6/§8 + nagłówek | Flagi §6.6 domknięte, §6.1 uzgodniona z dwoma configami, §6.4 z `Output.object`, §8 zdatowana | Nadgorliwa edycja §6.4 zmieniająca substancję zamiast tylko nazwy API; dotknięcie `generateObject` w §2 |

**Wymagania wstępne:** `research.md` kompletny (jest — 2026-09-10, commit
`8109f23`). Brak zależności zewnętrznych.
**Szacowany wysiłek:** ~1 sesja, 2 fazy, jeden plik. ~5 zgrupowanych edycji.

## Otwarte ryzyka i założenia

- Zakłada się, że numery linii w planie (~87–106, ~131–135, ~291–302,
  ~358–473, ~511–522) mogą się nieco przesunąć — implementator kotwiczy się
  na nagłówkach sekcji i cytowanych frazach, nie na numerach linii.
- Zakłada się, że lint-staged/`prettier` nie przeformatuje tabel w sposób
  psujący `git diff` — Faza 1 uruchamia `prettier --check` jako bramę.
- Rozjazd §2 (`generateObject`) ↔ §6.4 (`generateText`) po tej zmianie jest
  **celowo akceptowany** — §2 to zamrożona mapa ryzyk. Gdyby zespół chciał
  §2 uspójnić, to osobny `/10x-test-plan --refresh` z rozmrożeniem §2.

## Kryteria sukcesu (podsumowanie)

- Czytelnik `test-plan.md` widzi prawdziwy stos testowy w §4 i wie, jak
  uruchomić każdą warstwę — bez trafiania na „brak runnera".
- `grep "generateObject"` → tylko §2; `grep "wymaga /10x-test-plan
  --refresh"` → tylko nagłówek / §6.6 Faza 4 / §8 blok „Odśwież gdy".
- `git diff` na §1/§2/§3/§5/§7 jest pusty; `npm run test:unit` zielony.
