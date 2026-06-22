# AI SDK edge spike — Krótki plan

> Pełny plan: `context/changes/ai-sdk-edge-spike/plan.md`

## Co i dlaczego

Instalujemy Vercel AI SDK i tworzymy permanentny endpoint `POST /api/generate-flashcards`, który strumieniuje propozycje fiszek (Q&A) wygenerowane przez GPT-4o-mini. Cel jest podwójny: (1) zweryfikować, że SDK działa na Cloudflare Workers edge runtime bez Node.js compat mode — to był główny bloker techniczny projektu (`top_blocker: skills`); (2) dostarczyć endpoint, który S-02 (`ai-generation-flow`) używa bez żadnego refaktoru.

## Punkt wyjścia

Brak AI SDK w projekcie — żadne paczki `ai`, `@ai-sdk/*`, `zod` nie są zainstalowane. `astro.config.mjs` ma gotowy wzorzec `env.schema` dla server secrets (Supabase); `src/types.ts` i wzorzec API routes (`src/pages/api/flashcards.ts`) są gotowe do naśladowania.

## Pożądany stan końcowy

`POST /api/generate-flashcards` przyjmuje tekst (40–1000 znaków), autoryzuje przez `context.locals.user` i strumieniuje `{ flashcards: [{question, answer}, …] }` (3–10 par) jako Server-Sent Events. `npm run build` przechodzi bez błędów — dowód zgodności z Cloudflare Workers. Tekst wejściowy nie jest logowany. S-02 może wystartować.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| AI provider | OpenAI | Najszersza dostępność modeli, GPT-4o-mini dobry stosunek jakości/ceny dla MVP | Plan |
| AI SDK | Vercel AI SDK (`ai` + `@ai-sdk/openai`) | Edge-native (Web Fetch API), `streamObject` + `useObject` = spójne server+client API | Plan |
| Model | GPT-4o-mini | Tani, wystarczająca jakość dla fiszek językowych w MVP | Plan |
| Streaming | `streamObject` → `toDataStreamResponse()` | Spełnia NFR "streaming widoczny cały czas"; klient S-02 użyje `useObject` z `ai/react` | Plan |
| Endpoint destiny | Permanentny `/api/generate-flashcards` | Brak throwaway code; S-02 używa bez zmian | Plan |
| Limity tekstu | Min 40, max 1000 znaków | Zabezpieczenie przed pustymi requestami i nierozsądnymi kosztami | Plan |
| Liczba fiszek | 3–10 (soft limit w prompcie i Zod) | Elastyczność dla różnych długości tekstu | Plan |
| Error codes | 401 + 422 + 500 | Minimalne kody wymagane przez klienta React w S-02 | Plan |
| Zod schema | Wydzielona do `src/lib/ai-schemas.ts` | Reużywalna przez endpoint i `useObject` w S-02 | Plan |

## Zakres

**W zakresie:**
- Instalacja `ai`, `@ai-sdk/openai`, `zod`
- `OPENAI_API_KEY` w `astro.config.mjs` env schema i `.env.example`
- `FlashcardProposal`, `GenerateFlashcardsRequest` w `src/types.ts`
- `flashcardsOutputSchema` w `src/lib/ai-schemas.ts`
- `POST /api/generate-flashcards` z auth, walidacją, streaming, obsługą błędów
- Weryfikacja edge runtime przez `npm run build` + ręczny curl test

**Poza zakresem:**
- Żaden frontend/UI — to S-02
- Persystencja tekstu ani propozycji
- Rate limiting / kontrola kosztów per użytkownik
- Inne providery AI
- Testy automatyczne (brak test runnera w projekcie)

## Architektura / Podejście

```
POST /api/generate-flashcards
  ├── auth check → 401
  ├── JSON parse + Zod validation (min 40, max 1000) → 422
  ├── createOpenAI({ apiKey: OPENAI_API_KEY })  ← astro:env/server
  ├── streamObject({ model, schema: flashcardsOutputSchema, prompt })
  └── result.toDataStreamResponse()  ← stream do klienta
```

`flashcardsOutputSchema` (Zod) żyje w `src/lib/ai-schemas.ts` — importowany przez endpoint (server) i przez `useObject` w S-02 (client).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Instalacja i konfiguracja | `ai @ai-sdk/openai zod` w node_modules; `OPENAI_API_KEY` w env schema | Build może pokazać niezgodność edge; rozwiązanie: sprawdź wersję paczki |
| 2. Typy i Zod schema | `FlashcardProposal`, `GenerateFlashcardsRequest`, `flashcardsOutputSchema` | Brak ryzyka — czyste typy/schema |
| 3. Endpoint | Działający `POST /api/generate-flashcards` ze streaming | `streamObject` bez `await` — błąd tu blokuje całe S-02 |
| 4. Weryfikacja | `npm run build` + curl streaming test | Jeśli build failuje: `node_compat = true` w `wrangler.toml` jako fallback |

**Wymagania wstępne:** F-01 done (✅), S-01 done (✅), klucz OpenAI API dostępny lokalnie  
**Szacowany wysiłek:** ~1 sesja, 4 fazy

## Otwarte ryzyka i założenia

- **Ryzyko:** Starsze wersje Vercel AI SDK mogą używać Node.js built-ins (np. `crypto`, `buffer`) niekompatybilnych z Cloudflare Workers bez `node_compat`. Rozwiązanie: zainstalować najnowszą v4.x; jeśli build failuje — dodać `node_compat = true` do `wrangler.toml`.
- **Założenie:** `toDataStreamResponse()` jest dostępne na obiekcie zwróconym przez `streamObject` — sprawdzić w docs przy pierwszym uruchomieniu (API mogło zmienić się między wersjami).
- **Założenie:** `OPENAI_API_KEY` jest `optional: true` w env schema — dev server startuje bez klucza, ale wywołanie endpointu bez klucza zwraca 500.

## Kryteria sukcesu (podsumowanie)

- `npm run build` przechodzi bez błędów edge runtime
- `POST /api/generate-flashcards` z ważnym tekstem strumieniuje dane zanim AI skończy generować
- Tekst wejściowy nie pojawia się w logach serwera
