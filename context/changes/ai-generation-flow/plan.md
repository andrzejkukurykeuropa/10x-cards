# Plan implementacji: Kompletny przepływ AI (S-02)

## Przegląd

Implementujemy gwiezdny przepływ S-02: zalogowany użytkownik wkleja tekst, AI generuje propozycje fiszek, użytkownik może każdą zaakceptować (auto-zapis), edytować inline lub odrzucić, a po obsłużeniu wszystkich kolekcja odświeża się automatycznie.

## Analiza stanu obecnego

Infrastruktura jest gotowa:
- `POST /api/generate-flashcards` działa — Groq/llama-3.3-70b-versatile, zwraca JSON `{ flashcards: [{question, answer}] }`, auth check wbudowany
- `GET /api/flashcards` istnieje — brak endpointu zapisu (POST)
- `FlashcardCollection.tsx` wyświetla kolekcję, nie obsługuje odświeżeń zewnętrznych
- `dashboard.astro` ma jedną sekcję z `<FlashcardCollection client:load />` — brak sekcji generatora
- `src/types.ts` ma `FlashcardProposal` i `GenerateFlashcardsRequest` — wystarczające, nic nowego nie potrzeba
- Tylko `button.tsx` z shadcn/ui zainstalowane — potrzeba dodać `textarea`

## Pożądany stan końcowy

Dashboard ma sekcję „Generuj fiszki" powyżej „Moja kolekcja". Użytkownik wkleja tekst (40–1000 znaków), klika „Generuj fiszki" i widzi spinner podczas oczekiwania na AI. Po odpowiedzi pojawia się lista 3–10 kart z przyciskami Zaakceptuj / Edytuj / Odrzuć. Po kliknięciu „Zaakceptuj" karta jest zapisywana natychmiast do Supabase i oznaczana jako zaakceptowana. Gdy wszystkie propozycje zostaną obsłużone, pojawia się podsumowanie „Zaakceptowano X fiszek", a kolekcja poniżej odświeża się automatycznie.

### Kluczowe odkrycia

- `src/pages/api/flashcards.ts:6-33` — tylko GET, trzeba dodać POST bez naruszania istniejącego handlera
- `src/components/FlashcardCollection.tsx:11` — `useEffect([], [])` bez zewnętrznego triggera — konieczna `refreshKey` prop
- `src/pages/dashboard.astro:32` — `<FlashcardCollection client:load />` zostanie zastąpione przez `<FlashcardDashboard client:load />`
- `src/lib/ai-schemas.ts` — `flashcardsOutputSchema` (Zod) do importu przez generator na kliencie dla typowania odpowiedzi
- Endpoint generowania używa `generateText` (nie streaming) — odpowiedź jako jednorazowy JSON, brak `useObject`

## Czego NIE robimy

- Brak zmiany logiki `POST /api/generate-flashcards` — działa, nie dotykamy
- Brak rate limiting / kontroli kosztów — open question z PRD, poza zakresem MVP
- Brak persystencji tekstu wejściowego
- Brak możliwości cofnięcia odrzucenia (odrzucone propozycje są usuwane z widoku)
- Brak edycji fiszek już zapisanych w kolekcji (to S-03)
- Brak osobnej strony `/generate` — generator jest na dashboardzie

## Podejście do implementacji

Trzy fazy: (1) backend — endpoint zapisu, (2) komponent generatora z maszyną stanów, (3) integracja — wrapper spajający generator i odświeżającą się kolekcję, podmiana wyspy w dashboard.astro.

Odświeżanie kolekcji realizujemy przez `refreshKey: number` prop w `FlashcardCollection` + `FlashcardDashboard.tsx` jako jedyna wyspa React (`client:load`) zarządzająca obydwoma komponentami i inkrementująca klucz gdy generator przejdzie do stanu `summary`.

## Krytyczne szczegóły implementacji

- **Blokowanie nowego generowania**: przycisk „Generuj" jest zablokowany gdy `state.status === "reviewing"` lub `"loading"`. Nowa sesja jest możliwa tylko z `"idle"` lub `"summary"`.
- **Przejście do summary**: efekt w `FlashcardGenerator` obserwuje tablicę propozycji — gdy `proposals.every(p => p.disposition === "accepted" || p.disposition === "rejected")` i lista nie jest pusta, wywołuje `onComplete(acceptedCount)` i wchodzi w `summary`. Sprawdzaj w `useEffect` zależnym od `proposals`.
- **Błąd zapisu per karta**: jeśli `POST /api/flashcards` się nie powiedzie, karta wraca do stanu `pending` z inline komunikatem błędu — nie blokuje innych kart.

