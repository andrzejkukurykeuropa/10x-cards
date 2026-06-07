# GitHub Issues — 10x-cards

> Repozytorium: [andrzejkukurykeuropa/10x-cards](https://github.com/andrzejkukurykeuropa/10x-cards)
> Pobrano: 2026-06-07

---

## #1 — [F-01] Schemat danych fiszek

**Stan:** OPEN  
**Etykiety:** `fundament`  
**URL:** https://github.com/andrzejkukurykeuropa/10x-cards/issues/1

**Change ID:** `flashcard-schema`

**Wynik:** Tabela `flashcards` istnieje w Supabase z poprawną migracją SQL i polityką RLS — każdy użytkownik widzi tylko własne fiszki. Gotowa do odczytu i zapisu przez kolejne fragmenty.

**Wymagania wstępne:** —

**Odblokowania:** S-01, S-02

**Odnośniki PRD:** Access Control (model płaski per użytkownik), Guardrails (dane fiszek nie mogą być tracone)

**Strumień:** A — Fundament danych i kolekcja

**Niewiadome:** —

---

## #2 — [F-02] Szkielet integracji AI na edge

**Stan:** OPEN  
**Etykiety:** `fundament`  
**URL:** https://github.com/andrzejkukurykeuropa/10x-cards/issues/2

**Change ID:** `ai-sdk-edge-spike`

**Wynik:** AI SDK poprawnie działający w Cloudflare Workers edge runtime — streaming response działa, tekst wejściowy nie jest trwale przechowywany po odpowiedzi, endpoint zwraca ustrukturyzowane pary pytanie-odpowiedź. Weryfikuje główny bloker techniczny przed budowaniem UI wokół niego.

**Wymagania wstępne:** —

**Odblokowania:** S-02 (kompletny przepływ AI); redukuje `top_blocker: skills`

**Odnośniki PRD:** FR-003 (generowanie przez AI), NFR (streaming < 200 ms, tekst nie przechowywany)

**Strumień:** B — Integracja AI

**Niewiadome:**
- [ ] Czy wybrany AI SDK (Vercel `ai` / `@anthropic-ai/sdk` / `openai`) działa w Cloudflare Workers bez workaroundów dla Node.js API? **Bloker: TAK** — weryfikacja jest celem tego fundamentu; bez pozytywnej odpowiedzi S-02 nie może być planowane.

---

## #3 — [S-01] Przeglądanie kolekcji

**Stan:** OPEN  
**Etykiety:** `fragment`  
**URL:** https://github.com/andrzejkukurykeuropa/10x-cards/issues/3

**Change ID:** `collection-view`

**Wynik:** Zalogowany użytkownik może zobaczyć listę swoich fiszek w kolekcji (lub pusty stan zachęcający do wygenerowania pierwszych). Widok dostępny z poziomu dashboardu.

**Wymagania wstępne:** #1 (F-01 — schemat danych)

**Odnośniki PRD:** FR-006

**Strumień:** A — Fundament danych i kolekcja

**Uwaga:** Można budować równolegle z F-02 — dwie niezależne ścieżki.

**Niewiadome:** —

---

## #4 — [S-02] ⭐ Kompletny przepływ AI (North Star)

**Stan:** OPEN  
**Etykiety:** `fragment`, `north-star`  
**URL:** https://github.com/andrzejkukurykeuropa/10x-cards/issues/4

**Change ID:** `ai-generation-flow`

**Wynik:** Zalogowany użytkownik może wkleić tekst, zainicjować generowanie fiszek przez AI, zobaczyć listę propozycji (każdą zaakceptować, edytować lub odrzucić) i mieć zaakceptowane fiszki automatycznie zapisane do kolekcji — widoczne natychmiast w widoku kolekcji.

**Wymagania wstępne:** #1 (F-01 — schemat danych), #2 (F-02 — AI na edge)

**Odnośniki PRD:** US-01, FR-003, FR-004, FR-005

**Strumień:** A + B — punkt połączenia obu strumieni

**Niewiadome:**
- [ ] Który model AI (GPT-4o-mini, Claude Haiku, inny) daje najlepszy stosunek jakości fiszek do kosztu dla języków obcych? **Bloker: NIE** — tańszy model wystarczy do MVP; można wymienić bez zmian architektury.
- [ ] Kontrola kosztów API AI — limit generowania per użytkownik? **Bloker: NIE** dla dev; **TAK** przed produkcją dla realnych użytkowników.

---

## #5 — [S-03] Edycja i usuwanie fiszek w kolekcji

**Stan:** OPEN  
**Etykiety:** `fragment`, `nice-to-have`  
**URL:** https://github.com/andrzejkukurykeuropa/10x-cards/issues/5

**Change ID:** `collection-edit-delete`

**Wynik:** Zalogowany użytkownik może edytować treść istniejącej fiszki w kolekcji (zmiana pytania lub odpowiedzi) oraz usunąć wybraną fiszkę.

**Wymagania wstępne:** #4 (S-02 — kompletny przepływ AI)

**Odnośniki PRD:** FR-007, FR-008

**Strumień:** A — Fundament danych i kolekcja

**Uwaga:** Nice-to-have. Parkuj jeśli `top_blocker: skills` pochłonie dostępny czas.

**Niewiadome:** —
