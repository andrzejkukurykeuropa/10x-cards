# Plan implementacji F-02 — AI SDK na Cloudflare edge

## Przegląd

Instalujemy Vercel AI SDK (`ai` + `@ai-sdk/openai` + `zod`) i tworzymy permanentny endpoint `POST /api/generate-flashcards`, który strumieniuje ustrukturyzowane propozycje fiszek (Q&A) przy użyciu `streamObject`. Endpoint staje się bezpośrednią bazą dla S-02 — żaden refaktor nie będzie potrzebny. Jednocześnie weryfikujemy, że SDK działa poprawnie na Cloudflare Workers edge runtime (bez Node.js compat mode), co było głównym blokerem technicznym (`top_blocker: skills` z roadmapy).

## Analiza stanu obecnego

- Brak AI SDK w `package.json` — żadna paczka `ai`, `@ai-sdk/*`, `openai`, `zod`
- `astro.config.mjs` ma `env.schema` z `SUPABASE_URL` + `SUPABASE_KEY` jako `astro:env/server` secrets — wzorzec gotowy do rozszerzenia o `OPENAI_API_KEY`
- `.env.example` istnieje (zakładamy) z kluczami Supabase — wymaga wpisu dla `OPENAI_API_KEY`
- Wzorzec endpointu API: `export const prerender = false`, uppercase `POST`, `createClient(headers, cookies)`, JSON przez `new Response(JSON.stringify(...))`
- `src/types.ts` — istnieje, eksportuje `Flashcard` + `FlashcardDto`; brak typów dla flow generowania

## Pożądany stan końcowy

Po zakończeniu tego planu:
- `POST /api/generate-flashcards` przyjmuje `{ text: string }` (40–1000 znaków), weryfikuje auth i strumieniuje `{ flashcards: [{ question, answer }, …] }` jako Server-Sent Events
- `npm run build` przechodzi bez błędów — potwierdza zgodność z Cloudflare Workers edge runtime
- `npm run lint` przechodzi
- Streaming widoczny w przeglądarce/curl jeszcze przed zakończeniem generowania
- Tekst wejściowy nie jest logowany ani przechowywany po zakończeniu requestu
- `src/types.ts` eksportuje `FlashcardProposal` i `GenerateFlashcardsRequest`

**Weryfikacja:** `npm run build` bez błędów + ręczny curl do `/api/generate-flashcards` z ważnym tekstem zwraca stream zanim AI skończy generować.

### Kluczowe odkrycia

- Vercel AI SDK v4 używa Web Fetch API wewnętrznie — kompatybilny z Cloudflare Workers bez `node_compat = true`
- `createOpenAI({ apiKey })` z `@ai-sdk/openai` wymaga jawnego przekazania klucza — **nie** `process.env.OPENAI_API_KEY`, bo `astro:env/server` to nie `process.env`
- `streamObject` bez `await` startuje stream natychmiast; `result.toDataStreamResponse()` zwraca standardowy `Response` — poprawny typ zwracany z `APIRoute`
- `OPENAI_API_KEY` jako `optional: true` w env schema: Astro startuję bez klucza (dev bez AI), ale endpoint zwróci 500 przy wywołaniu

## Czego NIE robimy

- Brak frontendu, komponentów React, UI do recenzji — to S-02
- Brak persystencji: tekst wejściowy i propozycje nie są zapisywane do bazy
- Brak limitu per-użytkownik ani rate limiting — open question z PRD; przed produkcją, nie bloker MVP
- Brak obsługi innych providerów (Anthropic, Gemini) — decyzja: OpenAI; podmiana to jedna linijka w przyszłości dzięki Vercel AI SDK abstrakcji
- Brak Claude Haiku — GPT-4o-mini to model docelowy

## Podejście do implementacji

Cztery fazy bez zależności między 1 a 2 (można równolegle), ale 3 zależy od 1 i 2. Faza 4 to czysta weryfikacja.

1. **Instalacja i konfiguracja** — paczki npm + env schema + `.env.example`
2. **Typy i schema Zod** — `src/types.ts` + wielokrotnie używana `outputSchema` do wydzielenia jako moduł
3. **Endpoint** — `POST /api/generate-flashcards` z pełną logiką
4. **Weryfikacja edge runtime** — lint + build + ręczny test stream