---

## Faza 1: Endpoint zapisu fiszek

### Przegląd

Dodajemy `POST` handler do istniejącego `src/pages/api/flashcards.ts`. Endpoint przyjmuje jedną fiszkę (`question` + `answer`), wstawia do Supabase z `user_id` zalogowanego użytkownika i zwraca `201` z zapisanym `FlashcardDto`.

### Wymagane zmiany

#### 1. POST handler w `flashcards.ts`

**Plik**: `src/pages/api/flashcards.ts`

**Cel**: Dodać eksport `POST` obok istniejącego `GET`. Zapis jest per-karta (jedna fiszka per request) — brak bulk insert.

**Kontrakt**:
```
POST /api/flashcards
Body: { question: string (min 1), answer: string (min 1) }
→ 201: FlashcardDto (id, question, answer, created_at, updated_at)
→ 401: { error: "Unauthorized" }
→ 422: { error: "Invalid input" }
→ 500: { error: "Internal server error" }
```
Walidacja body przez zod schema (identyczna z `FlashcardProposal` shape, zdefiniowana lokalnie w pliku). Insert: `supabase.from("flashcards").insert({ user_id: user.id, question, answer }).select("id, question, answer, created_at, updated_at").single()`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Linting przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna

- `POST /api/flashcards` z ważnym body i sesją zapisuje fiszkę w Supabase i zwraca `201`
- Bez sesji zwraca `401`
- Z brakującym `question` zwraca `422`

**Uwaga implementacyjna**: Po zakończeniu tej fazy zatrzymaj się na ręczne potwierdzenie (curl lub devtools) zanim przejdziesz do fazy 2.

---

## Faza 2: Komponent FlashcardGenerator

### Przegląd

Nowy React component realizujący maszynę stanów przepływu generowania. Zarządza całym cyklem: input tekstu → wywołanie AI → lista propozycji z per-kartowym accept/edit/reject → summary. Wywoływany przez `FlashcardDashboard` z callbackiem `onComplete`.

### Wymagane zmiany

#### 1. Instalacja shadcn textarea

**Cel**: Dodać komponent Textarea z shadcn/ui do stylowania pola tekstu.

**Kontrakt**: `npx shadcn@latest add textarea` — ląduje w `src/components/ui/textarea.tsx`.

#### 2. Komponent FlashcardGenerator

**Plik**: `src/components/FlashcardGenerator.tsx`

**Cel**: Maszyna stanów (idle → loading → reviewing → summary) dla przepływu generowania. Jeden komponent eksportowany domyślnie; wewnętrzny typ `ProposalItem` nie trafia do `src/types.ts`.

**Kontrakt**:
```ts
// Props
interface FlashcardGeneratorProps {
  onComplete: (acceptedCount: number) => void;
}

// Internal state union
type GeneratorState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "reviewing"; proposals: ProposalItem[] }
  | { status: "summary"; accepted: number };

// Internal proposal type
type ProposalItem = {
  id: string;              // crypto.randomUUID() — React key
  question: string;
  answer: string;
  disposition: "pending" | "saving" | "accepted" | "rejected";
  isEditing: boolean;
  editQuestion: string;
  editAnswer: string;
  saveError: string | null;
};
```

Zachowanie poszczególnych stanów:
- **idle**: Textarea (min 40 / max 1000 znaków), licznik znaków, przycisk „Generuj fiszki" (disabled gdy `text.length < 40`)
- **loading**: Spinner z komunikatem „AI generuje fiszki…"; przycisk „Generuj" zablokowany
- **error**: Komunikat błędu z przyciskiem „Spróbuj ponownie" (wraca do idle z zachowanym tekstem)
- **reviewing**: Lista `ProposalItem`; każda karta ma przyciski Zaakceptuj / Edytuj / Odrzuć; gdy `isEditing` — pola textarea + Zapisz / Anuluj; podczas `saving` — spinner na karcie; `saveError` — inline komunikat błędu + Spróbuj ponownie. Przycisk „Generuj" zablokowany.
- **summary**: Komunikat „Zaakceptowano X fiszek 🎉" + przycisk „Wygeneruj kolejne" (wraca do idle)

