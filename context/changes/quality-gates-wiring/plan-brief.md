# Quality-gates wiring — Krótki plan

> Pełny plan: `context/changes/quality-gates-wiring/plan.md`
> Badania: `context/changes/quality-gates-wiring/research.md`

## Co i dlaczego

Faza 5 wdrożenia testów z `context/foundation/test-plan.md`: podłączyć
`npm run lint` **oraz** testy jednostkowe (`tests/lib/**`, 59 testów, bez
Supabase) jako **wymaganą bramę CI blokującą merge** każdego PR do `master`.
Dziś zestaw testów z Faz 1–4 istnieje (~120 testów), ale CI biegnie tylko
`lint + build`, a `lint` jest czerwony (49 błędów) — więc nawet nie może być
uczyniony blokującym. Ta faza zamienia istniejące testy w blokadę merge
(ochrona przekrojowa dla ryzyk #1–#6).

## Punkt wyjścia

`.github/workflows/ci.yml` = jeden job `ci` (`lint` + `build`), brak testów.
`npm run lint` = 49 błędów (46 formatowania auto-fixowalnego, 3 ręczne) w 6
plikach nietestowych. `vitest.config.ts` ma `globalSetup`, który biegnie
bezwarunkowo i wymaga żywego lokalnego Supabase — więc testów jednostkowych nie
da się dziś uruchomić w CI. Lokalny `master` jest 11 commitów przed
`origin/master` (niepushowana praca Faz 3–4); CI prawdopodobnie już czerwone na
origin.

## Pożądany stan końcowy

`npm run lint` zielony. Nowy `npm run test:unit` uruchamia 59 testów bez
Supabase. Job `ci` biegnie `lint → test:unit → build` na każdym PR. Check `ci`
jest wymaganym status checkiem na `master` — PR z czerwonym lintem lub czerwonym
testem jednostkowym **nie może się zmergować**. `test-plan.md` odzwierciedla
rzeczywistość (§3 Faza 5 = `complete`, §5 sprostowane, §6.6 z notatką fazy).

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zakres bramy CI | lint + testy jednostkowe (`tests/lib/**`), NIE integracyjne | integracyjne wymagają żywego Supabase + mają flaky test; local-only do przyszłej fazy | Badania |
| Struktura joba | krok `test:unit` w istniejącym jobie `ci` | jeden wymagany check (`ci`), brak nowej powierzchni branch-protection, najmniejszy diff | Plan |
| `generateObject` deprecated | migracja na `generateText` + `Output.object` w tej fazie | odblokowuje lint bez tłumienia; badanie potwierdza zero wpływu na testy AI; `eslint-disable` jawnie odrzucony w `change.md` | Plan |
| Config jednostkowy | nowy `vitest.config.unit.ts` bez `globalSetup` + skrypt `test:unit` | najmniejszy diff; głośne fail-fast w `global-setup.ts` zostaje nietknięte dla lokalnej integracji | Badania |
| §5 „typecheck" nieścisłość | sprostować tylko tekst (typecheck złożony w lint) | zgodne z rzeczywistością, zero nowej powierzchni CI; `astro check` to kandydat na osobny `/10x-new` | Plan |
| Branch protection | `gh auth login` + `gh api .../protection` w Fazie 3 | skryptowalne, udokumentowane w planie; `gh` zainstalowany ale niezalogowany | Plan |
| Flaky `study-review.test.ts` 2.4 | poza zakresem — follow-up na zmianie study-fsrs | warstwa integracyjna, nie w bramie CI | Badania |
| Rozbieżność Node `.nvmrc`/CI | wyrównać do `22.14.0` w Fazie 3 | kosmetyczne, usuwa dryf | Plan |

## Zakres

**W zakresie:**
- `npm run lint:fix` (46 błędów) + 3 ręczne fixy: dwa martwe null-guardy
  (`cleanup-inactive-accounts.ts:94,118`), migracja `generateObject`
  (`generate-flashcards.ts`)
- `vitest.config.unit.ts` + skrypt `test:unit`
- Krok `npm run test:unit` w jobie `ci`; wyrównanie `node-version`
- `gh auth login` + `gh api` — check `ci` jako required status check na `master`
- Push lokalnego `master`; testowy czerwony PR jako dowód blokady
- Aktualizacja `test-plan.md` §3 / §5 / §6.6 / §4 i `change.md`

**Poza zakresem:**
- Testy integracyjne / komponentowe w CI (local-only)
- Naprawa flaky `study-review.test.ts` 2.4
- `astro check` jako osobna brama typecheck
- `/10x-test-plan --refresh` dla §4 (jsdom/RTL + `tests/lib/`)
- `eslint-disable` dla któregokolwiek z 3 ręcznych naruszeń
- Zmiany w `tests/setup/global-setup.ts`
- Krok deploy w CI

## Architektura / Podejście

Trzy fazy w wymuszonej kolejności: **Faza 1** zeruje dług lintu (warunek
wstępny — bez zielonego lintu brama nie może być wymagana), z pełnym przebiegiem
testów jako kontrolą regresji po migracji `generateObject`. **Faza 2** tworzy
osobny config Vitest bez `globalSetup`, żeby 59 testów jednostkowych biegło bez
Supabase. **Faza 3** dodaje krok CI, ustawia branch protection przez `gh`,
wypycha pracę, dowodzi blokady czerwonym PR-em i sprostowuje `test-plan.md`.

Kluczowy fakt: „wymagana brama" = **blokada merge, nie deploy**. Cloudflare Pages
deployuje niezależnie od GitHub Actions; check `required` blokuje merge PR do
`master`, a produkcja i tak dostaje tylko to, co zmergowane.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Wyzerowanie długu lintu | `npm run lint` → 0; migracja `generateObject`; pełny zestaw testów zielony | migracja `generateText` to jedyna zmiana zachowania produkcji — brzegowy `finishReason:length` → inna klasa błędu (oba i tak `500`) |
| 2. Config testów jednostkowych | `vitest.config.unit.ts` + `test:unit`; 59 testów bez Supabase | `globalSetup` biegnie bezwarunkowo — jedyna czysta droga to osobny config |
| 3. Okablowanie bramy | krok CI, branch protection `ci` required, push, dowód blokady, `test-plan.md` sprostowane | przemianowanie checku w przyszłości = branch protection blokuje wszystkie merge; push 11 commitów wyzwala CI na `master` (musi być zielone) |

**Wymagania wstępne:** lokalny Supabase (`npx supabase start`) do przebiegów
regresji; interaktywne `gh auth login` (token z zakresem `repo`); dostęp
administratora do repo `andrzejkurykeuropa/10x-cards` dla branch protection.
**Szacowany wysiłek:** ~2–3 sesje, po jednej na fazę.

## Otwarte ryzyka i założenia

- Zakłada się, że `origin/master` CI jest naprawialny wyłącznie przez
  `lint:fix` + 3 ręczne fixy (badanie potwierdza breakdown, ale ostatni przebieg
  CI należy sprawdzić jako krok 1, nie założyć).
- `gh auth login` wymaga interaktywnego działania użytkownika w trakcie Fazy 3.
- Migracja `generateObject`: jeden nieprzetestowany niuans (`finishReason:
  "length"`) — akceptowany, bo i tak zwija się do `500`.

## Kryteria sukcesu (podsumowanie)

- PR z czerwonym lintem lub czerwonym testem jednostkowym nie może zostać
  zmergowany do `master` (zweryfikowane testowym PR-em).
- `npm run test:unit` uruchamia 59 testów bez Supabase w kilka sekund.
- `origin/master` CI zielony po pushu; `test-plan.md` §3 Faza 5 = `complete`.