## Krytyczne szczegóły implementacji

- **`createOpenAI` musi być wywoływany wewnątrz handlera** (lub jako moduł-singleton importowany z `astro:env/server` po raz pierwszy wewnątrz Astro runtime). Bezpieczne: `const client = createOpenAI({ apiKey: OPENAI_API_KEY })` wewnątrz `POST` handler — `OPENAI_API_KEY` pochodzi z `import { OPENAI_API_KEY } from 'astro:env/server'`.
- **`streamObject` nie jest `await`-owany**: `const result = streamObject({...}); return result.toDataStreamResponse();` — `await` przed `streamObject` zablokuje stream do momentu zakończenia generowania (koniec strumieniowania = cała odpowiedź naraz).
- **Typ odpowiedzi dla S-02**: `toDataStreamResponse()` zwraca stream w formacie Vercel AI SDK Data Protocol. Klient w S-02 będzie używał `useObject` z `ai/react` do konsumpcji tego streamu — nie zwykłe `fetch().then(r => r.json())`.

---

## Faza 1: Instalacja zależności i konfiguracja środowiska

### Przegląd

Instalujemy trzy paczki npm i konfigurujemy zmienną środowiskową `OPENAI_API_KEY` w Astro env schema i `.env.example`. Po tej fazie projekt buduje się z nowymi zależnościami.

### Wymagane zmiany

#### 1. Instalacja paczek npm

**Plik**: `package.json` (modyfikowany przez npm)

**Cel**: Dodanie Vercel AI SDK, providera OpenAI i Zod jako zależności runtime.

**Kontrakt**: `npm install ai @ai-sdk/openai zod` — trzy nowe wpisy w `dependencies`.

#### 2. Konfiguracja env schema

**Plik**: `astro.config.mjs`

**Cel**: Zarejestrowanie `OPENAI_API_KEY` jako server-only secret w Astro env schema — umożliwia import przez `astro:env/server` w endpoincie.

**Kontrakt**: W bloku `env.schema` dodać obok istniejących kluczy Supabase:
```js
OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
```

#### 3. Aktualizacja .env.example

**Plik**: `.env.example`

**Cel**: Udokumentowanie nowej zmiennej środowiskowej dla przyszłych devów (i dla CI).

**Kontrakt**: Dodać linię `OPENAI_API_KEY=sk-...` z komentarzem wskazującym na OpenAI Dashboard.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Paczki zainstalowane: `node_modules/ai` i `node_modules/@ai-sdk/openai` istnieją
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build` (weryfikacja podstawowej zgodności edge)

#### Weryfikacja ręczna

- `astro.config.mjs` zawiera wpis `OPENAI_API_KEY` w env schema
- `.env.example` zawiera `OPENAI_API_KEY=sk-...`

**Uwaga implementacyjna**: Po przejściu build w Fazie 1 i ręcznym potwierdzeniu env schema, zatrzymaj się przed Fazą 2.

---

## Faza 2: Typy TypeScript i Zod schema outputu AI

### Przegląd

Dodajemy `FlashcardProposal` i `GenerateFlashcardsRequest` do `src/types.ts`, a schemat Zod dla outputu AI wydzielamy do `src/lib/ai-schemas.ts` — reużywalny przez endpoint i (w przyszłości) przez testy.

### Wymagane zmiany

#### 1. Nowe typy w src/types.ts

**Plik**: `src/types.ts`

**Cel**: Dodanie typów dla flow generowania — `FlashcardProposal` (propozycja przed zapisem, bez `id`/`user_id`) i `GenerateFlashcardsRequest` (body requestu). Istniejące typy `Flashcard` i `FlashcardDto` pozostają bez zmian.

**Kontrakt**:
```typescript
export interface FlashcardProposal {
  question: string;
  answer: string;
}

export interface GenerateFlashcardsRequest {
  text: string;
}
```

#### 2. Schemat Zod outputu AI

**Plik**: `src/lib/ai-schemas.ts` (nowy)

**Cel**: Centralny schemat Zod opisujący strukturę, jaką `streamObject` ma wyprodukować. Wydzielony z endpointu, żeby S-02 mógł go zaimportować do walidacji i typowania po stronie klienta.

**Kontrakt**:
```typescript
import { z } from "zod";

