---
date: 2026-09-08T22:20:00+02:00
researcher: AndrzejKukuryk
git_commit: a382f2cc6347f83e83dba1f2cea0a05a929ac67b
branch: master
repository: 10x-cards
topic: "AI generation reliability — ciche awarie kontraktu generowania (#2) i brak kontroli kosztów (#5)"
tags: [research, codebase, generate-flashcards, ai-sdk, groq, rate-limiting, review-ui]
status: complete
last_updated: 2026-09-08
last_updated_by: AndrzejKukuryk
---

# Research: AI generation reliability (Faza 2 — Ryzyka #2 i #5)

**Date**: 2026-09-08T22:20:00+02:00
**Researcher**: AndrzejKukuryk
**Git Commit**: a382f2cc6347f83e83dba1f2cea0a05a929ac67b
**Branch**: master
**Repository**: 10x-cards

## Research Question

`/10x-research ai-generation-reliability @context/foundation/test-plan.md` —
ugruntować Ryzyko #2 ("Generowanie fiszek przez AI cicho przestaje działać —
żądanie zawodzi, streaming się psuje lub zniekształcone propozycje docierają
do UI przeglądu") oraz Ryzyko #5 ("Generowanie przez AI nie ma kontroli
kosztów/limitu") na bieżącym kodzie, dla Fazy 2 wdrożenia testów
(typy: integracyjne). Test-plan §2 wiersz #2 / §2 tabela reakcji / §3 Faza 2.

## Summary

