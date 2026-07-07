# Plan implementacji: Edit and delete flashcards in the collection

## Przegląd

Zalogowany użytkownik może edytować i usuwać fiszki bezpośrednio w kolekcji. Edycja działa inline (karta zamienia się w formularz), usuwanie wymaga potwierdzenia inline ("Na pewno? Tak / Nie"). Żadnych nowych bibliotek, żadnych modali.

## Analiza stanu obecnego

- Tabela `flashcards` w Supabase ma RLS z politykami SELECT, INSERT, **UPDATE i DELETE** dla właściciela — baza gotowa.
- API (`src/pages/api/flashcards.ts`) eksponuje tylko `GET` i `POST`. Brakuje endpointów PATCH i DELETE dla konkretnej fiszki.
- `FlashcardCollection.tsx` renderuje karty tylko do odczytu — brak przycisków akcji.
- `FlashcardGenerator.tsx` (l.48–194) ma już inline edit dla propozycji AI — wzorzec do naśladowania.
- Mechanizm odświeżania kolekcji istnieje: prop `refreshKey` + `useEffect([refreshKey])` w `FlashcardCollection`.
- shadcn/ui dostępne: `button.tsx`, `textarea.tsx` — wystarczające dla inline edit.

## Pożądany stan końcowy

Każda karta w kolekcji ma dwa przyciski: **Edytuj** i **Usuń**.

- **Edytuj** zamienia kartę w formularz z polami pytania i odpowiedzi (textarea). Zapis wysyła PATCH do API; sukces odświeża listę. Anulowanie przywraca widok.
- **Usuń** zamienia przyciski na "Na pewno? Tak / Nie". Potwierdzenie wysyła DELETE do API; sukces odświeża listę.
- Błędy operacji wyświetlane inline na karcie.

### Kluczowe odkrycia

- `supabase/migrations/20260610000000_create_flashcards.sql` — RLS `FOR UPDATE` i `FOR DELETE` dla `auth.uid() = user_id` już istnieją; żadna migracja nie jest potrzebna.
- `src/pages/api/flashcards.ts:18` — wzorzec: `createClient(context.request.headers, context.cookies)` + `context.locals.user`.
- `src/components/FlashcardGenerator.tsx:48–194` — wzorzec inline edit: `editingId` state, textarea input, Save/Cancel.
- `src/components/FlashcardCollection.tsx:17` — `useEffect([refreshKey])` — dodamy lokalny `localRefreshKey` state do samoistnego odświeżania po edit/delete.

## Czego NIE robimy

- Brak instalacji nowych komponentów shadcn/ui (Dialog, AlertDialog, Toast).
- Brak optymistycznych aktualizacji — UI czeka na odpowiedź API.
- Brak paginacji ani sortowania.
- Brak możliwości tworzenia nowych fiszek ręcznie (FR-009 odłożone).
- Brak zmian w schemacie DB.

## Podejście do implementacji

1. Nowy plik API `src/pages/api/flashcards/[id].ts` z `PATCH` i `DELETE` — ten sam wzorzec auth/supabase co `flashcards.ts`.
2. Nowy typ `UpdateFlashcardRequest` w `src/types.ts`.
3. Modyfikacja `FlashcardCollection.tsx`: per-karta state (tryb: `view | editing | confirm-delete | saving`), inline formularz edit, inline confirm delete, lokalny `localRefreshKey`.

---

## Faza 1: API — endpoint PATCH i DELETE

### Przegląd

Nowy plik `src/pages/api/flashcards/[id].ts` eksponuje dwie operacje na konkretnej fiszce właściciela.

### Wymagane zmiany

#### 1. Nowy typ DTO

**Plik**: `src/types.ts`

**Cel**: Dodaj `UpdateFlashcardRequest` — DTO dla ciała PATCH, używane przez API i frontend.

**Kontrakt**: `export interface UpdateFlashcardRequest { question?: string; answer?: string; }` — oba pola opcjonalne; zod w API waliduje że przynajmniej jedno nie jest pustym stringiem.