export const flashcardsOutputSchema = z.object({
  flashcards: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      })
    )
    .min(3)
    .max(10),
});

export type FlashcardsOutput = z.infer<typeof flashcardsOutputSchema>;
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna

- `src/types.ts` eksportuje `FlashcardProposal` i `GenerateFlashcardsRequest`
- `src/lib/ai-schemas.ts` istnieje i eksportuje `flashcardsOutputSchema`

**Uwaga implementacyjna**: Fazy 1 i 2 można implementować równolegle — brak zależności między nimi.

---

## Faza 3: Endpoint POST /api/generate-flashcards

### Przegląd

Tworzymy główny endpoint generowania fiszek. Obsługuje auth check, walidację wejścia, wywołanie `streamObject` z GPT-4o-mini i strumieniowanie odpowiedzi do klienta. Tekst wejściowy nie jest logowany.

### Wymagane zmiany

#### 1. Endpoint generowania

**Plik**: `src/pages/api/generate-flashcards.ts` (nowy)

**Cel**: Obsługa `POST /api/generate-flashcards` — autoryzacja, walidacja tekstu (40–1000 znaków), wywołanie `streamObject`, zwrócenie streaming response. Endpoint staje się bezpośrednio używany przez S-02 bez modyfikacji.

**Kontrakt**:

```typescript
import type { APIRoute } from "astro";
import { createOpenAI } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";
import { OPENAI_API_KEY } from "astro:env/server";
import { flashcardsOutputSchema } from "@/lib/ai-schemas";

export const prerender = false;

const inputSchema = z.object({
  text: z.string().min(40).max(1000),
});

const SYSTEM_PROMPT = `You are a language learning flashcard creator. 
Given a text, extract key vocabulary, phrases, grammar rules, and concepts. 
Create between 3 and 10 flashcard pairs. Each flashcard must have:
- question: testing knowledge of a specific item from the text
- answer: a clear, concise explanation or translation
Focus on the most important and learnable content for a language learner.`;

export const POST: APIRoute = async (context) => {
  // Auth
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // API key check
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500 });
  }

  // Input validation
  let text: string;
  try {
    const body = await context.request.json();
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input", details: parsed.error.flatten() }), {
        status: 422,
      });
    }
    text = parsed.data.text;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 422 });
  }

  // AI generation
  try {
    const client = createOpenAI({ apiKey: OPENAI_API_KEY });
    const result = streamObject({
      model: client("gpt-4o-mini"),
      schema: flashcardsOutputSchema,
      prompt: `${SYSTEM_PROMPT}\n\nText:\n${text}`,
    });
    return result.toDataStreamResponse();
  } catch {
    return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500 });
  }
};
```

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build` (kluczowy test edge runtime)

#### Weryfikacja ręczna

- `POST /api/generate-flashcards` z `Authorization` i ważnym tekstem zwraca streaming response (Content-Type: `text/event-stream` lub `text/plain; charset=utf-8`)
- Streaming widoczny przed zakończeniem generowania (pierwsze bajty przychodzą w < 2 s)
- `POST /api/generate-flashcards` bez sesji zwraca 401
- `POST /api/generate-flashcards` z tekstem < 40 znaków zwraca 422
- `POST /api/generate-flashcards` z tekstem > 1000 znaków zwraca 422

**Uwaga implementacyjna**: Po przejściu build i ręcznym potwierdzeniu streaming, zatrzymaj się — Faza 4 to oddzielna weryfikacja.

---

## Faza 4: Weryfikacja edge runtime

### Przegląd

Końcowe potwierdzenie, że cały stack działa na Cloudflare Workers edge runtime. `npm run build` kompiluje kod do Cloudflare Workers format — wszelkie niezgodności z edge API ujawniają się tutaj. Ręczny test curl z prawdziwym kluczem OpenAI.

### Wymagane zmiany

Brak zmian kodu — tylko weryfikacja.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Build przechodzi kompletnie: `npm run build` bez ostrzeżeń edge runtime
- Lint przechodzi: `npm run lint`

#### Weryfikacja ręczna

- Curl test z prawdziwym `OPENAI_API_KEY` (lokalny dev server `npm run dev`): `curl -X POST http://localhost:4321/api/generate-flashcards -H "Content-Type: application/json" -d '{"text":"...40+ char sample text..."}'` — przy zalogowanym użytkowniku zwraca chunki JSON przed zakończeniem
- Pierwsze dane strumieniowe widoczne w < 2 s od wysłania requestu
- Nie ma logowania tekstu wejściowego w konsoli serwera (weryfikacja NFR: tekst nie przechowywany po odpowiedzi)
- Wylądowany commit — F-02 gotowy dla S-02