Wywołanie AI: `fetch("/api/generate-flashcards", { method: "POST", body: JSON.stringify({ text }) })` → JSON parse → mapowanie na `ProposalItem[]`.

Auto-przejście do summary: `useEffect` obserwujący `proposals` — gdy wszystkie mają `disposition !== "pending"` i `!== "saving"`, wywołuje `onComplete(count)` i `setState({ status: "summary", accepted: count })`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Linting przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna

- Textarea blokuje przycisk poniżej 40 znaków; licznik widoczny
- Kliknięcie „Generuj" → spinner widoczny
- Propozycje AI wyświetlają się jako lista kart
- „Zaakceptuj" → karta oznaczona jako zaakceptowana, fiszka widoczna w Supabase
- „Edytuj" → pola inline; zapisane wartości trafiają do API; anulowanie przywraca oryginał
- „Odrzuć" → karta wyłączona/usunięta z aktywnych
- Po obsłużeniu wszystkich → podsumowanie z licznikiem
- Błąd API na karcie → inline error + retry działa
- Błąd generowania → komunikat + „Spróbuj ponownie" wraca do idle z tekstem

**Uwaga implementacyjna**: Po zakończeniu tej fazy zatrzymaj się na ręczne potwierdzenie kompletnego przepływu zanim przejdziesz do fazy 3.

---

## Faza 3: Integracja dashboardu

### Przegląd

Spinamy generator i kolekcję w jedną wyspę React (`FlashcardDashboard.tsx`), modyfikujemy `FlashcardCollection` żeby przyjmowała `refreshKey`, i podmieniamy zawartość `dashboard.astro`.

### Wymagane zmiany

#### 1. refreshKey prop w FlashcardCollection

**Plik**: `src/components/FlashcardCollection.tsx`

**Cel**: Umożliwić zewnętrzne wyzwolenie ponownego fetchu kolekcji bez pełnego remount.

**Kontrakt**: Dodać opcjonalny prop `refreshKey?: number` i włączyć go do dependency array `useEffect`: `useEffect(() => { /* fetch */ }, [refreshKey])`.

#### 2. FlashcardDashboard wrapper

**Plik**: `src/components/FlashcardDashboard.tsx`

**Cel**: Jedyna wyspa React na dashboardzie; trzyma `refreshCounter` state; inkrementuje go gdy generator sygnalizuje zakończenie sesji.

**Kontrakt**:
```ts
// State
const [refreshCounter, setRefreshCounter] = useState(0);
const handleComplete = (acceptedCount: number) => {
  if (acceptedCount > 0) setRefreshCounter(c => c + 1);
};

// Render
<section> <FlashcardGenerator onComplete={handleComplete} /> </section>
<section> <FlashcardCollection refreshKey={refreshCounter} /> </section>
```

Nagłówki sekcji: „Generuj fiszki" (h2) nad generatorem, „Moja kolekcja" (h2) nad kolekcją — przeniesione z `dashboard.astro`.

#### 3. Podmiana wyspy w dashboard.astro

**Plik**: `src/pages/dashboard.astro`

**Cel**: Zastąpić sekcję z `<FlashcardCollection client:load />` pojedynczą wyspą `<FlashcardDashboard client:load />`. Import `FlashcardCollection` usunąć, dodać import `FlashcardDashboard`.

**Kontrakt**: Nagłówek „Moja kolekcja" i `<section>` przeniesione do `FlashcardDashboard.tsx` — `dashboard.astro` tylko renderuje wyspę bez zagnieżdżonego `<section>`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Linting przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna

- Dashboard wyświetla sekcję „Generuj fiszki" powyżej „Moja kolekcja"
- Po zakończeniu sesji generowania (przejście do summary) kolekcja odświeża się automatycznie i nowe fiszki są widoczne
- Kompletny przepływ end-to-end: wklej tekst → generuj → zaakceptuj kilka → odrzuć resztę → podsumowanie → kolekcja zaktualizowana
- Pusty stan kolekcji wciąż wyświetla się poprawnie gdy brak fiszek
- Strona działa po `npm run build` (Cloudflare edge runtime)

---

## Strategia testowania

### Testy ręczne (jedyna opcja — brak test runnera)

