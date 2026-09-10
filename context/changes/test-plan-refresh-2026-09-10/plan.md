# Plan implementacji: Odświeżenie test-plan §4/§6/§8 do stanu suite Vitest

## Przegląd

Fazowe wdrożenie testów (§3, Fazy 1–5, wszystkie `complete`) dodało pełną
suite Vitest, ale zamrożona §4 „Stos" w `context/foundation/test-plan.md`
wciąż opisuje profil bazy testowej `none` („brak runnera, brak configu, brak
plików `*.test.*`"). To odświeżenie — wyzwalacz §8 „zmienił się stos
technologiczny projektu (nowy runner testów)", **nie** nowa faza wdrożenia —
doprowadza §4, §6.1, §6.4, §6.6 i §8 do zgodności z rzeczywistością kodu.
Zmiana **wyłącznie dokumentacyjna**: jeden plik, bez kodu testów, bez
re-oceny ryzyk.

## Analiza stanu obecnego

Zweryfikowane w `context/changes/test-plan-refresh-2026-09-10/research.md`
(commit `8109f23`, 2026-09-10) — każdy materialny fakt potwierdzony wobec
kodu:

- **§4 „Stos"** ([test-plan.md:87-106](../../foundation/test-plan.md)) —
  cała proza + tabela mówią profil `none`, każdy wiersz warstwy „brak
  jeszcze". **Wszystko nieaktualne.** Rzeczywistość:
  - Runner: `vitest ^4.1.11` (devDep) przez `astro/config` `getViteConfig()`.
  - **Dwa configi**: `vitest.config.ts` (integracyjny — `environment: node`,
    `include: tests/**/*.test.{ts,tsx}`, `globalSetup:
    tests/setup/global-setup.ts`, `testTimeout: 15000`) i
    `vitest.config.unit.ts` (jednostkowy — `environment: node`, `include:
    tests/lib/**/*.test.ts`, **bez `globalSetup`**, bez `testTimeout`).
  - Skrypty: `test` (`vitest run`), `test:watch`, `test:unit` (`vitest run
    --config vitest.config.unit.ts`).
  - devDeps od wdrożenia: `jsdom ^30.0.1`, `@testing-library/react ^16.3.3`,
    `@testing-library/dom ^10.4.1`, `dotenv ^17.4.2` (+ `supabase ^2.23.4`
    już wcześniej jako CLI).
  - Seam mocka dostawcy AI: `ai/test` `MockLanguageModelV3` +
    `@ai-sdk/groq ^3.0.42`, helper `tests/helpers/ai-mock.ts`.
  - `globalSetup` ładuje `.env.test` przez `dotenv`, wymaga lokalnego
    Supabase (`assertLocalSupabaseUrl()` odrzuca nie-`127.0.0.1`), seeduje
    `TEST_USER_A`/`B`. Dlatego warstwa integracyjna wymaga `npx supabase
    start` + lokalnego `.env.test`.
  - Inwentarz: 111 testów / 13 plików (pełny), 59 testów (jednostkowy).
    `change.md` cytował „~120" i „tests/api/ (7)" — drobne korekty; badanie
    zaleca **opisywać warstwy, nie totale** (totale dryfują co fazę).
  - Wiersze e2e / dostępność / AI-native — **genuinie nieobecne** (brak
    Playwright, axe, tooling AI-native w `package.json`); zostają bez zmian.
- **§4 tabela narzędzi ugruntowania**
  ([test-plan.md:102-106](../../foundation/test-plan.md)) — cztery linie
  „niedostępne/nieużyte", `sprawdzono: 2026-08-09`. Ta sesja (2026-09-10):
  dokumentacja/Context7 MCP wciąż brak; **web search/fetch teraz dostępne**
  (jedyna zmiana); Playwright MCP brak; provider MCP brak.
- **§6.6** — trzy flagi „**§4 wymaga `/10x-test-plan --refresh`**":
  - Faza 2 ([test-plan.md:358-362](../../foundation/test-plan.md)) — jsdom /
    RTL / `.tsx` w `include`.
  - Faza 3 ([test-plan.md:405-409](../../foundation/test-plan.md)) — katalog
    `tests/lib/` = warstwa jednostkowa.
  - Faza 5 ([test-plan.md:469-473](../../foundation/test-plan.md)) — drugi
    config `vitest.config.unit.ts`.
  - Flaga Fazy 4 ([test-plan.md:432-434](../../foundation/test-plan.md)) —
    „§4 **NIE** wymaga `--refresh`" — trafna, **zostaje**.
- **§6.1 pkt 1** ([test-plan.md:131-135](../../foundation/test-plan.md)) —
  „`include` w `vitest.config.ts` już obejmuje `tests/**`" czyta się jak
  jeden config. Po odświeżeniu: `tests/lib/**` objęte przez **oba** configi,
  więc test `tests/lib/` nie może polegać na `globalSetup`; `npm run
  test:unit` to kanoniczne polecenie szybkiej warstwy.
- **§6.4** ([test-plan.md:286-303](../../foundation/test-plan.md)) — opisuje
  kontrakt AI jako `generateObject` (3 miejsca prozą). Faza 5 zmigrowała
  endpoint na `generateText` + `Output.object`
  ([src/pages/api/generate-flashcards.ts:3,48-61](../../../src/pages/api/generate-flashcards.ts)).
  Substancja (realna walidacja zod na prawdziwej granicy `ai`) **bez
  zmian** — nieaktualna tylko nazwa API.
- **§8 Rejestr** ([test-plan.md:511-522](../../foundation/test-plan.md)) —
  wszystkie trzy daty `2026-08-09`.
- **Nagłówek „Ostatnia aktualizacja"** ([test-plan.md:10](../../foundation/test-plan.md))
  kończy się „§4 „Stos" wciąż wymaga `--refresh`…" — to zdanie też staje się
  nieaktualne po tym odświeżeniu.
- **§5 Bramy Jakości** — już sprostowane w Fazie 5 (job `ci`: `lint →
  test:unit → build`, `ci` required na `master`). **Bez zmian** —
  potwierdzone w badaniu.

## Pożądany stan końcowy

`context/foundation/test-plan.md` opisuje faktyczny stos testowy: profil
`meaningful`, Vitest z dwoma configami (rozróżnienie unit/integration jest
nagłówkową różnicą §4), realne devDeps i wersje, tabela narzędzi ugruntowania
ostemplowana `2026-09-10` z web-search „dostępne". §6.6 nie zawiera już
otwartych flag „wymaga `--refresh`". §6.1/§6.4 spójne z rzeczywistością (dwa
configi; `generateText` + `Output.object`). §8 datowane `2026-09-10`.
Sekcje §1, §2 (+ Wskazówki Dotyczące Reagowania na Ryzyko), §3, §5, §7
**bajt w bajt niezmienione**.