#### 2. Nowy endpoint API

**Plik**: `src/pages/api/flashcards/[id].ts`

**Cel**: Obsłuż `PATCH /api/flashcards/:id` (aktualizacja pytania/odpowiedzi) i `DELETE /api/flashcards/:id` (usunięcie) dla uwierzytelnionego właściciela fiszki.

**Kontrakt**:
- `export const prerender = false`
- `PATCH` — waliduje body (`question?: string.trim().min(1)`, `answer?: string.trim().min(1)`, refine: przynajmniej jedno pole podane); wykonuje `.update().eq("id", id).eq("user_id", user.id)`; zwraca zaktualizowany rekord (200) lub 404 gdy nic nie zaktualizowano.
- `DELETE` — wykonuje `.delete().eq("id", id).eq("user_id", user.id)`; zwraca 204 No Content lub 404.
- Oba sprawdzają `context.locals.user` (401) i `createClient(...)` (503).
- `id` pochodzi z `context.params.id`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna

- `PATCH /api/flashcards/<valid-id>` z `{ "question": "nowe" }` → 200, zaktualizowany rekord
- `DELETE /api/flashcards/<valid-id>` → 204
- `PATCH /api/flashcards/<cudzej-id>` → 404 (nie 403 — nie ujawniamy istnienia)
- `DELETE /api/flashcards/<nieistniejące>` → 404
- `PATCH` z pustym body → 422

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej, zatrzymaj się na ręczne potwierdzenie przed przejściem do Fazy 2.

---

## Faza 2: UI — inline edit i inline delete w FlashcardCollection

### Przegląd

Modyfikacja `FlashcardCollection.tsx` dodająca per-karta tryb edycji i potwierdzenia usunięcia. Komponent po udanej operacji samodzielnie odświeża listę bez udziału rodzica.

### Wymagane zmiany

#### 1. Per-karta state i lokalny refresh

**Plik**: `src/components/FlashcardCollection.tsx`

**Cel**: Dodaj `localRefreshKey` state (`useState(0)`) do wewnętrznego odświeżania po edit/delete. Dodaj per-karta stan aktywności: `activeCard: { id: string; mode: 'editing' | 'confirm-delete' | 'saving'; editQuestion?: string; editAnswer?: string; error?: string } | null`.

**Kontrakt**: `useEffect` reaguje na `[refreshKey, localRefreshKey]`. Po udanej operacji: `setLocalRefreshKey(k => k + 1)` i `setActiveCard(null)`.

#### 2. Przyciski akcji na karcie (tryb view)

**Plik**: `src/components/FlashcardCollection.tsx`

**Cel**: W trybie `view` (karta nie jest w `activeCard`) dodaj przyciski **Edytuj** i **Usuń** pod treścią karty. Użyj komponentu `Button` z `src/components/ui/button.tsx`.

**Kontrakt**: Przyciski widoczne zawsze. Klik Edytuj → `setActiveCard({ id: card.id, mode: 'editing', editQuestion: card.question, editAnswer: card.answer })`. Klik Usuń → `setActiveCard({ id: card.id, mode: 'confirm-delete' })`.

#### 3. Inline formularz edycji (tryb editing / saving)

**Plik**: `src/components/FlashcardCollection.tsx`

**Cel**: Gdy karta ma `activeCard.mode === 'editing'` lub `'saving'`, renderuj formularz z dwoma polami textarea (pytanie, odpowiedź) zamiast statycznej treści. Wyślij PATCH do API, po sukcesie odśwież listę.

**Kontrakt**:
- Użyj `Textarea` z `src/components/ui/textarea.tsx` dla obu pól.
- Przyciski: **Zapisz** (disabled gdy `mode === 'saving'`) i **Anuluj** (hidden gdy `mode === 'saving'`).
- Zapis: `fetch('/api/flashcards/${card.id}', { method: 'PATCH', body: JSON.stringify(...) })`.
- Na błąd API: `setActiveCard(prev => ({ ...prev!, mode: 'editing', error: message }))` + wyświetl error inline.

