---
project: "10xCards"
version: 1
status: draft
created: 2026-06-05
updated: 2026-07-07
prd_version: 1
top_blocker: skills
---

# Mapa drogowa: 10xCards

> Pochodzi z `context/foundation/prd.md` (v1) + automatycznie zbadana baza kodu (2026-06-05).
> Edytuj na miejscu; archiwizuj po zastąpieniu.
> Fragmenty poniżej są wymienione w kolejności zależności. Tabela „W skrócie" to indeks.

## Podsumowanie wizji

10xCards eliminuje żmudną ręczną pracę przy tworzeniu fiszek — samouk wkleja tekst (artykuł, dialog, fragment podręcznika) i otrzymuje gotowe propozycje par pytanie-odpowiedź wygenerowane przez AI, które może zaakceptować, poprawić lub odrzucić przed zapisem do osobistej kolekcji.

Klin produktu — jedyna cecha, która po usunięciu sprawia, że 10xCards staje się nie do odróżnienia od zwykłego notatnika — to pętla: AI generuje → człowiek weryfikuje → zatwierdzone fiszki trafiają do kolekcji. Projekt jest jednocześnie edukacyjny: głównym celem jest nauka budowania kompletnego produktu AI-first od zera.

## Gwiazda przewodnia

**S-02: Kompletny przepływ AI** — Użytkownik wkleja tekst, AI generuje propozycje fiszek, użytkownik je przegląda i akceptuje, zaakceptowane trafiają do kolekcji.

> Gwiazda przewodnia to najmniejszy, kompletny fragment, którego dostarczenie udowadnia podstawową hipotezę produktu (AI jako skrót do fiszek) — umieszczony tak wcześnie, jak pozwalają na to wymagania wstępne (F-01 + F-02). Bez S-02 wszystko inne to CRUD bez klina.

## W skrócie

| ID | Change ID | Wynik (użytkownik może…) | Wymagania wstępne | Odnośniki PRD | Status |
|---|---|---|---|---|---|
| F-01 | `flashcard-schema` | (fundament) tabela `flashcards` w Supabase z migracją SQL i RLS per użytkownik | — | Access Control, Guardrails | done |
| F-02 | `ai-sdk-edge-spike` | (fundament) AI SDK zintegrowany i zweryfikowany w Cloudflare Workers edge runtime (streaming działa) | — | FR-003, NFR | done |
| S-01 | `collection-view` | przeglądać swoje fiszki w kolekcji (lista kart + pusty stan) | F-01 | FR-006 | done |
| S-02 | `ai-generation-flow` | wkleić tekst → zobaczyć propozycje AI → zaakceptować / edytować / odrzucić → zapisać do kolekcji | F-01, F-02 | US-01, FR-003, FR-004, FR-005 | done |
| S-03 | `collection-edit-delete` | edytować i usuwać fiszki w kolekcji (nice-to-have) | S-02 | FR-007, FR-008 | done |

## Strumienie

Pomoc nawigacyjna — grupuje elementy, które dzielą łańcuch wymagań wstępnych. Kanoniczna kolejność nadal znajduje się w grafie zależności poniżej; ta tabela to proponowana kolejność czytania w równoległych ścieżkach.

| Strumień | Temat | Łańcuch | Uwaga |
|---|---|---|---|
| A | Fundament danych i kolekcja | `F-01` → `S-01` → `S-02` → `S-03` | Ścieżka danych; S-01 można budować, gdy F-02 jest jeszcze w toku. |
| B | Integracja AI | `F-02` → `S-02` | Klin AI-first (top_blocker: skills); dołącza do Strumienia A w `S-02`. |

## Baza

Co już jest na miejscu w bazie kodu na dzień 2026-06-05 (automatycznie zbadane + potwierdzone).
Fundamenty poniżej zakładają, że są one obecne i NIE odbudowują ich.

