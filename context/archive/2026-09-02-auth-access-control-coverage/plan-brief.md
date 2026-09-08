# Pokrycie testami dostępu/autoryzacji — Krótki plan

> Pełny plan: `context/changes/auth-access-control-coverage/plan.md`
> Badania: `context/changes/auth-access-control-coverage/research.md`

## Co i dlaczego

Budujemy od zera infrastrukturę testową (Vitest + Astro 6 + Cloudflare
Workers) i pierwszy zestaw testów integracyjnych projektu, pokrywających
Ryzyko #1 (integralność sesji/middleware) i Ryzyko #3 (izolacja danych
między użytkownikami) z `context/foundation/test-plan.md` §3 Faza 1.

## Punkt wyjścia

Dziś w repozytorium nie istnieje żaden runner testów, konfiguracja ani
plik `*.test.*`. Middleware chroni tylko trzy prefiksy stron
(`/dashboard`, `/study`, `/settings`) — nie chroni `/api/*`. Izolacja
danych jest wymuszona podwójnie: politykami RLS na `flashcards` per
operację oraz jawnym filtrem `.eq("user_id", ...)` w każdym zapytaniu
aplikacyjnym.

## Pożądany stan końcowy

`npm run test` uruchamia Vitest wobec lokalnego Supabase i zielono
przechodzi zestaw testów potwierdzających: middleware poprawnie
przekierowuje niezalogowanych, każdy endpoint `/api/*` zwraca 401 bez
sesji, a dwaj niezależni użytkownicy testowi nigdy nie widzą ani nie
modyfikują nawzajem swoich fiszek/danych nauki. `test-plan.md` §6.2 ma
prawdziwy przepis zamiast "TBD".

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Dane testowe | Prawdziwy lokalny Supabase (docker) | Jedyny sposób by faktycznie zweryfikować RLS, nie tylko atrapę filtra aplikacyjnego | Plan (pytanie 1) |
| Tożsamości testowe | 2 stali użytkownicy, tworzeni idempotentnie przez Admin API w `globalSetup` (nie surowy SQL) | Surowy `INSERT INTO auth.users` nie tworzy konta zdolnego do logowania — RLS wymaga prawdziwej sesji JWT | Plan (pytanie 2 + korekta techniczna w Kroku 2) |
| Wywoływanie endpointów | Bezpośredni import handlera + skonstruowany `APIContext` | Szybkie, łatwe wstrzyknięcie sesji obu tożsamości | Plan (pytanie 3) |
| Middleware | Bezpośrednie wywołanie `onRequest` z atrapą `context`/`next` | Precyzyjnie testuje przekierowanie i dopasowanie prefiksu | Plan (pytanie 4) |
| Weryfikacja RLS | Tylko przez endpointy, bez dedykowanego testu "RLS-only" | Świadomy kompromis kosztu — patrz Otwarte Ryzyka | Plan (pytanie 5) |
| Przypadki brzegowe | Dopasowanie prefiksu (`/dashboard-anything`) + połykanie błędów `signout.ts` | Oba wskazane w research.md jako warte zablokowania testem regresyjnym | Plan (pytanie 6) |
| Lokalizacja plików | Osobny katalog `tests/` odzwierciedlający `src/` | Czysty rozdział źródeł od testów w projekcie bez istniejącej konwencji | Plan (pytanie 7) |
| Wpięcie CI | Tylko lokalny skrypt `npm run test`, bez zmian w `ci.yml` | Zgodne z zakresem test-plan.md §3 Faza 1 — CI to Faza 5 | Plan (pytanie 8) |

## Zakres

**W zakresie:**
- Cała infrastruktura testowa (Vitest, `.env.test`, użytkownicy testowi, helpery)
- Testy middleware ochrony stron + przypadek brzegowy prefiksu
- Testy 401 dla wszystkich endpointów `/api/*` konsumujących `locals.user`
- Test integralności logowania/wylogowania (w tym połykanie błędów w `signout.ts`)
- Testy izolacji danych: `flashcards` CRUD + `study/queue` + `study/review`
- Aktualizacja `test-plan.md` §6.2 prawdziwym wzorcem

**Poza zakresem:**
- Testy e2e, narzędzia wizualne
- Ryzyko #6 (czyszczenie nieaktywnych kont), ścieżka service-role poza tworzeniem użytkowników testowych
- Wpięcie do `.github/workflows/ci.yml` (Faza 5)
- Dedykowany test "RLS-only" z pominięciem filtra aplikacyjnego
- Naprawa zachowania aplikacji (prefiks middleware, `signout.ts`) — tylko zablokowanie testem obecnego kontraktu

## Architektura / Podejście

Cztery fazy w kolejności koszt × sygnał: (1) infrastruktura — bez niej nic
innego nie powstanie; (2) najtańsza warstwa wysokiego sygnału — middleware
i bramkowanie 401, fałszywy kontekst bez bazy; (3) najdroższa warstwa —
prawdziwe dane, dwóch użytkowników, prawdziwa baza; (4) utrwalenie wzorca w
podręczniku. Kluczowy mechanizm techniczny: logowanie w testach odtwarza
prawdziwe ciasteczka `@supabase/ssr`, wywołując tę samą fabrykę
`createClient()` co produkcja z fałszywym magazynem ciasteczek — bez
ręcznego odtwarzania formatu tokenu.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Infrastruktura testowa | Vitest + lokalny Supabase + helpery logowania/sprzątania | `globalSetup` działa poza grafem Vite — wymaga jawnego `dotenv` |
| 2. Middleware i bramkowanie (#1) | Testy ochrony stron + 401 na `/api/*` + integralność logowania | Fałszywy `locals.user` bez prawdziwego ciasteczka dałby fałszywy pozytyw |
| 3. Izolacja danych (#3) | Testy CRUD fiszek i nauki między dwoma użytkownikami | Sprzątanie między testami — dzieleni użytkownicy mogą przeciekać stan |
| 4. Podręcznik i finalizacja | Aktualizacja `test-plan.md` §6.2, pełny przebieg od zera | — |

**Wymagania wstępne:** Docker zainstalowany i uruchomiony (do `npx supabase start`); `.env.test.example` skopiowany do `.env.test` z prawdziwymi kluczami lokalnej instancji.
**Szacowany wysiłek:** ~1-2 sesje implementacyjne w 4 fazach.

## Otwarte ryzyka i założenia

- **Brak dedykowanego testu RLS-only** (świadoma decyzja, pytanie 5): jeśli
  ktoś w przyszłości usunie `.eq("user_id", ...)` z zapytania aplikacyjnego
  ORAZ jednocześnie polityka RLS ma dziurę, żaden test tej fazy tego nie
  wykryje — obie warstwy testowane są tylko łącznie, przez zachowanie
  endpointu.
- Testy zależą od `npx supabase start` uruchomionego lokalnie/w CI — bez
  Dockera cała Faza 1+ nie może się wykonać.

## Kryteria sukcesu (podsumowanie)

- `npm run test` przechodzi zielono od czystej bazy (`supabase db reset`)
- Middleware i wszystkie endpointy `/api/*` odrzucają brak sesji
- Użytkownik B nigdy nie widzi/modyfikuje danych użytkownika A (fiszki,
  kolejka nauki, przegląd)
