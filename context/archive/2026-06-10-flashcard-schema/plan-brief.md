# F-01: Schemat danych fiszek — Krótki plan

> Pełny plan: `context/changes/flashcard-schema/plan.md`

## Co i dlaczego

Tworzymy fundament danych 10xCards: tabelę `flashcards` w Supabase z migracją SQL i politykami RLS izolującymi dane per użytkownik. Bez tej tabeli S-01 (przeglądanie kolekcji) i S-02 (generowanie AI) nie mogą być implementowane.

## Punkt wyjścia

`supabase/migrations/` nie istnieje — projekt ma skonfigurowany klient Supabase SSR i zlinkowany zdalny projekt, ale żadnych migracji. `src/types.ts` również nie istnieje.

## Pożądany stan końcowy

Tabela `flashcards` istnieje w zdalnym Supabase, każdy zalogowany użytkownik widzi, wstawia i modyfikuje wyłącznie własne wiersze (RLS). `src/types.ts` eksportuje interfejs `Flashcard` gotowy do użycia przez kolejne fragmenty.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) |
| --- | --- | --- |
| Kolumna `source` | Defer do S-02 | F-01 minimalny — S-02 doda kolumnę w swojej migracji jeśli potrzebna |
| `updated_at` aktualizacja | Trigger PostgreSQL | Gwarancja auto-aktualizacji bez zależności od warstwy aplikacji |
| Weryfikacja migracji | Zdalny Supabase (`db push --linked`) | Projekt już zlinkowany; brak lokalnego Docker w workflow |
| Własność `src/types.ts` | F-01 | F-01 jest pierwszym elementem, który definiuje encję `Flashcard` |

## Zakres

**W zakresie:**
- `supabase/migrations/20260610000000_create_flashcards.sql` — tabela, trigger, RLS (4 polityki)
- `src/types.ts` — interfejs `Flashcard`

**Poza zakresem:**
- Kolumna `source` (ai/manual) → S-02
- Endpoint API → S-01
- UI kolekcji → S-01
- Logika AI → S-02

## Architektura / Podejście

Czysta warstwa danych — żadnego kodu aplikacji poza typami. Migracja SQL tworzy tabelę z FK do `auth.users(id) ON DELETE CASCADE` (Guardrails PRD: dane nie mogą być tracone gdy konto jest usunięte), trigger PostgreSQL zarządza `updated_at`, RLS gwarantuje izolację między użytkownikami.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. SQL Migration | Tabela `flashcards` z RLS zaaplikowana na zdalnym Supabase | Projekt niezlinkowany lokalnie — `db push --linked` może wymagać `supabase login` |
| 2. TypeScript type | `src/types.ts` z `Flashcard` interface | S-01 plan planował go sam — trzeba upewnić się że S-01 nie nadpisuje |

**Wymagania wstępne:** Dostęp do zdalnego projektu Supabase (`supabase login` + projekt zlinkowany).  
**Szacowany wysiłek:** ~1 sesja, 2 fazy.

## Otwarte ryzyka i założenia

- `supabase/.temp/linked-project.json` istnieje — zakładamy że `npx supabase db push --linked` zadziała bez dodatkowego `supabase link`
- S-01 plan (collection-view) planował stworzyć `src/types.ts` — po F-01 trzeba zaktualizować S-01 plan aby nie nadpisywał pliku (a jedynie go rozszerzał)

## Kryteria sukcesu (podsumowanie)

- `npx supabase db push --linked` kończy się bez błędów
- Tabela widoczna w Supabase Dashboard z 4 aktywnymi politykami RLS
- `src/types.ts` istnieje i eksportuje `Flashcard`; lint przechodzi