1. Zaloguj się i przejdź do `/dashboard`
2. Wklej tekst < 40 znaków → przycisk „Generuj" powinien być nieaktywny
3. Wklej tekst 40–1000 znaków → kliknij „Generuj" → spinner widoczny
4. Po załadowaniu propozycji: zaakceptuj pierwszą → weryfikuj w Supabase dashboard
5. Edytuj drugą inline → zmień pytanie → zapisz → zaakceptuj zmodyfikowaną
6. Odrzuć pozostałe → obserwuj podsumowanie
7. Sprawdź czy kolekcja poniżej odświeżyła się i pokazuje nowe karty
8. Kliknij „Wygeneruj kolejne" → stan wraca do idle
9. Sprawdź czy nie można kliknąć „Generuj" podczas aktywnej sesji reviewing

## Uwagi dotyczące migracji

Brak migracji danych. Zmiana `dashboard.astro` jest niezauważalna dla użytkownika (ta sama struktura, inny import).

## Aneks: Zmiany odkryte podczas implementacji

### A1 — Aktualizacja system prompt w generate-flashcards.ts

**Plik**: `src/pages/api/generate-flashcards.ts`

Oryginalny plan zawierał barierę "No changes to POST /api/generate-flashcards logic". W trakcie implementacji (commit `4f013c6`) system prompt został zaktualizowany, aby AI tłumaczyło tekst na **polski** zamiast angielskiego. Zmiana wymagana przez użytkownika po weryfikacji działania — poprawne zachowanie dla polskiego produktu.

- Roadmap S-02: `context/foundation/roadmap.md`
- PRD: `context/foundation/prd.md` (US-01, FR-003, FR-004, FR-005)
- AI SDK edge spike plan: `context/changes/ai-sdk-edge-spike/plan-brief.md`
- Endpoint generowania: `src/pages/api/generate-flashcards.ts`
- Istniejący endpoint kolekcji: `src/pages/api/flashcards.ts`
- Zod schema dla AI: `src/lib/ai-schemas.ts`
- Typy: `src/types.ts` (FlashcardProposal, FlashcardDto)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Endpoint zapisu fiszek

#### Automatyczne

- [x] 1.1 Linting przechodzi: `npm run lint` — 88197ce
- [x] 1.2 Build przechodzi: `npm run build` — 88197ce

#### Ręczne

- [x] 1.3 POST /api/flashcards z ważnym body i sesją zapisuje fiszkę i zwraca 201 — 88197ce
- [x] 1.4 Bez sesji zwraca 401 — 88197ce
- [x] 1.5 Z brakującym question zwraca 422 — 88197ce

### Faza 2: Komponent FlashcardGenerator

#### Automatyczne

- [x] 2.1 Linting przechodzi: `npm run lint` — fe04b2b
- [x] 2.2 Build przechodzi: `npm run build` — fe04b2b

#### Ręczne

- [x] 2.3 Textarea blokuje przycisk poniżej 40 znaków, licznik widoczny — 4f013c6
- [x] 2.4 Generowanie → spinner widoczny podczas oczekiwania — 4f013c6
- [x] 2.5 Propozycje AI wyświetlają się jako lista kart — 4f013c6
- [x] 2.6 Zaakceptuj → karta oznaczona, fiszka w Supabase — 4f013c6
- [x] 2.7 Edytuj inline → zmiana pytania/odpowiedzi → zapis przez API — 4f013c6
- [x] 2.8 Odrzuć → karta wyłączona — 4f013c6
- [x] 2.9 Wszystkie obsłużone → podsumowanie z licznikiem — 4f013c6
- [x] 2.10 Błąd API na karcie → inline error + retry — 4f013c6
- [x] 2.11 Błąd generowania → komunikat + „Spróbuj ponownie" — 4f013c6

### Faza 3: Integracja dashboardu

#### Automatyczne

- [x] 3.1 Linting przechodzi: `npm run lint` — 4f013c6
- [x] 3.2 Build przechodzi: `npm run build` — 4f013c6

#### Ręczne

- [x] 3.3 Dashboard: „Generuj fiszki" powyżej „Moja kolekcja" — 4f013c6
- [x] 3.4 Po summary kolekcja odświeża się automatycznie z nowymi fiszkami — 4f013c6
- [x] 3.5 Kompletny przepływ end-to-end działa — 4f013c6
- [x] 3.6 Pusty stan kolekcji wciąż działa poprawnie — 4f013c6