- **Frontend:** obecny — Astro + React islands + Tailwind 4 (`astro.config.mjs`); brak `src/components/ui/` (shadcn/ui instaluje się per fragment)
- **Backend / API:** obecny — Astro SSR; middleware uwierzytelniania w `src/middleware.ts`; endpointy auth w `src/pages/api/auth/`
- **Dane:** częściowy — klient Supabase w `src/lib/supabase.ts` + `supabase/config.toml`; brak migracji SQL (`supabase/migrations/` nieobecny)
- **Uwierzytelnianie:** obecne — Supabase auth; strony signin/signup/signout; ochrona tras (`PROTECTED_ROUTES`) w `src/middleware.ts`
- **Wdrożenie / infrastruktura:** obecne — `@astrojs/cloudflare` w `astro.config.mjs`; CI/CD w `.github/workflows/ci.yml`
- **Obserwowalność:** nieobecna aplikacyjnie — brak Sentry/OTel; Cloudflare Workers Logs wystarczą dla MVP

## Fundamenty

### F-01: Schemat danych fiszek

- **Status:** done
- **Wynik:** (fundament) Tabela `flashcards` istnieje w Supabase z poprawną migracją SQL i polityką RLS — każdy użytkownik widzi tylko własne fiszki. Gotowa do odczytu i zapisu przez kolejne fragmenty.
- **Change ID:** `flashcard-schema`
- **Odnośniki PRD:** Access Control (model płaski per użytkownik), Guardrails (dane fiszek nie mogą być tracone)
- **Odblokowania:** S-01 (przeglądanie kolekcji), S-02 (zapis zaakceptowanych fiszek)
- **Wymagania wstępne:** —
- **Równolegle z:** F-02
- **Blokady:** —
- **Niewiadome:** —

---

### F-02: Szkielet integracji AI na edge

- **Status:** done
- **Wynik:** (fundament) AI SDK poprawnie działający w Cloudflare Workers edge runtime — streaming response działa, tekst wejściowy nie jest trwale przechowywany po odpowiedzi, endpoint zwraca ustrukturyzowane pary pytanie-odpowiedź. Weryfikuje główny bloker techniczny przed budowaniem UI wokół niego.
- **Change ID:** `ai-sdk-edge-spike`
- **Odnośniki PRD:** FR-003 (generowanie przez AI), NFR (potwierdzenie < 200 ms + streaming widoczny przez cały czas), NFR (tekst nie przechowywany)
- **Odblokowania:** S-02 (kompletny przepływ AI); redukuje `top_blocker: skills`
- **Wymagania wstępne:** —
- **Równolegle z:** F-01, S-01
- **Blokady:** —
- **Niewiadome:**
  - Pytanie: Czy wybrany AI SDK (Vercel `ai` / `@anthropic-ai/sdk` / `openai`) działa w Cloudflare Workers bez workaroundów dla Node.js API? Owner: developer. Block: **tak** — weryfikacja jest celem tego fundamentu; bez pozytywnej odpowiedzi S-02 nie może być planowane.

## Fragmenty

### S-01: Przeglądanie kolekcji

- **Status:** done
- **Wynik:** Zalogowany użytkownik może zobaczyć listę swoich fiszek w kolekcji (lub pusty stan zachęcający do wygenerowania pierwszych). Widok dostępny z poziomu dashboardu.
- **Change ID:** `collection-view`
- **Odnośniki PRD:** FR-006
- **Wymagania wstępne:** F-01
- **Równolegle z:** F-02 (S-01 można budować, gdy F-02 jest jeszcze w toku — dwie niezależne ścieżki)
- **Blokady:** —
- **Niewiadome:** —

---

### S-02: Kompletny przepływ AI ⭐ GWIAZDA PRZEWODNIA

