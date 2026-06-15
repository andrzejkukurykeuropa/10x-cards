---
change_id: collection-view
roadmap_id: S-01
status: planned
created: 2026-06-10
prerequisite_done: true
---

# Plan implementacji: S-01 — Przeglądanie kolekcji

## Cel

Zalogowany użytkownik może zobaczyć listę swoich fiszek w kolekcji (siatka kart) lub pusty stan zachęcający do wygenerowania pierwszych. Sekcja kolekcji jest wbudowana bezpośrednio w `/dashboard`.

## Wymagania wstępne

> ✅ **F-01 (`flashcard-schema`) jest ukończone.**
> Migracja `supabase/migrations/20260610000000_create_flashcards.sql` istnieje.
> Tabela `flashcards` z pełnym RLS jest gotowa:
> - `id` uuid PK, `user_id` uuid → `auth.users` ON DELETE CASCADE
> - `question` text, `answer` text, `created_at`/`updated_at` timestamptz
> - RLS: select/insert/update/delete scoped to `auth.uid() = user_id`
> - Indeks na `user_id`, trigger `updated_at`

## Analiza stanu obecnego

- `src/pages/dashboard.astro` — istnieje, prosty placeholder z powitaniem i sign out; brak sekcji kolekcji
- `src/lib/supabase.ts` — `createClient(headers, cookies)` zwraca Supabase SSR client; wzorzec używany w endpointach auth
- `src/middleware.ts` — `context.locals.user` dostępne na wszystkich trasach; `/dashboard` jest chroniony
- `src/types.ts` — **nie istnieje**; trzeba stworzyć
- `src/components/ui/` — tylko `button.tsx`; nie ma komponentu Card → zrobimy własny prosty komponent
- `src/pages/api/auth/*.ts` — wzorzec: `export const prerender = false` nie jest wymagane (SSR domyślnie), `createClient` + sprawdzenie `null`, JSON response przez `new Response(JSON.stringify(...))`

## Decyzje projektowe

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Lokalizacja widoku | Wbudowany w `/dashboard` | Nie dodaje nowej trasy; dashboard to naturalny hub |
| Układ listy | Siatka kart (grid) | Czytelna prezentacja par pytanie/odpowiedź |
| Pobieranie danych | GET `/api/flashcards` + React client fetch | Separacja logiki; endpoint wielokrotnego użytku dla S-02 |
| Komponent | React island (`client:load`) | Potrzebny `useEffect`/`useState` do async fetch |

## Pliki do stworzenia / zmodyfikowania

| Plik | Akcja | Opis |
|---|---|---|
| `src/types.ts` | Utwórz | Typ `Flashcard` (encja) + `FlashcardDto` (odpowiedź API) |
| `src/pages/api/flashcards.ts` | Utwórz | GET endpoint — pobiera fiszki zalogowanego użytkownika |
| `src/components/FlashcardCollection.tsx` | Utwórz | React island: fetch + siatka kart + pusty stan |
| `src/pages/dashboard.astro` | Zmodyfikuj | Dodaj `<FlashcardCollection client:load />` |

## Fazy implementacji

### Faza 1: Typy współdzielone

**Cel:** Stworzenie `src/types.ts` z typem `Flashcard` — używany przez endpoint i komponent.

```typescript
// src/types.ts
export interface Flashcard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}
```

**Kryterium sukcesu:** `src/types.ts` istnieje i eksportuje `Flashcard`.

---

### Faza 2: Endpoint GET `/api/flashcards`

**Cel:** API endpoint zwracający fiszki zalogowanego użytkownika jako JSON.

```typescript
// src/pages/api/flashcards.ts
export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
  }

  const { data, error } = await supabase
    .from("flashcards")
    .select("id, question, answer, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

**Kryterium sukcesu:** `GET /api/flashcards` zwraca `[]` lub tablicę fiszek dla zalogowanego użytkownika; 401 dla niezalogowanego.

---

### Faza 3: Komponent React `FlashcardCollection`

**Cel:** Island React — pobiera dane z `/api/flashcards` i renderuje siatkę kart lub pusty stan.

Stany komponentu:
- `loading` — spinner / skeleton
- `error` — komunikat błędu
- `empty` — pusty stan z CTA
- `data` — siatka kart

Układ siatki: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

Karta fiszki:
- Sekcja "Pytanie" (muted label + treść)
- Separator
- Sekcja "Odpowiedź" (muted label + treść)
- Styl: `rounded-xl border bg-card p-4 shadow-sm`

Pusty stan:
- Ikona (np. 📚)
- Tytuł: "Twoja kolekcja jest pusta"
- Opis: "Wygeneruj pierwsze fiszki, wklejając tekst i uruchamiając AI."

**Kryterium sukcesu:** Komponent renderuje siatkę kart lub pusty stan w zależności od danych; loading state widoczny przed odpowiedzią API.

---

### Faza 4: Integracja w dashboardzie

**Cel:** Rozszerzenie `dashboard.astro` o sekcję kolekcji.

Dodać do `dashboard.astro`:
```astro
---
import FlashcardCollection from "@/components/FlashcardCollection";
// ...istniejący import Layout
---
```

Struktura dashboardu po zmianie:
1. Nagłówek z powitaniem (istniejący)
2. Sekcja "Moja kolekcja" z `<FlashcardCollection client:load />`

**Kryterium sukcesu:** Po zalogowaniu, `/dashboard` pokazuje sekcję kolekcji z fiszkami lub pustym stanem.

## Otwarte ryzyka i założenia

- **Założenie:** Supabase RLS jest skonfigurowany poprawnie w F-01 — endpoint nie potrzebuje dodatkowego filtrowania `user_id` ręcznie (Supabase RLS gwarantuje izolację), ale dla pewności filtrujemy jawnie przez `.eq("user_id", user.id)`
- **Ryzyko:** Środowisko dev może nie mieć tabeli `flashcards` jeśli lokalna instancja Supabase (Docker) nie ma zastosowanej migracji — przed Fazą 2 uruchom `npx supabase db push` lub `npx supabase start` (migracje są aplikowane automatycznie)

## References

- `context/foundation/roadmap.md` — S-01, F-01
- `context/foundation/prd.md` — FR-006
- `src/lib/supabase.ts` — wzorzec klienta
- `src/pages/api/auth/signin.ts` — wzorzec endpointu

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared types

#### Automated

- [x] 1.1 Create src/types.ts with Flashcard interface

### Phase 2: API endpoint

#### Automated

- [ ] 2.1 Create src/pages/api/flashcards.ts GET handler
- [ ] 2.2 Verify lint passes (npm run lint)

### Phase 3: FlashcardCollection component

#### Automated

- [ ] 3.1 Create src/components/FlashcardCollection.tsx

#### Manual

- [ ] 3.2 Visually verify grid layout and empty state in browser

### Phase 4: Dashboard integration

#### Automated

- [ ] 4.1 Update src/pages/dashboard.astro with FlashcardCollection island

#### Manual

- [ ] 4.2 Smoke test: logged-in user sees collection section on /dashboard