**Uwaga implementacyjna**: Jeśli `npm run build` zgłosi błędy związane z Node.js API (np. `require`, `fs`, `crypto`), sprawdź wersję paczki `ai` i `@ai-sdk/openai` — Vercel AI SDK v4.x jest edge-compatible; wcześniejsze wersje mogą wymagać `node_compat = true` w `wrangler.toml`.

---

## Strategia testowania

### Testy ręczne

1. Zaloguj się do dev servera (`npm run dev`) jako testowy użytkownik
2. `curl -X POST http://localhost:4321/api/generate-flashcards -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"text":"Bonjour means hello in French. Au revoir means goodbye."}'` — obserwuj chunki w terminalu
3. Sprawdź 401: ten sam curl bez cookie
4. Sprawdź 422: `{"text":"za krótki"}` (< 40 znaków)
5. Sprawdź 422: tekst > 1000 znaków
6. Brak logowania tekstu w konsoli serwera

### Kryteria edge compatibility

- `npm run build` bez błędów = SDK działa na Cloudflare Workers
- Streaming widoczny przed zakończeniem = `streamObject` + `toDataStreamResponse()` działa na edge

## Uwagi dotyczące migracji

Brak zmian w bazie danych. `.env.example` i `.dev.vars` (dla Cloudflare local dev) wymagają wpisu `OPENAI_API_KEY`.

## Referencje

- Roadmap: `context/foundation/roadmap.md` — F-02
- PRD: `context/foundation/prd.md` — FR-003, NFR (streaming < 200 ms, text not stored)
- Tech stack: `context/foundation/tech-stack.md` — AI SDK recommendation
- Vercel AI SDK streamObject: https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object
- Istniejący wzorzec endpointu: `src/pages/api/flashcards.ts`
- Istniejący wzorzec env: `src/lib/supabase.ts`, `astro.config.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Install dependencies and configure environment

#### Automated

- [x] 1.1 Install ai @ai-sdk/openai zod packages — 1364a98
- [x] 1.2 Lint passes: npm run lint — 1364a98
- [x] 1.3 Build passes: npm run build — 1364a98

#### Manual

- [x] 1.4 astro.config.mjs contains OPENAI_API_KEY in env schema — 1364a98
- [x] 1.5 .env.example contains OPENAI_API_KEY entry — 1364a98

### Phase 2: TypeScript types and Zod output schema

#### Automated

- [x] 2.1 Add FlashcardProposal and GenerateFlashcardsRequest to src/types.ts — a12f5e3
- [x] 2.2 Create src/lib/ai-schemas.ts with flashcardsOutputSchema — a12f5e3
- [x] 2.3 Lint passes: npm run lint — a12f5e3
- [x] 2.4 Build passes: npm run build — a12f5e3

#### Manual

- [x] 2.5 Verify FlashcardProposal and GenerateFlashcardsRequest exported from src/types.ts — a12f5e3
- [x] 2.6 Verify flashcardsOutputSchema exported from src/lib/ai-schemas.ts — a12f5e3

### Phase 3: POST /api/generate-flashcards endpoint

#### Automated

- [x] 3.1 Create src/pages/api/generate-flashcards.ts
- [x] 3.2 Lint passes: npm run lint
- [x] 3.3 Build passes: npm run build

#### Manual

- [x] 3.4 POST with valid auth and text returns streaming response
- [x] 3.5 POST without session returns 401
- [x] 3.6 POST with text < 40 chars returns 422
- [x] 3.7 POST with text > 1000 chars returns 422

### Phase 4: Edge runtime verification

#### Automated

- [ ] 4.1 Full build passes without edge runtime warnings: npm run build
- [ ] 4.2 Lint passes: npm run lint

#### Manual

- [ ] 4.3 Curl test shows streaming chunks visible before generation completes
- [ ] 4.4 First streaming data arrives in < 2s from request send
- [ ] 4.5 Input text not logged in server console (NFR: text not stored)