1. **Endpoint NIE streamuje.** `src/pages/api/generate-flashcards.ts` używa
   `generateObject` z `ai` SDK (buforowane, pojedynczy obiekt JSON) i zwraca
   `new Response(JSON.stringify(object))` (buforowane ciało). Nie ma
   `streamObject`/`streamText`, SSE ani `ReadableStream` nigdzie w ścieżce
   generowania. **Założenie test-planu o "streamingu" (§2 #2, §2 tabela,
   §3 Faza 2) jest nieaktualne** — podobnie roadmap F-02 ("streaming response
   działa"). "Częściowy stream" / "streaming się psuje" to **nieistniejący
   tryb awarii** dla obecnej implementacji. Zgodnie z §1 zasadą 3 planu:
   badanie jest źródłem prawdy — Faza 2 musi zostać przeramowana z
   "streaming" na "buforowany kontrakt żądanie/odpowiedź".

2. **Prawdziwa powierzchnia cichej awarii (#2) to zwijanie błędów.**
   Endpoint ma **jeden `try/catch`**, w którym KAŻDY tryb awarii AI SDK —
   `APICallError` (Groq 4xx/5xx), `RetryError` (po 2 ponowieniach),
   `NoObjectGeneratedError` (model zwrócił <3 fiszki / zły kształt / ni 
   parsowalny JSON), `TypeValidationError`, `JSONParseError`, `AbortError`,
   goły `TypeError` z `fetch failed` — zwija się do jednego
   `500 {"error":"AI generation failed"}`. Klient / UI przeglądu **nie może
   odróżnić** "model dał za mało kart" od "Groq nie żyje".

3. **Brak jakiegokolwiek timeoutu/abort.** `generateObject` nie dostaje
   `abortSignal` ani `timeout`; AI SDK nie ma domyślnego timeoutu;
   `wrangler.jsonc` nie ustawia `limits.cpu_ms`. Zawieszone połączenie Groq
   nie ma żadnego ograniczenia na poziomie aplikacji. UI klienta (`fetch`
   bez `AbortController`) pokazuje wtedy spinner **w nieskończoność** —
   to jest dokładnie "ciche zawieszenie" z §2 #2.

4. **UI przeglądu ufa payloadowi ślepo.** `FlashcardGenerator.tsx` robi
   `(await res.json()) as FlashcardsOutput` i natychmiast
   `data.flashcards.map(...)` — brak walidacji runtime kształtu. Zniekształcony
   payload → goły `TypeError` w panelu błędu (brzydkie, ale nie zawieszenie).
   `flashcards: []` (gdyby ominęło walidację serwera) → **miękkie zawieszenie**
   w stanie `reviewing` "0 z 0", input zablokowany.

5. **Ryzyko #5: brak jakiegokolwiek limitera — potwierdzone z dowodami.**
   Zero rate-limitu / cooldownu / kwoty / licznika per użytkownik / dedupe
   w całej aplikacji. Endpoint wymaga zalogowania (własna bramka 401, nie
   middleware — `/api/*` nie jest w `PROTECTED_ROUTES`), ale każde pojedyncze
   konto (darmowa samoobsługowa rejestracja) może wołać `generateObject`
   w nieograniczonej pętli. 1 wywołanie modelu / żądanie, model
   `openai/gpt-oss-120b` przez Groq, brak cache identycznych wejść.
   PRD i roadmap zgodnie klasyfikują to jako **Open Question o wysokim
   priorytecie przed produkcją**, nie-blokujące dla developmentu.
   → Zgodnie z §2 tabelą reakcji (#5, anty-wzorzec "bezsensowna migawka"):
   Faza 2 traktuje #5 jako **flagę luki + jeden test dokumentujący obecny
   nieograniczony kontrakt jako świadomy stan MVP**, nie jako asercję
   pożądanego progu.

## Detailed Findings

### A. Kontrakt żądanie/odpowiedź — `src/pages/api/generate-flashcards.ts`

Cały plik: 66 linii.
[generate-flashcards.ts](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/pages/api/generate-flashcards.ts)

| Element | Zachowanie | Linia |
|---|---|---|
| Metoda | tylko `POST`; `export const prerender = false` | :8, :23 |
| Bramka auth | `!context.locals.user` → `401 {"error":"Unauthorized"}` | :24-26 |
| Bramka konfiguracji | `!GROQ_API_KEY` → `500 {"error":"AI service not configured"}` (po 401) | :28-30 |
| Nagłówki | **brak walidacji `Content-Type`** | — |
| Ciało — schema | `z.object({ text: z.string().min(40).max(1000) })`, `safeParse` | :12-14, :35 |
| Ciało nieprawidłowe | `422 {"error":"Invalid input","details": z.treeifyError(...)}` | :36-40 |
| Ciało nie-JSON | `request.json()` rzuca → `422 {"error":"Invalid JSON body"}` | :42-44 |
| Sukces | `200`, `Content-Type: application/json`, ciało = `JSON.stringify({flashcards:[{question,answer},...]})` | :55-58 |
| Dowolna awaria w bloku AI | `console.error` (tylko log) → `500 {"error":"AI generation failed"}` | :59-64 |

Braki:
- Brak własnej obsługi **405 method-not-allowed** — inne czasowniki obsługuje runtime Astro (404/405), nie JSON z tego pliku.
- Malformed JSON zwraca **422** (dyskusyjnie powinno być 400); "not configured" zwraca **500** (server fault — OK).
- Brak limitu rozmiaru żądania poza `text` max 1000 znaków.
- **Brak `abortSignal`/`timeout`** przekazanego do `generateObject`.

Wywołanie modelu ([:46-53](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/pages/api/generate-flashcards.ts#L46-L53)):
```ts
const groq = createGroq({ apiKey: GROQ_API_KEY });
const { object } = await generateObject({
  model: groq(MODEL_ID),            // MODEL_ID = "openai/gpt-oss-120b"  (:10)
  schema: flashcardsOutputSchema,   // z @/lib/ai-schemas
  system: SYSTEM_PROMPT,
  prompt: `Text:\n${inputText}`,
});
```
Brak `maxRetries` override (domyślne = 2), brak `abortSignal`, brak `timeout`.

Schema wyjścia — [`src/lib/ai-schemas.ts:3-13`](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/lib/ai-schemas.ts#L3-L13):
```ts
flashcards: z.array(z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})).min(3).max(10)
```

### B. Granica AI SDK — `generateObject` (nie-streaming)

Zainstalowane: `ai@6.0.208`, `@ai-sdk/groq@3.0.42`, `@ai-sdk/provider@3.0.10`,
`zod@4.4.3` (z `node_modules/*/package.json`; `package.json:31,18,43`).

Konkretne zachowanie rzucania (z `node_modules/ai/dist/index.mjs`):

**(a) Błąd HTTP dostawcy (Groq 4xx/5xx):** `@ai-sdk/provider-utils` `postJsonToApi`
rzuca **`APICallError`** (re-eksport z `ai`, `dist/index.mjs:3249`). Ponawialne
(429, 5xx) — retry do domyślnego **`maxRetries = 2`** (`dist/index.mjs:2679`);
po wyczerpaniu retry loop rzuca **`RetryError`** (`AI_RetryError`,
`dist/index.mjs:517-521, 2708, 2736`). Nieponawialny `APICallError` (401 zły
klucz, 400) propaguje bezpośrednio. Oba wychodzą z `generateObject` bez owinięcia.
- `LoadAPIKeyError` — ścieżka praktycznie martwa, bo klucz jest przekazywany
  jawnie do `createGroq({ apiKey })` (:47) i pre-sprawdzony na :28.

**(b) Model zwraca obiekt niezgodny z zod schema** (np. 2 fiszki vs `.min(3)`,
brak `answer`, pusty string vs `.min(1)`): `parseCompleteOutput` uruchamia
`safeParseJSON` potem `safeValidateTypes`; przy porażce walidacji rzuca
**`NoObjectGeneratedError`** (`AI_NoObjectGeneratedError`), `message: "No object
generated: response did not match schema."`, `cause = TypeValidationError`
(z `@ai-sdk/provider`) owijający issue zod. `dist/index.mjs:3654-3667`.
Nieparsowalny JSON → to samo `NoObjectGeneratedError`, `cause = JSONParseError`
(`dist/index.mjs:3643-3653`). Błąd niesie też `.text`, `.response`, `.usage`,
`.finishReason` (`dist/index.d.ts:4822-4848`). Brak `experimental_repairText` —
brak próby naprawy.

**(c) Timeout / abort sieci:** AI SDK **nie ma domyślnego timeoutu** —
`timeout` jest `undefined` chyba że ustawiony (`dist/index.d.ts:455, 3129`);
to wywołanie nie ustawia, nie przekazuje `abortSignal`. Zerwane połączenie /
DNS → `TypeError('fetch failed')`, które `handleFetchError` konwertuje na
**ponawialny `APICallError`** ("Cannot connect to API: …")
(`@ai-sdk/provider-utils/dist/index.mjs:594-624`) → retry ×2 → `RetryError`.
Faktyczny `AbortError`/`TimeoutError` (`error.name in AbortError|ResponseAborted|
TimeoutError`) przechodzi nietknięty, **nie** jest ponawiany.

**Czy cokolwiek jest łapane osobno? NIE.** Jeden `try/catch` (:46-64). Każde
z `APICallError`, `RetryError`, `NoObjectGeneratedError`, `TypeValidationError`,
`JSONParseError`, `AbortError`, `LoadAPIKeyError`, goły `TypeError` zwija się do:
```
console.error("[generate-flashcards] error:", msg)   // :62 — tylko log
→ 500 {"error":"AI generation failed"}                // :63
```
Brak `NoObjectGeneratedError.isInstance(err)`, brak osobnego 502/504/422 dla
"model dał za mało kart" vs "Groq down".

### C. Ograniczenia runtime Cloudflare Workers

- Adapter: `@astrojs/cloudflare@13.5.0`, `output: "server"`
  (`astro.config.mjs:12`); Worker — `wrangler.jsonc` `main:
  "@astrojs/cloudflare/entrypoints/server"`, `compatibility_date: "2026-05-08"`,
  `compatibility_flags: ["nodejs_compat"]`. Jest też `wrangler.pages.jsonc`
  (wariant Pages). Ścieżka Vite/Vitest **pomija adapter** (`astro.config.mjs:17-26`,
  `adapter: process.env.VITEST ? undefined : cloudflare({...})`).
- **Brak konfiguracji timeoutu/limitów.** Ani `wrangler.jsonc` ani
  `wrangler.pages.jsonc` nie ustawia `limits.cpu_ms`, `placement`, timeoutu.
  Jedyne extras: `observability.enabled: true` + nieużywany `SESSION` KV
  (`sessionBinding: false` w `astro.config.mjs:25`).
- Subrequesty: worst case 3 (`maxRetries=2`) na wywołanie — daleko poniżej
  limitu (50 Free / 1000 Paid). Nie problem.
- CPU: domyślnie 30 s (do 5 min na Paid via `limits.cpu_ms` — nie ustawione).
  CPU wyklucza czas oczekiwania na `fetch` — wolna odpowiedź Groq pali *wall*
  time, nie CPU.
- **Odpowiedź w pełni buforowana.** `generateObject` (nie `streamObject`)
  buforuje całą odpowiedź modelu po stronie serwera; `new Response(
  JSON.stringify(object))` serializuje w pamięci i wysyła jako jedno ciało.
  Brak `ReadableStream`/SSE.

### D. Konsumpcja przez UI przeglądu + ścieżka zapisu

Strona-host: [`src/pages/dashboard.astro:32`](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/pages/dashboard.astro#L32)
(`<FlashcardDashboard client:load />`), chroniona (`/dashboard` w
`PROTECTED_ROUTES`, `src/middleware.ts:4`).
Komponent: [`src/components/FlashcardGenerator.tsx`](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/components/FlashcardGenerator.tsx)
— generator ORAZ UI przeglądu w jednym (maszyna stanów
`idle | loading | error | reviewing | summary`).

**Wywołanie** ([:228-241](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/components/FlashcardGenerator.tsx#L228-L241)):
```ts
const res = await fetch("/api/generate-flashcards", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text }),
});
...
const data = (await res.json()) as FlashcardsOutput;      // ślepy rzut typu
const proposals = data.flashcards.map((f) => makeProposal(f.question, f.answer));
```
- **Brak `AbortSignal`/timeoutu.** Brak walidacji runtime kształtu odpowiedzi.
- Pre-checki klienta: `text.length >= 40` i `maxLength={1000}` na textarea
  (:32-33, :224, :363) — lustro serwerowego `inputSchema`.

**Obsługa trybów awarii w UI:**

| Tryb | Obsługa | Lokalizacja |
|---|---|---|
| non-2xx | `if (!res.ok)` → `res.json().catch(()=>({}))` → rzuca `err.error ?? "Błąd ${status}"` → `state:"error"` + panel + "Spróbuj ponownie" | :234-237, :387-399 |
| network error | `try/catch` → `state:"error"`, "Nieznany błąd" | :242-244 |
| malformed payload (`flashcards` brak) | **niebronione** — `data.flashcards.map` rzuca `TypeError`, łapane → panel błędu z gołym tekstem TypeError. Brzydkie, nie zawieszenie. | :239-243 |
| `flashcards: []` / <3 | serwer schema `.min(3)` → `generateObject` rzuca → 500. **Gdyby pusta tablica dotarła do klienta**: `proposals=[]`, stan `reviewing` "0 z 0", "Zaakceptuj wszystkie" disabled, input zablokowany (`isBlocked`, :207) — **miękkie zawieszenie**. Obecnie nieosiągalne dzięki walidacji serwera. | :240-241, :207-219 |
| brak pól `question`/`answer` | brak walidacji per-pole; `makeProposal` zapisze `undefined`, render pusty | :35-46 |

**Ryzyko cichego zawieszenia: TAK, częściowo.** Brak `AbortController` na
`fetch` + brak timeoutu na serwerze → zawieszony Groq = spinner "⏳ AI
generuje fiszki…" **w nieskończoność** (:379-384), przycisk zablokowany na
"Generowanie…", textarea disabled, brak anulowania bez reloadu strony.
Network error i non-2xx mają panel z przyciskiem odzyskiwania — te są OK.

**Ścieżka accept/edit/reject:**
- **Reject** (:317-321): czysto klient, nic nie wysyłane.
- **Accept** / **Edit→save** (`handleAccept` :257-296, `handleEditSave` :334-340):
  jeden `POST /api/flashcards` per karta, ciało `{ question, answer }` (:270-274).
- **Accept all** (`handleAcceptAll` :298-315): **N równoległych POST-ów**
  (`Promise.allSettled`). **Brak endpointu batch.**
- Serwer [`src/pages/api/flashcards.ts:7-10`](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/src/pages/api/flashcards.ts#L7-L10):
  `createFlashcardSchema = z.object({ question: z.string().trim().min(1),
  answer: z.string().trim().min(1) })`. Statusy: `201` sukces (:81-84),
  `401` (:44-46), `503` (:49-51), `422` (:56-65), `500` DB (:75-79).
- **`source` / provenance AI-vs-manual: NIE śledzone.** Klient nie wysyła,
  `flashcards.ts:71` wstawia tylko `{ user_id, question, answer }`. Brak
  kolumny `source` w migracjach (patrz E). Fiszki AI i ręczne są w DB
  nieodróżnialne.
- Klient sprawdza tylko `res.ok` (:276): przy porażce rzuca `Błąd zapisu
  ${status}`, cofa kartę do `pending`, inline retry link. 401 (sesja wygasła
  w trakcie przeglądu) jest retry-owalne ale będzie dalej padać — brak
  redirectu do sign-in.

### E. Tabela `flashcards` — brak kolumny provenance

[`supabase/migrations/20260610000000_create_flashcards.sql:11-18`](https://github.com/andrzejkukurykeuropa/10x-cards/blob/a382f2cc6347f83e83dba1f2cea0a05a929ac67b/supabase/migrations/20260610000000_create_flashcards.sql#L11-L18):
`flashcards (id, user_id, question, answer, created_at, updated_at)`.
Późniejsze migracje dodają tylko pola harmonogramu (SM-2, potem FSRS).
**Brak `source`/`origin`/`is_ai_generated` i brak enuma `FlashcardSource`**
w `src/types.ts` ani w migracjach. `types.ts:22-29` definiuje `Flashcard`,
`FlashcardDto`, `FlashcardProposal = {question, answer}`,
`GenerateFlashcardsRequest = {text}`.

### F. Ryzyko #5 — kontrola kosztów / rate-limiting: BRAK (potwierdzone)

Zero mechanizmu cost-control / rate-limit / throttle / kwota / metering
w całym kodzie aplikacji. Sprawdzone pliki:
- `src/pages/api/generate-flashcards.ts` — bramki: auth (:24-26), klucz API
  (:28), zod input (:12-14). Brak licznika / cooldownu / lookupu KV/DB.
  Jedno `generateObject` / żądanie (:48).
- `src/middleware.ts` — tylko auth/sesja + `PROTECTED_ROUTES` redirect.
  `PROTECTED_ROUTES = ["/dashboard", "/study", "/settings"]` (:4) —
  **`/api/*` NIE jest na liście**, middleware nie blokuje tras API (ale
  populuje `context.locals.user` z cookie dla wszystkich żądań, :7-16).
- `src/components/FlashcardGenerator.tsx` — `isBlocked` (:207) to czysto
  klientowa bramka UI (blokuje drugi *równoległy* generate), trywialna do
  obejścia; po `summary` + "Wygeneruj kolejne" (:438-447) użytkownik generuje
  bez limitu.
- `package.json` — brak biblioteki rate-limit (`@upstash/ratelimit`,
  `rate-limiter-flexible` itd.). `@upstash/redis` tylko jako tranzytywna
  opcjonalna zależność w lockfile, nieimportowana w `src/`.
- `wrangler.jsonc` — jeden KV `SESSION` (:17-22), **nieużywany**
  (`sessionBinding: false`). Brak `durable_objects`, brak rate-limiting
  bindingu, brak `[[unsafe.bindings]]`, brak cron `triggers`.
- `supabase/migrations/**` — brak `generation_log` / `usage` / `generations` /
  licznika per-user / kolumny kwoty.
- `supabase/config.toml:180-194` — `[auth.rate_limit]` istnieje, ale to
  wbudowany limiter **tylko auth** (emaile, sign-in/up, token refresh per IP)
  Supabase; nie dotyka `/api/generate-flashcards`.
- grep repo `rate|limit|throttle|quota|429|cooldown|credits|bucket|
  durable_object`: tylko `.limit(100)`/`.limit(500)` (row caps zapytań
  Supabase w `flashcards.ts:28`, `study/queue.ts:31` — nie kontrola nadużyć).
- Jedyny server-side limiter jakiegokolwiek rodzaju: admin cleanup endpoint
  z shared-secret bearer (`cleanup-inactive-accounts.ts:47`), wołany przez
  GitHub Actions schedule — niezwiązany z AI.

**Punkt wejścia dla nadużycia:** `POST /api/generate-flashcards` wymaga
uwierzytelnienia (własna bramka 401 endpointu, nie middleware). NIE jest
osiągalny w pełni nieuwierzytelniony, ale każde pojedyncze ważne konto
(darmowa samoobsługowa rejestracja email+hasło, FR-001) może wołać w
nieograniczonej pętli. Brak per-user cap, per-IP cap, dziennej kwoty,
CAPTCHA (`config.toml:196-199` captcha zakomentowana).

**Kształt kosztu per wywołanie:** model `openai/gpt-oss-120b` via Groq
(`createGroq({ apiKey: GROQ_API_KEY })`), dokładnie jedno `generateObject` /
żądanie, structured output, `system` + `Text:\n${inputText}` (wejście ≤1000
znaków), wyjście 3–10 par. Brak retry/backoff wrappera własnego, brak
batchowania, brak cache identycznych wejść. Koszt rośnie liniowo i bez
sufitu z liczbą żądań.

**Tekst PRD/roadmap (weryfikacja):**
- `context/foundation/prd.md:110-112` (Open Questions): *"1. **Kontrola
  kosztów generowania** — jak ograniczyć koszty gdy liczba użytkowników
  rośnie? Brak limitu per użytkownik może prowadzić do nieoczekiwanych
  kosztów operacyjnych. Owner: użytkownik. Priorytet: wysoki przed
  wdrożeniem produkcyjnym."*
- `prd.md:42-51` US-01, `prd.md:62-64` FR-003 (must-have; Sokrates:
  "kontrola budżetu to Open Question przed wdrożeniem produkcyjnym").
- `context/foundation/roadmap.md:86-97` F-02: *"…AI SDK poprawnie działający
  w Cloudflare Workers edge runtime — **streaming response działa**…"* —
  **nieaktualne wobec obecnego kodu** (`generateObject`, buforowane).
- `roadmap.md:114-125` S-02, `roadmap.md:232-234` (Roadmap Open Questions):
  ta sama luka, "Priorytet: wysoki przed uruchomieniem produkcyjnym".
- `context/foundation/shape-notes.md:22-23`: `topic: "AI cost risk"` /
  `decision: "risk acknowledged; no budget control in MVP → Open Question"`.

### G. Infrastruktura testowa z Fazy 1 (do reużycia)

Źródła: `context/changes/auth-access-control-coverage/{research,plan}.md`,
`reviews/impl-review.md`; `vitest.config.ts`; `tests/helpers/*`;
`tests/setup/global-setup.ts`.

**Lokalizacja / uruchomienie:** `vitest.config.ts:7`
`include: ["tests/**/*.test.ts"]`. Pliki w `tests/` (przekrojowe) i
`tests/api/` (per-endpoint). `package.json:13`: `"test": "vitest run"`.
Wymaga lokalnego Supabase (`npx supabase start`). Pełny clean run:
`npx supabase db reset && npm run test`. Dziś: 5 plików / 23 testy.

**`getViteConfig()`** — `vitest.config.ts:1-12`:
```ts
getViteConfig({ test: { environment: "node", include: ["tests/**/*.test.ts"],
  globalSetup: ["tests/setup/global-setup.ts"], testTimeout: 15000,
  passWithNoTests: true }})
```
`getViteConfig` z `astro/config` rozwiązuje pełną konfigurację Astro/Vite —
wirtualny moduł `astro:env/server` i alias `@/*` działają w testach jak w
aplikacji, bez dodatkowej konfiguracji. **Brak `setupFiles`**, tylko
`globalSetup`. Brak pakietów `@vitest/*`, brak coverage. `vitest ^4.1.11`
to jedyna zależność testowa — **brak `msw`, brak `nock`**.

**Adapter Cloudflare pomijany w Vitest:** `astro.config.mjs:17-26`
`adapter: process.env.VITEST ? undefined : cloudflare({...})` — plugin Vite
adaptera ustawia `resolve.external` dla worker environment, co koliduje z
`node` environment Vitest. Udokumentowane w `plan.md:611-621` (Addendum),
`impl-review.md:71-79` (F5).

**Env w testach — dwa mechanizmy:**
- W plikach testów / kodzie app (`astro:env/server`): Vitest w `mode: "test"`
  auto-ładuje `.env` + `.env.test`. `astro.config.mjs:27-38` deklaruje
  wszystkie jako `envField.string({ context: "server", access: "secret",
  optional: true })` — w tym **`GROQ_API_KEY` (:36)**. Wszystkie optional →
  brak klucza = `undefined`, nie rzuca.
- W `globalSetup` (poza grafem modułów Vite): `tests/setup/global-setup.ts:16`
  ładuje `.env.test` jawnie via `dotenv` `{ path: ".env.test", override: true }`.

**`.env.test` (gitignored) zawiera dziś TYLKO** `SUPABASE_URL`, `SUPABASE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (wszystkie `http://127.0.0.1:54321`).
`.env.test.example` dokumentuje tylko te trzy. **`GROQ_API_KEY` NIE jest w
`.env.test`** → dziś w testach jest `undefined`, a
`generate-flashcards.ts:28-30` zwraca `500 {"error":"AI service not
configured"}` **zanim** dojdzie do modelu. Faza 2 musi albo dodać (dummy)
`GROQ_API_KEY` do `.env.test`/`.env.test.example`, albo mockować powyżej tego
checku.

**`buildApiContext`** — `tests/helpers/api-context.ts:39-79`:
```ts
buildApiContext({ method, url, headers?, body?, cookies?, locals?, params? }): APIContext
```
Domyślne: `cookies = createCookieJar()`, `locals = { user: null }`,
`params = {}`. Fałszuje minimalny `as any as APIContext` z polami które czytają
handlery + middleware: `request` (prawdziwy `new Request`), `cookies`
(in-memory `CookieJar`), `locals`, `params`, `url` (`new URL`),
`redirect(location, status=302)`. Brak serwera HTTP — handlery importowane
wprost i wołane `await handler(context)`.

**`signInAsTestUser`** — `tests/helpers/test-session.ts:14-52`:
`signInAsTestUser({ email, password }): Promise<{ cookieHeader, user }>`.
Buduje prawdziwy `@supabase/ssr createServerClient`, woła prawdziwe
`supabase.auth.signInWithPassword` (HTTP do lokalnego GoTrue), zwraca
produkcyjnie ukształtowany `Cookie` header (możliwie chunked
`sb-<ref>-auth-token.N`) + `data.user`. Callerzy przekazują **oba**:
`headers: { Cookie: cookieHeader }` ORAZ `locals: { user }` — bo handlery
czytają `locals.user` do bramkowania 401/404, a zapytanie Supabase idzie
czysto z cookie sesji.

**Sprzątanie:** `cleanupFlashcards(ids: string[])`
(`tests/helpers/test-session.ts:59-76`) — klient **service-role**
(`SUPABASE_SERVICE_ROLE_KEY`), `assertLocalSupabaseUrl` guard,
`admin.from("flashcards").delete().in("id", ids)`. Wzorzec:
```ts
const createdIds: string[] = [];
afterEach(async () => { await cleanupFlashcards(createdIds.splice(0)); });
```
Sesje w `beforeAll`. ID rejestrowane **po** asercji `201`. Testy **nigdy nie
zakładają pustej tabeli** — asercje ID-scoped (dwaj stali użytkownicy
dzieleni między plikami).

**`assertLocalSupabaseUrl`** — `tests/setup/global-setup.ts:65-76`: rzuca
jeśli hostname `SUPABASE_URL` ≠ `127.0.0.1`/`localhost`. Wołane przed każdą
destrukcyjną ścieżką service-role. Był to KRYTYCZNY fix F1
(`impl-review.md:23-35`).

**Reguła kontroli pozytywnej** (`test-plan.md:156-160`, obowiązkowa;
`plan.md:445-448`): każdy plik testujący "non-owner gets 404" musi zawrzeć
"owner gets 200/204" na tym samym zasobie.

**Styl asercji:** tylko obserwowalny kontrakt HTTP (status + JSON body),
nigdy lustro implementacji. `auth-gating.test.ts:25-68` — table-driven
`it.each` po 7 endpointach asertująca `401` + `{error:"Unauthorized"}`.
`generate-flashcards` **pojawia się dziś tylko w `auth-gating.test.ts`**
(ćwiczy jedynie ścieżkę 401 `locals.user = null`, nie dochodzi do checku
`GROQ_API_KEY`). **Brak testu ćwiczącego gałąź AI.**

**Mockowanie — nowość dla tej fazy.** Faza 1 mockowała **zero** usług
zewnętrznych (prawdziwy lokalny Supabase wszędzie). Jedyne `vi.*`:
`vi.spyOn(context, "redirect")` + `vi.fn()` w `tests/middleware.test.ts`.
**Brak `vi.mock(...)` gdziekolwiek.** Wskazówki:
- `test-plan.md:97` (§4): "Mockuj dostawcę AI (`ai` SDK) i klienta Supabase
  **na granicy sieci, nie wewnętrznie**".
- `test-plan.md:184` (§6.4, TBD): ta faza ma napisać wzorzec cookbook.
- AI SDK dostarcza test doubles (`MockLanguageModelV2`, `simulateReadableStream`,
  `mockId` pod `ai/test`). Naturalna granica: `vi.mock("ai")` zwracające
  kontrolowalne `generateObject`, albo wstrzyknięcie mock modelu.

**Fragility z impl-review (istotne dla Fazy 2):**
- **F2 (SKIPPED)** — `vitest.config.ts` **nie** ustawia `fileParallelism: false`
  ani single-thread. Vitest odpala pliki równolegle; suite dzieli dwóch
  stałych użytkowników i jedną prawdziwą tabelę `flashcards`. Przechodzi dziś
  tylko dzięki asercjom ID-scoped. **Nowy plik AI-generation tworzący
  fiszki/rows dla tych samych użytkowników pogarsza to.** Rekomendacja:
  `test.fileParallelism = false` (lub `poolOptions.threads.singleThread`).
- **F3 (SKIPPED)** — helper sign-in duplikuje factory prod klienta zamiast
  importować `createClient()` z `src/lib/supabase.ts`; cichy dryf.
- **F8** — nie wołaj `signInAsTestUser` per parametryzowana trasa; raz w
  `beforeAll` per użytkownik.
- `context.locals.user` gatuje tylko 401/404 i **nie** wpływa na to jakiej
  roli SQL używa Supabase — test z `locals.user` ustawionym ale bez ważnego
  cookie odpytuje jako `anon`, RLS blokuje wszystko → fałszywie pozytywny
  pass izolacji (`plan.md:59-67`).

## Code References

- `src/pages/api/generate-flashcards.ts:23-30` — bramki: POST, auth 401, `!GROQ_API_KEY` 500
- `src/pages/api/generate-flashcards.ts:32-44` — walidacja wejścia, 422 (bad input / bad JSON)
- `src/pages/api/generate-flashcards.ts:46-53` — `generateObject`, brak `abortSignal`/`timeout`/`maxRetries`
- `src/pages/api/generate-flashcards.ts:55-58` — sukces 200, buforowane `JSON.stringify(object)`
- `src/pages/api/generate-flashcards.ts:59-64` — **jeden catch-all → 500 "AI generation failed"** (rdzeń Ryzyka #2)
- `src/lib/ai-schemas.ts:3-13` — `flashcardsOutputSchema` (`.min(3).max(10)`, `question/answer` `.min(1)`)
- `src/components/FlashcardGenerator.tsx:228-244` — fetch bez timeoutu, ślepy `as FlashcardsOutput`, obsługa błędów
- `src/components/FlashcardGenerator.tsx:207-219` — `isBlocked`, miękkie zawieszenie przy `flashcards: []`
- `src/components/FlashcardGenerator.tsx:257-315` — accept / accept-all (N równoległych POST), brak batcha
- `src/components/FlashcardGenerator.tsx:379-399` — spinner "w nieskończoność" vs panel błędu z retry
- `src/pages/api/flashcards.ts:7-10,44-84` — `createFlashcardSchema`, statusy 201/401/422/500/503; brak `source`
- `src/middleware.ts:4` — `PROTECTED_ROUTES` bez `/api/*`
- `src/middleware.ts:7-16` — populacja `context.locals.user` dla wszystkich żądań
- `astro.config.mjs:17-26` — adapter Cloudflare pomijany gdy `process.env.VITEST`
- `astro.config.mjs:36` — `GROQ_API_KEY` `envField.string({ context: "server", access: "secret", optional: true })`
- `wrangler.jsonc:14-22` — brak `limits.cpu_ms`; nieużywany `SESSION` KV
- `supabase/migrations/20260610000000_create_flashcards.sql:11-18` — schemat tabeli, brak `source`
- `vitest.config.ts:1-12` — `getViteConfig`, `globalSetup`, `testTimeout: 15000`, brak `fileParallelism: false`
- `tests/helpers/api-context.ts:39-79` — `buildApiContext`
- `tests/helpers/test-session.ts:14-52,59-76` — `signInAsTestUser`, `cleanupFlashcards`
- `tests/setup/global-setup.ts:16,65-76` — ładowanie `.env.test`, `assertLocalSupabaseUrl`
- `tests/api/auth-gating.test.ts:25-68` — jedyny obecny dotyk `generate-flashcards` (tylko ścieżka 401)
- `context/foundation/prd.md:110-112` — Open Question: kontrola kosztów generowania
- `context/foundation/roadmap.md:86-97` — F-02 (twierdzi "streaming response działa" — nieaktualne)

## Architecture Insights

- **Zwijanie błędów jako główny anty-wzorzec niezawodności.** Wszystkie
  rozróżnialne tryby awarii AI SDK (schema-fail vs outage vs abort) tracą
  tożsamość w jednym `catch → 500`. Kontrakt widoczny dla klienta to
  binarne 200/500 — UI przeglądu nie może zdegradować się z gracją
  (np. "model dał słabe wyniki, spróbuj przeformułować tekst" vs "usługa
  niedostępna"). To jest testowalne na warstwie integracyjnej: mock granicy
  HTTP Groq → assert że każdy tryb daje `500 {"error":"AI generation
  failed"}`, i **udokumentować to zwijanie jako świadome ryzyko** (regresja
  "current behavior", styl Fazy 1).
- **Brak bariery czasowej end-to-end.** Trzy poziomy bez timeoutu: `fetch`
  klienta, `generateObject`, Worker CPU/wall. Jakikolwiek jeden bounded
  poziom (najtańszy: `abortSignal` z `AbortSignal.timeout(...)` w endpoincie)
  zamknąłby scenariusz "spinner w nieskończoność".
- **Streaming istnieje tylko w dokumentach, nie w kodzie.** Historyczny spike
  `ai-sdk-edge-spike` (F-02) używał streamingu; wdrożony `ai-generation-flow`
  (S-02) przełączył na `generateObject`. Test-plan §2/§3 i roadmap F-02
  odziedziczyły nieaktualne założenie. Faza 2 powinna przeramować sformułę
  ryzyka #2 i zaktualizować §6.4 cookbook bez wspominania streamingu.
- **Boundary do mockowania jest czysty:** `import { generateObject } from
  "ai"` + `import { createGroq } from "@ai-sdk/groq"`. `vi.mock("ai")` z
  kontrolowanym `generateObject` (rzuca `NoObjectGeneratedError` /
  `APICallError` / zwraca zły obiekt / wisi) pokrywa wszystkie tryby #2 bez
  sieci i bez klucza Groq. Alternatywa bliższa "granicy sieci": mock
  `fetch`/`@ai-sdk/provider-utils`, ale to kruche wobec wersji SDK.
- **Ryzyko #5 nie ma "poprawnego" kontraktu do asertowania** — nie ma
  progu. Jedyny uczciwy test to lock obecnego zachowania: "10 kolejnych
  żądań generowania z jednej sesji — wszystkie przechodzą (200), brak 429" +
  komentarz że to świadomy stan MVP i PRD Open Question. Nie budować limitera
  w tej fazie (poza granicami lekcji / zakresu test-planu).

## Historical Context (from prior changes)

- `context/changes/auth-access-control-coverage/plan.md` — wzorzec testu
  integracyjnego: bezpośrednie wołanie handlera + `buildApiContext` +
  `signInAsTestUser`; `testTimeout: 15000` bo prawdziwe HTTP do GoTrue;
  reguła "nie naprawiaj app z testu — zalockuj current behavior jako
  labeled regression" (`plan.md:84-87`); `locals.user` nie wpływa na rolę
  SQL (`plan.md:59-67`); Addendum o pomijaniu adaptera Cloudflare
  (`plan.md:611-621`).
- `context/changes/auth-access-control-coverage/research.md` — Faza 1
  mockowała zero usług zewnętrznych; prawdziwy lokalny Supabase + RLS.
- `context/changes/auth-access-control-coverage/reviews/impl-review.md` —
  verdict REJECTED; F1 (assertLocalSupabaseUrl, fixed), F2 (fileParallelism,
  SKIPPED — istotne dla nowego pliku tworzącego rows), F3/F7/F8 (SKIPPED).
- `context/foundation/roadmap.md` F-02 `ai-sdk-edge-spike` / S-02
  `ai-generation-flow` — geneza rozjazdu "streaming vs generateObject".

## Related Research

- `context/changes/auth-access-control-coverage/research.md` — infrastruktura
  testowa, na której ta faza się opiera.

## Open Questions

1. **Mock `vi.mock("ai")` vs mock warstwy `fetch`.** §4 test-planu mówi
   "granica sieci, nie wewnętrznie". `vi.mock("ai")` jest wewnętrzny wobec
   procesu ale zewnętrzny wobec logiki endpointu i stabilny; mock `fetch`
   jest bliższy literze §4 ale kruchy wobec `@ai-sdk/groq@3.0.42` internals.
   Do rozstrzygnięcia w `/10x-plan` (koszt × sygnał).
2. **Czy Faza 2 dodaje `abortSignal`/timeout do endpointu, czy tylko go
   testuje jako brakujący?** Granice lekcji mówią "nie pisz kodu produkcyjnego"
   w test-planie, ale §3 Faza 2 to faza wdrożeniowa z własnym folderem zmiany —
   `/10x-plan` decyduje czy minimalna bariera czasowa wchodzi w zakres, czy
   jest osobną zmianą (rekomendacja: osobna, żeby test najpierw zalockował
   obecny brak).
3. **Dummy `GROQ_API_KEY` w `.env.test`** — potrzebny jeśli mock jest powyżej
   checku `:28`; niepotrzebny jeśli `vi.mock("ai")` + test nie ustawia klucza
   (wtedy trzeba osobno przetestować ścieżkę `500 "AI service not configured"`).
4. **F2 fileParallelism** — czy ta faza wreszcie ustawia
   `test.fileParallelism = false`, skoro dodaje kolejny plik piszący do
   `flashcards` dla stałych użytkowników.
5. **Test zapisu propozycji** (`POST /api/flashcards` z accept-all N
   równoległych) — w zakresie Fazy 2 czy Ryzyka #3 (Faza 1, już complete)?
   Prawdopodobnie poza zakresem — ścieżka zapisu nie jest AI-specyficzna.