- **Status:** done
- **Wynik:** Zalogowany użytkownik może wkleić tekst, zainicjować generowanie fiszek przez AI, zobaczyć listę propozycji (każdą zaakceptować, edytować lub odrzucić) i mieć zaakceptowane fiszki automatycznie zapisane do kolekcji — widoczne natychmiast w S-01.
- **Change ID:** `ai-generation-flow`
- **Odnośniki PRD:** US-01, FR-003, FR-004, FR-005
- **Wymagania wstępne:** F-01, F-02
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:**
  - Pytanie: Który model AI (GPT-4o-mini, Claude Haiku, inny) daje najlepszy stosunek jakości fiszek do kosztu dla języków obcych? Owner: developer (decyzja przed implementacją). Block: **nie** — tańszy model wystarczy do MVP; można wymienić bez zmian architektury.
  - Pytanie (z PRD): Kontrola kosztów API AI — limit generowania per użytkownik? Owner: developer. Block: **nie** dla developmentu; **tak** przed uruchomieniem dla realnych użytkowników.

---

### S-03: Edycja i usuwanie fiszek w kolekcji (nice-to-have)

- **Status:** done
- **Wynik:** Zalogowany użytkownik może edytować treść istniejącej fiszki w kolekcji (zmiana pytania lub odpowiedzi) oraz usunąć wybraną fiszkę.
- **Change ID:** `collection-edit-delete`
- **Odnośniki PRD:** FR-007, FR-008
- **Wymagania wstępne:** S-02
- **Równolegle z:** —
- **Blokady:** —
- **Niewiadome:** —

## Otwarte pytania mapy drogowej

1. **Kontrola kosztów API AI** (z PRD §Open Questions) — jak ograniczyć koszty generowania gdy liczba użytkowników rośnie? Brak limitu per użytkownik może prowadzić do nieoczekiwanych kosztów operacyjnych. Owner: developer. Priorytet: wysoki przed uruchomieniem produkcyjnym dla realnych użytkowników.

## Odłożone (parkuj)

- **Własny algorytm SRS (SM-2)** — poza zakresem MVP; dodać w v2, gdy podstawowy przepływ generowania działa. (PRD §Non-Goals)
- **Import plików (PDF, DOCX)** — tylko tekst wklejany ręcznie w v1. (PRD §Non-Goals)
- **Współdzielenie zestawów fiszek między użytkownikami** — brak w v1. (PRD §Non-Goals)
- **Integracja z Duolingo / Anki** — poza zakresem. (PRD §Non-Goals)
- **Aplikacja mobilna** — tylko web w v1. (PRD §Non-Goals)
- **Ręczne tworzenie fiszek (FR-009)** — nice-to-have; AI-first focus, parkuj po ukończeniu S-02.
- **S-03 / FR-007+FR-008** — nice-to-have; parkuj jeśli `top_blocker: skills` pochłonie dostępny czas.

## Done

- **F-01: (fundament) tabela `flashcards` w Supabase z migracją SQL i RLS per użytkownik** — Archived 2026-06-13 → `context/archive/2026-06-10-flashcard-schema/`. Lesson: —.
- **F-02: (fundament) AI SDK poprawnie działający w Cloudflare Workers edge runtime — streaming response działa** — Archived 2026-06-23 → `context/archive/2026-06-22-ai-sdk-edge-spike/`. Lesson: —.
- **S-01: Zalogowany użytkownik może zobaczyć listę swoich fiszek w kolekcji (lista kart + pusty stan)** — Archived 2026-06-15 → `context/archive/2026-06-10-collection-view/`. Lesson: —.
- **S-02: Zalogowany użytkownik może wkleić tekst → zobaczyć propozycje AI → zaakceptować / edytować / odrzucić → zapisać do kolekcji** — Archived 2026-06-23 → `context/archive/2026-06-22-ai-generation-flow/`. Lesson: —.
- **S-03: Zalogowany użytkownik może edytować treść istniejącej fiszki w kolekcji (zmiana pytania lub odpowiedzi) oraz usunąć wybraną fiszkę** — Archived 2026-07-07 → `context/archive/2026-07-07-collection-edit-delete/`. Lesson: —.

<!-- Wypełnia /10x-archive po ukończeniu każdego fragmentu. -->