#### 4. Inline potwierdzenie usunięcia (tryb confirm-delete)

**Plik**: `src/components/FlashcardCollection.tsx`

**Cel**: Gdy karta ma `activeCard.mode === 'confirm-delete'`, zastąp przyciski Edytuj/Usuń komunikatem i przyciskami **Tak, usuń** / **Nie**.

**Kontrakt**:
- Tekst: "Na pewno usunąć tę fiszkę?"
- Klik "Tak, usuń": `fetch('/api/flashcards/${card.id}', { method: 'DELETE' })` → sukces: `setLocalRefreshKey(...)`.
- Klik "Nie": `setActiveCard(null)`.
- Na błąd: wyświetl error inline na karcie.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint: `npm run lint`
- Build: `npm run build`

#### Weryfikacja ręczna

- Klik **Edytuj** → karta zamienia się w formularz z wypełnionymi polami
- Zmiana treści + Zapisz → karta wraca do widoku z nową treścią
- Klik **Anuluj** w edycji → karta wraca do oryginalnej treści bez zmian w DB
- Klik **Usuń** → pojawiają się "Na pewno? Tak / Nie"
- Klik **Tak, usuń** → karta znika z listy
- Klik **Nie** → powrót do normalnego widoku karty
- Tylko jedna karta może być aktywna (edit/delete) jednocześnie
- Błąd API (np. wyłączone sieć) → komunikat inline na karcie, lista nienaruszona

---

## Strategia testowania

### Kroki testowania ręcznego (end-to-end)

1. Zaloguj się, przejdź na dashboard — sprawdź że kolekcja ma przyciski Edytuj/Usuń
2. Edytuj fiszkę — zmień pytanie, zapisz — sprawdź nową treść i `updated_at` w Supabase
3. Edytuj fiszkę — kliknij Anuluj — sprawdź że treść bez zmian
4. Usuń fiszkę — potwierdź — sprawdź że zniknęła z listy i z Supabase
5. Usuń fiszkę — odrzuć ("Nie") — sprawdź że wciąż widoczna
6. Wygeneruj nowe fiszki (AI), zaakceptuj — sprawdź że `refreshKey` z rodzica nadal działa obok `localRefreshKey`

## Uwagi dotyczące migracji

Brak — tabela i RLS gotowe. Żadnych zmian w schemacie.

## Referencje

- Wzorzec inline edit: `src/components/FlashcardGenerator.tsx:48–194`
- Wzorzec API (auth + supabase): `src/pages/api/flashcards.ts`
- Wzorzec refresh: `src/components/FlashcardCollection.tsx:17` + `FlashcardDashboard.tsx:7`
- RLS: `supabase/migrations/20260610000000_create_flashcards.sql`
- Typy: `src/types.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: API — PATCH i DELETE

#### Automated

- [x] 1.1 Lint przechodzi po dodaniu nowego endpointu
- [x] 1.2 Build przechodzi

#### Manual

- [x] 1.3 PATCH aktualizuje fiszkę właściciela, zwraca 200
- [x] 1.4 DELETE usuwa fiszkę właściciela, zwraca 204
- [x] 1.5 PATCH na cudzą fiszkę zwraca 404
- [x] 1.6 PATCH z pustym body zwraca 422

### Phase 2: UI — inline edit i delete w FlashcardCollection

#### Automated

- [ ] 2.1 Lint przechodzi po modyfikacji komponentu
- [ ] 2.2 Build przechodzi

#### Manual

- [ ] 2.3 Klik Edytuj zamienia kartę w formularz
- [ ] 2.4 Zapis aktualizuje kartę i odświeża listę
- [ ] 2.5 Anuluj przywraca oryginalną treść bez zmian
- [ ] 2.6 Klik Usuń pokazuje potwierdzenie inline
- [ ] 2.7 Potwierdzenie usuwa kartę z listy
- [ ] 2.8 Odrzucenie usunięcia przywraca widok karty
- [ ] 2.9 Błąd API wyświetlany inline na karcie