Weryfikacja: `git diff` pokazuje zmiany wyłącznie w §4, §6.1, §6.4, §6.6, §8
i nagłówku; `git diff` na zakresach linii §1/§2/§3/§5/§7 jest pusty;
`npx prettier --check` na pliku przechodzi.

### Kluczowe odkrycia

- **Rozdział dwóch configów jest celowy i nośny**
  ([research.md „Architecture Insights"](research.md)): `vitest.config.ts`
  niesie `globalSetup` (Supabase + `.env.test`); `vitest.config.unit.ts` go
  pomija, żeby `tests/lib/**` biegło w sekundy w CI bez zależności
  zewnętrznych. Test `tests/lib/` jest uruchamiany przez **oba** — nie może
  zależeć od efektów ubocznych `globalSetup`. To ma być nagłówkowe
  rozróżnienie w przepisanej §4.
- **Granica mocka = dostawca (`@ai-sdk/groq`), nigdy `ai`.** Migracja Fazy 5
  `generateObject` → `generateText` + `Output.object` zachowała to dokładnie
  ([generate-flashcards.ts:60-61](../../../src/pages/api/generate-flashcards.ts)
  komentarz) — odświeżenie zmienia w §6.4 **tylko rzeczownik API**, nie
  substancję.
- **§2 też mówi `generateObject`** ([test-plan.md:46,63](../../foundation/test-plan.md))
  — **zamrożone, nie ruszamy** (change.md „Do NOT touch"). Rozjazd §2↔§6.4
  jest akceptowany: §2 to zamrożona mapa ryzyk, nie podręcznik.
- **Brak `.mcp.json` w repo** — dostępność narzędzi ugruntowania to
  właściwość per-sesja, nie stanu repo. Jedyna zmiana vs. 2026-08-09 to
  web-search.
- **Niezacommitowana edycja `tests/lib/inactive-accounts.test.ts`** (6+/3−,
  komentarz) w drzewie roboczym — resztka po Fazie 4, **nie składać** do tej
  zmiany ([research.md „Historical Context"](research.md)).
- lessons.md: jedyna reguła („zmiany layoutu w osobnym commicie") nie
  dotyczy zmiany doc-only.

## Czego NIE robimy

- **Nie ruszamy §1** (Strategia), **§2** (Mapa Ryzyk + Wskazówki Dotyczące
  Reagowania na Ryzyko — łącznie z 3 wystąpieniami `generateObject`), **§3**
  (wszystkie fazy `complete`), **§5** (Bramy Jakości — sprostowane w Fazie
  5), **§7** (negative-space). Wywiad odświeżający potwierdził: brak nowych
  ryzyk, brak incydentów, brak zmiany zdania co do §7.
- **Nie dodajemy fazy wdrożenia** — ryzyka #1–#6 pokryte.
- **Nie re-oceniamy ratingów §2** — skan hot-spotów nie podniósł nowego
  sygnału prawdopodobieństwa (zmieniły się tylko testy).
- **Nie piszemy kodu testów**, nie tworzymy/edytujemy configów Vitest, nie
  ruszamy `package.json`, nie ruszamy `.github/workflows/ci.yml`.
- **Nie składamy** niezacommitowanej edycji `tests/lib/inactive-accounts.test.ts`.
- Nie tworzymy osobnego `/10x-new` dla §6.4 — poprawka rzeczownika API
  wchodzi tutaj (decyzja z wywiadu planistycznego).
- Nie usuwamy per-fazowych wpisów §6.6 (dokumentują, co każda faza
  dostarczyła) — usuwamy/rozwiązujemy **wyłącznie** zdania-flagi „wymaga
  `--refresh`".

## Podejście do implementacji

Dwie fazy w jednym pliku. Faza 1 to serce odświeżenia — przepisanie §4
(proza + obie tabele). Faza 2 to drobne korekty aktualności rozsiane po §6.1,
§6.4, §6.6, §8 i nagłówku. Rozdział trzyma duży przepis osobno od korekt
jednolinijkowych, żeby przegląd `git diff` był czytelny. Obie fazy edytują
`context/foundation/test-plan.md` i tylko ten plik.

Weryfikacja automatyczna dla zmiany doc-only opiera się na `git diff` z
kotwicami na nagłówkach sekcji (potwierdzenie, że zamrożone sekcje są
nietknięte) i `prettier --check` (lint-staged formatuje `*.md`). Weryfikacja
ręczna to uważne przeczytanie przepisanej §4 pod kątem prawdziwości i
sprawdzenie, że wewnętrzne odnośniki §6 nadal się zgadzają.

## Faza 1: Przepisanie §4 „Stos"

### Przegląd

Zamienić prozę „profil `none`" i tabelę „brak jeszcze" na opis faktycznego
stosu testowego, z rozróżnieniem dwóch configów Vitest jako nagłówkową
różnicą. Ostemplować tabelę narzędzi ugruntowania `2026-09-10`.

### Wymagane zmiany

#### 1. §4 proza wprowadzająca

**Plik**: `context/foundation/test-plan.md` (§4, ~linie 87–93)

**Cel**: Usunąć twierdzenie „w tym projekcie nie istnieje dziś żadne
narzędzie testowe … profil bazy testowej `none`". Zastąpić 2–3 zdaniami
opisującymi profil `meaningful`: Vitest przez `getViteConfig()`, dwie
warstwy o odrębnych configach — jednostkowa (`vitest.config.unit.ts`, bez
`globalSetup`, bez Supabase, `npm run test:unit`, w CI) i integracyjna
(`vitest.config.ts`, `globalSetup` z lokalnym Supabase + `.env.test`, `npm
run test`, local-only). Opisywać warstwy; jeśli pada liczba, to „~111
testów / 13 plików, z czego 59 jednostkowych" — ale preferować opis warstw.

**Kontrakt**: Sekcja `## 4. Stos`, akapit przed tabelą. Bez zmian w numeracji
sekcji ani w tytule. Nie wprowadzać kotwic plik:linia do kodu produkcyjnego
(§4 to specyfikacja stosu, nie audyt) — dozwolone nazwy configów, skryptów
npm, pakietów.

#### 2. §4 tabela stosu

**Plik**: `context/foundation/test-plan.md` (§4, ~linie 94–100)

**Cel**: Przepisać wiersze tabeli tak, by odzwierciedlały rzeczywistość:

| Warstwa | Wartość do zapisania |
|---|---|
| jednostkowe | Vitest `^4.1.11`, `vitest.config.unit.ts` (`environment: node`, `include: tests/lib/**/*.test.ts`, bez `globalSetup`), skrypt `test:unit`; bez Supabase/mocka; w bramie CI |
| integracyjne | Vitest `^4.1.11`, `vitest.config.ts` (`environment: node`, `include: tests/**/*.test.{ts,tsx}`, `globalSetup: tests/setup/global-setup.ts`, `testTimeout: 15000`); wymaga `npx supabase start` + `.env.test`; local-only |
| komponentowe | `jsdom ^30.0.1` + `@testing-library/react ^16.3.3` + `@testing-library/dom ^10.4.1`; per-plik `// @vitest-environment jsdom`; część warstwy integracyjnej (config `vitest.config.ts`) |
| mockowanie API | seam = dostawca `@ai-sdk/groq ^3.0.42`; `ai/test` `MockLanguageModelV3` z `ai ^6.0.208`; helper `tests/helpers/ai-mock.ts`; **nigdy** nie mockujemy `ai`. Supabase — bez mocka HTTP (`msw` niezainstalowany); testy integracyjne biją w prawdziwy lokalny Supabase |
| ładowanie env testów | `dotenv ^17.4.2` w `globalSetup` (`.env.test`, `override: true`) |
| e2e | bez zmian — „nieuwzględnione w tym wdrożeniu", brak Playwright |
| dostępność | bez zmian — „poza zakresem tego wdrożenia", brak axe |
| (opcjonalnie) natywne dla AI | bez zmian — „nieocenione w tym wdrożeniu" |

**Kontrakt**: Ta sama struktura tabeli markdown (kolumny Warstwa / Narzędzie
/ Wersja / Notatka lub zbliżona — implementator może dostroić nagłówki
kolumn dla czytelności, byle pozostała jedną tabelą pod `## 4. Stos`).
Wiersze e2e / dostępność / AI-native zachowują dotychczasowe brzmienie
„nieobecne" — one nadal są trafne.

#### 3. §4 tabela narzędzi ugruntowania stosu

**Plik**: `context/foundation/test-plan.md` (§4, ~linie 102–106)

**Cel**: Zaktualizować cztery linie do stanu sesji 2026-09-10 i ostemplować
`sprawdzono: 2026-09-10`:
- Dokumentacja (Context7 / docs MCP): **niedostępne** — bez zmian merytorycznych.
- Wyszukiwanie / fetch webowy: **dostępne** (`WebSearch` + `WebFetch`) —
  zmiana vs. 2026-08-09.
- Runtime / przeglądarka (Playwright MCP): **nieużyte** — bez zmian.
- Dostawca / platforma (GitHub / Cloudflare / Supabase MCP): **nieużyte** —
  bez zmian (`gh` CLI działa z Bash, ale to nie jest MCP grounding tool).

**Kontrakt**: Lista punktowa `**Narzędzia ugruntowania stosu (bieżąca
sesja):**`. Każda linia kończy się `sprawdzono: 2026-09-10`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Fraza „profil bazy testowej `none`" nie występuje już w pliku: `grep -c "profil bazy testowej \`none\`" context/foundation/test-plan.md` → `0`
- Fraza „brak jeszcze" nie występuje już w §4: `grep -n "brak jeszcze" context/foundation/test-plan.md` → brak trafień w zakresie §4
- `vitest.config.unit.ts` i `vitest.config.ts` oba wymienione w §4: `grep -c "vitest.config" context/foundation/test-plan.md` → `≥ 3`
- Wszystkie linie narzędzi ugruntowania noszą `2026-09-10`: `grep -c "sprawdzono: 2026-09-10" context/foundation/test-plan.md` → `4`
- Żaden `sprawdzono: 2026-08-09` nie został w §4: `grep -n "2026-08-09" context/foundation/test-plan.md` → brak trafień w §4 (linie §8 obsłużone w Fazie 2)
- Formatowanie przechodzi: `npx prettier --check context/foundation/test-plan.md`
- Nagłówki sekcji §1–§8 nienaruszone: `grep -nE "^## [1-8]\. " context/foundation/test-plan.md` → 8 linii, tytuły bez zmian
- `git diff context/foundation/test-plan.md` nie pokazuje zmian poza zakresami §4 i nagłówka (wizualna kontrola diffa)

#### Weryfikacja ręczna

- Przepisana §4 czyta się jako prawdziwa: dwa configi, ich `include` /
  `globalSetup` / env zgodne z `vitest.config.ts` i `vitest.config.unit.ts` w
  repo
- Wersje pakietów w tabeli zgadzają się z `package.json` (`vitest ^4.1.11`,
  `jsdom ^30.0.1`, `@testing-library/react ^16.3.3`, `@testing-library/dom
  ^10.4.1`, `dotenv ^17.4.2`, `@ai-sdk/groq ^3.0.42`, `ai ^6.0.208`)
- Wiersze e2e / dostępność / AI-native nadal obecne i nadal mówią „nieobecne"
- §2, §5 przeczytane obok §4 — brak nowo wprowadzonej sprzeczności (poza
  znanym, akceptowanym rozjazdem §2 `generateObject`)

**Uwaga implementacyjna**: Po Fazie 1 i przejściu weryfikacji automatycznych,
zatrzymaj się na ręczne potwierdzenie od człowieka przed Fazą 2.

---

## Faza 2: Korekty aktualności §6.1 / §6.4 / §6.6 / §8 + nagłówek

### Przegląd

Domknąć trzy flagi „wymaga `--refresh`" w §6.6, uzgodnić brzmienie §6.1 pkt 1
z dwoma configami, zamienić rzeczownik API w §6.4, zdatować §8 i nagłówek.

### Wymagane zmiany

#### 1. §6.6 — rozwiązanie trzech flag „wymaga `--refresh`"

**Plik**: `context/foundation/test-plan.md` (§6.6: Faza 2 ~l. 358–362, Faza 3
~l. 405–409, Faza 5 ~l. 469–473)

**Cel**: W każdym z trzech miejsc zamienić zdanie-flagę („**§4 wymaga
`/10x-test-plan --refresh`**" / „**§4 nadal wymaga…**" / „do odnotowania przy
`/10x-test-plan --refresh`") na jedno zdanie w czasie przeszłym: co faza
dodała do stosu i że §4 to odnotowuje od odświeżenia 2026-09-10. Zachować
resztę każdego wpisu (opis tego, co faza dostarczyła) bez zmian.

**Kontrakt**: Trzy akapity/bullet-y w §6.6. Po edycji fraza `wymaga
`/10x-test-plan --refresh`` (i warianty) nie występuje w §6.6 dla Faz 2/3/5.
Wpis Fazy 4 („§4 NIE wymaga `--refresh`") **nietknięty**.

#### 2. §6.1 pkt 1 — brzmienie „single config"

**Plik**: `context/foundation/test-plan.md` (§6.1, ~linie 131–135, oraz linia
polecenia uruchomienia ~175)

**Cel**: Uściślić, że `tests/lib/**` jest objęte przez **oba** configi:
`vitest.config.ts` (`tests/**/*.test.{ts,tsx}`, z `globalSetup`) i
`vitest.config.unit.ts` (`tests/lib/**/*.test.ts`, bez `globalSetup`) — więc
test `tests/lib/` musi biec czysto pod `npm run test` **i** `npm run
test:unit`, tzn. nie może zależeć od `globalSetup`. Dodać `npm run test:unit`
jako kanoniczne polecenie „tylko szybka warstwa" obok istniejącego `npx
vitest run tests/lib/<moduł>.test.ts`.

**Kontrakt**: §6.1 pkt 1 + akapit „Uruchomienie". Bez zmian w pkt 2–7 ani w
przykładzie kodu.

#### 3. §6.4 — rzeczownik API `generateObject` → `generateText` + `Output.object`

**Plik**: `context/foundation/test-plan.md` (§6.4, ~linie 291, 300, 302)

**Cel**: W trzech miejscach prozą §6.4 zamienić `generateObject` na
`generateText` + `Output.object` (lub „bufowany `generateText` z
`Output.object`"), zachowując sens: kontrakt jest buforowany (jeden obiekt,
jedno ciało JSON), prawdziwa walidacja zod nadal biegnie na granicy `ai`,
mockujemy **tylko** dostawcę. Reguła „NIGDY nie mockuj `ai`" pozostaje —
zaktualizować tylko nazwę funkcji, do której się odnosi.

**Kontrakt**: §6.4 akapit wprowadzający + pkt 2. Substancja pkt 1–8 bez
zmian. §2 (`generateObject` w tabeli ryzyk i Wskazówkach) **nietknięte** —
zamrożone.

#### 4. §8 Rejestr Aktualności

**Plik**: `context/foundation/test-plan.md` (§8, ~linie 513–515)

**Cel**: Zaktualizować:
- „Strategia (§1–§5) ostatnio przejrzana: **2026-09-10** (tylko brzmienie §4;
  ryzyka §1–§3 i §7 bez zmian)"
- „Wersje stosu ostatnio zweryfikowane: **2026-09-10** (stos testowy
  udokumentowany — profil `meaningful`, Vitest z dwoma configami)"
- „Referencje narzędzi natywnych dla AI ostatnio zweryfikowane:
  **2026-09-10** (żadna nie zaproponowana w tym wdrożeniu)"

**Kontrakt**: Trzy linie punktowe pod `## 8. Rejestr Aktualności`. Blok
„Odśwież (`/10x-test-plan --refresh`), gdy:" poniżej **bez zmian**.

#### 5. Nagłówek „Ostatnia aktualizacja"

**Plik**: `context/foundation/test-plan.md` (~linia 10, blok cytatu na górze)

**Cel**: Zastąpić/rozszerzyć końcówkę zdania o §4 wymagającej `--refresh`
krótką notką datowaną 2026-09-10: §4 przepisana do profilu `meaningful`
(Vitest, dwa configi, jsdom/RTL/dotenv), tabela narzędzi ugruntowania
ostemplowana, flagi §6.6 domknięte, §6.4 uzgodniona z migracją
`generateText`+`Output.object`, §8 zdatowana. Odświeżenie doc-only — §1–§3,
§5, §7 nietknięte.

**Kontrakt**: Blok `>` cytatu na górze pliku, linia „Ostatnia aktualizacja:".
Nie zmieniać linii o „Odświeżenie: uruchom ponownie `/10x-test-plan
--refresh`…" powyżej.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- `/10x-test-plan --refresh` nie występuje już w §6.6 dla Faz 2/3/5:
  `grep -n "10x-test-plan --refresh" context/foundation/test-plan.md` →
  trafienia tylko w nagłówku, §6.6 Faza 4 (kontekst „NIE wymaga") i §8 blok
  „Odśwież gdy"
- `generateObject` nie występuje już w §6.4: `grep -n "generateObject"
  context/foundation/test-plan.md` → trafienia **tylko** w §2 (linie ~46, 63)
- `generateText` + `Output.object` obecne w §6.4: `grep -c "Output.object"
  context/foundation/test-plan.md` → `≥ 1`
- Wszystkie trzy linie §8 noszą `2026-09-10`: `grep -A3 "## 8. Rejestr"
  context/foundation/test-plan.md` — brak `2026-08-09` w trzech pierwszych
  punktach
- `test:unit` wymienione w §6.1: `grep -n "test:unit" context/foundation/test-plan.md`
  → co najmniej jedno trafienie w §6.1
- Formatowanie przechodzi: `npx prettier --check context/foundation/test-plan.md`
- `git diff` pokazuje zmiany **wyłącznie** w §4 (Faza 1), §6.1, §6.4, §6.6
  (Fazy 2/3/5), §8 i nagłówku — zero linii diff w §1, §2, §3, §5, §7
- Suite nietknięta — sanity: `git status --porcelain` pokazuje zmodyfikowany
  tylko `context/foundation/test-plan.md` (+ wcześniejsza niezacommitowana
  edycja `tests/lib/inactive-accounts.test.ts`, której NIE dotykamy) i pliki
  folderu zmiany
- `npm run test:unit` nadal zielony (potwierdzenie, że nie ruszyliśmy kodu):
  `npm run test:unit`

#### Weryfikacja ręczna

- Wpisy §6.6 Faz 2/3/5 nadal opisują, co faza dostarczyła — usunięto tylko
  część „wymaga `--refresh`", w czasie przeszłym wskazującym na §4
- Wpis §6.6 Fazy 4 słowo w słowo jak przed zmianą
- §6.4 czyta się spójnie: „buforowany", „prawdziwa walidacja zod", „mockuj
  dostawcę nie `ai`" — sens zachowany, zmieniony tylko rzeczownik
- §6.1 pkt 1: czytelnik rozumie, że test `tests/lib/` biegnie pod oboma
  configami i nie może polegać na `globalSetup`
- §8: notka „tylko brzmienie §4" czyni jasnym, że ryzyka nie były
  re-oceniane
- Pełne przeczytanie §1, §2, §3, §5, §7 — identyczne z wersją sprzed zmiany
  (porównaj z `git show HEAD:context/foundation/test-plan.md`)

**Uwaga implementacyjna**: Po Fazie 2 i przejściu weryfikacji automatycznych,
zatrzymaj się na ręczne potwierdzenie od człowieka. Po potwierdzeniu:
zaktualizować `context/changes/test-plan-refresh-2026-09-10/change.md`
(`status: implemented`, `updated:` na datę zamknięcia) i oznaczyć §3 nie
dotyczy (to nie faza §3 — orkiestrator `/10x-test-plan` rozpozna zmianę jako
odświeżenie po `change.md`).

---

## Strategia testowania

Zmiana wyłącznie dokumentacyjna — brak nowych testów. „Testowanie" to:

### Weryfikacja automatyczna (grep + prettier + diff)

- Kotwice frazowe potwierdzające usunięcie nieaktualnego tekstu (patrz
  kryteria per faza)
- `npx prettier --check context/foundation/test-plan.md` — zgodność z
  lint-staged (`prettier --write` na `*.md`)
- `git diff` z kontrolą, że zamrożone sekcje (§1, §2, §3, §5, §7) mają zero
  linii zmian
- `npm run test:unit` — regresja zerowa (dowód, że kod nietknięty)

### Kroki testowania ręcznego

1. `git show HEAD:context/foundation/test-plan.md > /tmp/before.md`, potem
   `diff <(sed -n '/## 1\./,/## 4\./p' /tmp/before.md) <(sed -n '/## 1\./,/## 4\./p' context/foundation/test-plan.md)` → pusto (§1–§3 nietknięte)
2. To samo dla zakresu §5 i §7 → pusto
3. Przeczytać §4 z otwartym `vitest.config.ts` + `vitest.config.unit.ts` +
   `package.json` obok — każdy fakt się zgadza
4. Przeczytać §6.4 z otwartym `src/pages/api/generate-flashcards.ts` —
   `generateText` + `Output.object` zgodne
5. `grep -n "generateObject" context/foundation/test-plan.md` → tylko §2

## Uwagi dotyczące wydajności

Nie dotyczy — edycja jednego pliku markdown.

## Uwagi dotyczące migracji

Nie dotyczy — brak danych, brak schematu, brak kodu. `change.md` po
zakończeniu: `status: implemented`. Folder zmiany archiwizowany przez
`/10x-archive` po potwierdzeniu (orkiestrator `/10x-test-plan` traktuje tę
zmianę jako odświeżenie, nie wiersz §3).

## Referencje

- Powiązane badania: `context/changes/test-plan-refresh-2026-09-10/research.md`
- Tożsamość zmiany: `context/changes/test-plan-refresh-2026-09-10/change.md`
- Cel edycji: `context/foundation/test-plan.md` (§4, §6.1, §6.4, §6.6, §8, nagłówek)
- Migracja API udokumentowana w: `context/archive/2026-09-09-quality-gates-wiring/`
  (Faza 5) — źródło `generateText` + `Output.object`
- Config jednostkowy dodany w: `context/archive/2026-09-09-quality-gates-wiring/`
- jsdom/RTL dodane w: `context/archive/2026-09-08-ai-generation-reliability/` (Faza 2)
- `tests/lib/` dodane w: `context/archive/2026-09-09-study-fsrs-scheduling-integrity/` (Faza 3)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Przepisanie §4 „Stos"

#### Automatyczne

- [x] 1.1 Fraza „profil bazy testowej `none`" nie występuje w pliku
- [x] 1.2 Fraza „brak jeszcze" nie występuje w §4
- [x] 1.3 `vitest.config.unit.ts` i `vitest.config.ts` oba wymienione w §4 (`grep -c "vitest.config"` ≥ 3)
- [x] 1.4 Cztery linie narzędzi ugruntowania noszą `sprawdzono: 2026-09-10`
- [x] 1.5 Brak `2026-08-09` w zakresie §4
- [x] 1.6 `npx prettier --check context/foundation/test-plan.md` przechodzi
- [x] 1.7 Nagłówki `## 1.`–`## 8.` nienaruszone (8 linii, tytuły bez zmian)
- [x] 1.8 `git diff` bez zmian poza zakresami §4 i nagłówka

#### Ręczne

- [x] 1.9 Przepisana §4 zgodna z `vitest.config.ts` / `vitest.config.unit.ts` w repo
- [x] 1.10 Wersje pakietów w tabeli zgodne z `package.json`
- [x] 1.11 Wiersze e2e / dostępność / AI-native nadal obecne i mówią „nieobecne"
- [x] 1.12 Brak nowej sprzeczności z §2 / §5 (poza znanym rozjazdem §2)

### Faza 2: Korekty aktualności §6.1 / §6.4 / §6.6 / §8 + nagłówek

#### Automatyczne

- [ ] 2.1 `/10x-test-plan --refresh` nie występuje w §6.6 dla Faz 2/3/5
- [ ] 2.2 `generateObject` występuje tylko w §2 (nie w §6.4)
- [ ] 2.3 `Output.object` obecne w §6.4 (`grep -c` ≥ 1)
- [ ] 2.4 Trzy linie §8 noszą `2026-09-10`, brak `2026-08-09`
- [ ] 2.5 `test:unit` wymienione w §6.1
- [ ] 2.6 `npx prettier --check context/foundation/test-plan.md` przechodzi
- [ ] 2.7 `git diff` bez linii zmian w §1, §2, §3, §5, §7
- [ ] 2.8 `git status --porcelain` — zmodyfikowany tylko `test-plan.md` (+ pliki folderu zmiany; edycja `inactive-accounts.test.ts` nietknięta)
- [ ] 2.9 `npm run test:unit` zielony

#### Ręczne

- [ ] 2.10 Wpisy §6.6 Faz 2/3/5 nadal opisują dostarczone artefakty; usunięto tylko flagę
- [ ] 2.11 Wpis §6.6 Fazy 4 słowo w słowo jak przed zmianą
- [ ] 2.12 §6.4 spójna: „buforowany", „walidacja zod", „mockuj dostawcę nie `ai`"
- [ ] 2.13 §6.1 pkt 1 jasny co do dwóch configów i zakazu zależności od `globalSetup`
- [ ] 2.14 §8 notka „tylko brzmienie §4" obecna
- [ ] 2.15 §1, §2, §3, §5, §7 identyczne z `git show HEAD:context/foundation/test-plan.md`
- [ ] 2.16 `change.md` zaktualizowany (`status: implemented`, `updated:`)
