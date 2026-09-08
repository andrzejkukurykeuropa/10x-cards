# Niezawodność generowania AI — Krótki plan

> Pełny plan: `context/changes/ai-generation-reliability/plan.md`
> Badania: `context/changes/ai-generation-reliability/research.md`

## Co i dlaczego

Faza 2 wdrożenia testów (`test-plan.md` §3). Piszemy testy integracyjne, które
**wykrywają ciche awarie** w buforowanym kontrakcie `POST /api/generate-flashcards`:
każdy rozróżnialny tryb awarii AI SDK zwija się dziś do jednego
`500 {"error":"AI generation failed"}`, nie ma żadnego timeoutu na żadnym
poziomie (Ryzyko #2), a jedno konto może wołać generowanie w nieograniczonej
pętli bez kontroli kosztów (Ryzyko #5).

## Punkt wyjścia

Endpoint używa buforowanego `generateObject` (NIE streamuje — założenie
test-planu o „streamingu" zostało wycofane). Jeden catch-all na `:59-64`
połyka `APICallError` / `RetryError` / `NoObjectGeneratedError` / `AbortError`.
`FlashcardGenerator.tsx` ślepo rzutuje `res.json()` na `FlashcardsOutput`.
Zero rate-limitera w całej aplikacji (potwierdzone w badaniu §F). Faza 1
wdrożenia dała infrastrukturę testów (Vitest + `buildApiContext` + bezpośredni
import handlera); Faza 1 mockowała zero usług — to pierwsza faza z `vi.mock`.

## Pożądany stan końcowy

`npm run test` wykonuje 3 nowe pliki testów, które **blokują obecne zachowanie
jako świadome regresje**: dobrze uformowany sukces vs zwinięte 500 dla każdego
trybu awarii, brak bariery czasowej (fake timers), bramka „not configured",
nieograniczony kontrakt generowania (#5), oraz degradacja zniekształconego
payloadu w UI przeglądu. `test-plan.md` §6.4 dostaje prawdziwy przepis „endpoint
API + mock dostawcy AI" (bez słowa „streaming"). **Zero zmian w kodzie
produkcyjnym** — poprawki (`abortSignal`, walidacja runtime, limiter) to osobne
zmiany, które świadomie złamią te testy.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Granica mocka dostawcy AI | `vi.mock("@ai-sdk/groq")`, prawdziwe `generateObject` | Prawdziwa walidacja zod (`NoObjectGeneratedError`) musi biec — pokonuje anty-wzorzec §2/§4 | Plan |
| Bramka `!GROQ_API_KEY` | Dummy klucz w `.env.test` + `.example`; osobny plik testuje ścieżkę „not configured" przez `vi.mock("astro:env/server")` | Ścieżka AI musi działać w każdym teście; obie gałęzie configu pokryte | Plan |
| Utwardzanie endpointu (abortSignal/timeout) | Tylko blokuj lukę testem, zero zmian w kodzie | Zgodne z granicami lekcji test-planu; test najpierw utrwala, osobna zmiana poprawia | Badania Open Q#2 |
| Ślad na sesji/bazie | Fałszywy `locals.user`, bez `signInAsTestUser`, bez sprzątania, bez `fileParallelism` | Endpoint nigdy nie odpytuje Supabase | Plan |
| Ryzyko #5 | Jeden test-migawka „5 żądań → 5×200" + komentarz blokowy „to LUKA, PRD Open Question" | Brak progu do asertowania; test ma złamać się przy wprowadzeniu limitera | Badania §F |
| „Zniekształcone propozycje w UI przeglądu" | Jeden test komponentu `FlashcardGenerator` (jsdom + RTL) | Wybór użytkownika — pokrywa realną powierzchnię ślepego rzutu | Plan |

## Zakres

**W zakresie:** testy endpointu (kontrakt sukcesu, zwijanie błędów, brak
timeoutu, bramka configu, nieograniczony kontrakt #5); jeden test komponentu UI
przeglądu; helper `tests/helpers/ai-mock.ts`; dummy `GROQ_API_KEY`; nowe
`devDependencies` (jsdom, RTL); wzorzec w `test-plan.md` §6.4/§6.6.

**Poza zakresem:** jakiekolwiek zmiany w kodzie produkcyjnym; budowa
rate-limitera; test ścieżki zapisu (`POST /api/flashcards`); prawdziwa sesja /
sprzątanie danych; `fileParallelism = false`; wpięcie do CI; mockowanie
transportu `fetch`; edycja §1–§5 test-planu (poza flagą `--refresh` dla §4);
słowo „streaming" gdziekolwiek.

## Architektura / Podejście

`vi.mock("@ai-sdk/groq")` podmienia `createGroq()` na fabrykę zwracającą
`MockLanguageModelV3` (z `ai/test`), przełączalny per test przez hoisted
referencję. Prawdziwe `generateObject` z `ai` biegnie → prawdziwa walidacja
schematu. Testy wołają wyeksportowany `POST` bezpośrednio z fałszywym
`APIContext` (wzorzec Fazy 1). Test komponentu renderuje `FlashcardGenerator`
w jsdom z zamockowanym globalnym `fetch`. Bramka configu i „brak timeoutu"
mają dedykowane podejścia (wąski `vi.mock("astro:env/server")`, fake timers).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Infrastruktura mocków i środowisko | dummy `GROQ_API_KEY`, deps jsdom/RTL, `ai-mock.ts` helper, test dymny seamu | `generateObject` może odrzucić mock modelu → fallback `vi.mock("ai")` |
| 2. Kontrakt żądanie/odpowiedź (#2) | kontrola pozytywna + zwijanie schema-fail / dostawcy / abortu do 500 (labeled regressions) + bariera walidacji wejścia | wszystkie tryby dają identyczne 500 — jedyna różnica to liczba wywołań `doGenerate` |
| 3. Brak timeoutu + bramka configu (#2) | fake-timers „handler nigdy nie kończy po 10 min"; `GROQ_API_KEY=undefined` → 500 z rozróżnialnym ciałem | fake timers a mikrotaski `ai`; mock wirtualnego modułu `astro:env/server` |
| 4. Nieograniczony kontrakt (#5) | 5 kolejnych żądań → 5×200, komentarz blokowy „LUKA, PRD Open Question" | anty-wzorzec „bezsensowna migawka" — zbity komentarzem + intencją złamania |
| 5. Odporność UI przeglądu (#2, komponent) | render propozycji; brak klucza → panel błędu; `[]` → miękkie zawieszenie; `fetch` bez końca → spinner na stałe | render shadcn w jsdom; `crypto.randomUUID` w jsdom |
| 6. Podręcznik §6.4/§6.6 + weryfikacja | przepis „endpoint AI + mock dostawcy" (bez „streamingu"); pełny przebieg; §3 Faza 2 = complete | — |

**Wymagania wstępne:** lokalny Supabase (`npx supabase start`) dla reszty
zestawu; `npm install` po nowych zależnościach.
**Szacowany wysiłek:** ~2–3 sesje w 6 fazach.

## Otwarte ryzyka i założenia

- `generateObject` z `ai@6` może wewnętrznie walidować tożsamość dostawcy →
  fallback `vi.mock("ai")` + osobny test na `NoObjectGeneratedError`.
- Test komponentu wprowadza jsdom + RTL poza §4 „Stos" → §6.6 flaguje potrzebę
  `/10x-test-plan --refresh`.
- `vi.mock("astro:env/server")` na wirtualnym module Astro — zakładana
  rozwiązywalność przez `getViteConfig()`; fallback przez `vi.doMock` + dynamiczny import.
- Impl-review F2 (`fileParallelism`) świadomie nie adresowane — te pliki nie
  tworzą wierszy współdzielonych.

## Kryteria sukcesu (podsumowanie)

- Każdy tryb awarii AI SDK ma test potwierdzający zwinięcie do
  `500 {"error":"AI generation failed"}`, jawnie oznaczony jako świadoma regresja.
- Brak bariery czasowej po stronie serwera i klienta jest utrwalony testem,
  który złamie się, gdy `abortSignal`/timeout zostanie dodany.
- Nieograniczony kontrakt generowania (#5) jest zablokowany migawką z jasnym
  komentarzem, że to luka do zamknięcia, nie kontrakt.
- `test-plan.md` §6.4 pozwala dodać test kolejnego endpointu AI bez zgadywania;
  nigdzie nie pojawia się słowo „streaming".
