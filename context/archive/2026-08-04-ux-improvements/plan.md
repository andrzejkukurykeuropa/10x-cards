# Plan implementacji: Poprawki wizualne i UX (S-05)

## Przegląd

Trzy niezależne, ukierunkowane poprawki UX na bazie ukończonych fragmentów S-02 (`ai-generation-flow`), S-03 (`collection-edit-delete`) i S-04 (`study-session`):

1. Przycisk „Zaakceptuj wszystkie” w przeglądzie propozycji AI (`FlashcardGenerator.tsx`).
2. Możliwość przerwania sesji nauki w dowolnym momencie (`StudySession.tsx`).
3. Poprawka kontrastu tekstu w wariantach `outline`/`ghost` komponentu `Button` (`src/components/ui/button.tsx`).

Brak zmian schematu danych. Brak nowych endpointów API — wszystkie poprawki wykorzystują istniejące trasy (`POST /api/flashcards`, `POST /api/study/review`).

## Analiza stanu obecnego

- **Przegląd propozycji AI** (`src/components/FlashcardGenerator.tsx`): stan `reviewing` trzyma listę `ProposalItem[]`. Akceptacja pojedynczej propozycji to `handleAccept(id, question?, answer?)` (`:210-243`), który POSTuje do `/api/flashcards` (zapis pojedynczy, brak batcha — `src/pages/api/flashcards.ts:69-73`). Edycja: `handleEditSave(id)` ustawia `isEditing: false` i wywołuje `handleAccept(id, proposal.editQuestion, proposal.editAnswer)` (`:270-275`). Nie istnieje żaden mechanizm masowy — jedyne akcje to per-karta „Zaakceptuj / Edytuj / Odrzuć” (`:158-185`).
- **Sesja nauki** (`src/components/StudySession.tsx`): stan `session` trzyma `queue`, `index`, `revealed`, `ratingCounts`. Ocena karty (`handleRate`) natychmiast POSTuje do `/api/study/review`, który od razu zapisuje zaktualizowany rekord w Supabase (`src/pages/api/study/review.ts:72-78`) — więc przerwanie sesji po ocenieniu karty nie traci postępu. Brak jakiegokolwiek przycisku wyjścia w widoku aktywnej sesji (`:220-260` renderu statusu `session`); jedyne wyjście to statyczny link „← Powrót do dashboardu” w `src/pages/study.astro:12-14`, który znajduje się w Astro (poza reactowym stanem komponentu) i nie ma dostępu do `ratingCounts`/`index`.
- **Kontrast przycisków** (`src/components/ui/button.tsx:5-28`): warianty `outline` (`border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground ...`) i `ghost` (`hover:bg-accent hover:text-accent-foreground ...`) nie ustawiają jawnego koloru tekstu w stanie domyślnym — dziedziczą kolor z elementu nadrzędnego. Na stronach z ciemnym tłem strony, ale jasnym tłem przycisku (np. `StudySession.tsx`, gdzie tekst rodzica to `text-white`), efektem jest biały tekst na jasnym tle `bg-background` w stanie domyślnym — czytelny dopiero po najechaniu (`hover:bg-accent hover:text-accent-foreground`). Potwierdzone użycia: `StudySession.tsx:136,158,177,185,213`, `FlashcardGenerator.tsx:124,170,179,370,409`, `FlashcardCollection.tsx:166,195,218,228`.

### Kluczowe odkrycia:

- Brak testów automatycznych (jednostkowych/e2e) dla obu przepływów (`FlashcardGenerator`, `StudySession`) — nie ma nic do zaktualizowania, ale też nie ma bazowej siatki bezpieczeństwa; weryfikacja będzie głównie ręczna.
- Repozytorium nie ma zainstalowanego komponentu `Dialog`/`AlertDialog` (tylko `button.tsx` i `textarea.tsx` w `src/components/ui/`) — modal potwierdzający przerwanie sesji zostanie zaimplementowany jako lekki, wbudowany stan komponentu (overlay/panel warunkowo renderowany), a nie jako nowa zależność shadcn, spójnie z obecnym minimalistycznym stylem kodu.
- `toSummaryOrReviewing()` (`FlashcardGenerator.tsx:205-213`) jest jedynym miejscem wywołującym `onComplete(acceptedCount)` — „Zaakceptuj wszystkie” musi przechodzić przez tę samą ścieżkę, aby dashboard poprawnie odświeżył kolekcję.

## Pożądany stan końcowy

- W widoku przeglądu propozycji AI, obok licznika „X z Y propozycji do obsłużenia”, widoczny jest przycisk „Zaakceptuj wszystkie”, który zapisuje wszystkie nieodrzucone propozycje (z aktualną, ewentualnie edytowaną treścią) do kolekcji jednym kliknięciem, pokazując błędy przy nieudanych zapisach z możliwością ponowienia.
- W widoku aktywnej sesji nauki, na górze (obok „Karta X z Y”), widoczny jest przycisk „Zakończ sesję”, który po potwierdzeniu (z podsumowaniem postępu, np. „Oceniono 5/12, na pewno zakończyć?”) przekierowuje do `/dashboard` bez utraty już zapisanych ocen.
- Warianty `outline` i `ghost` komponentu `Button` mają czytelny tekst w stanie domyślnym (bez najeżdżania myszą) niezależnie od koloru tła rodzica, we wszystkich istniejących miejscach użycia.
- Weryfikacja: ręczne przejście wszystkich trzech przepływów (patrz Kroki testowania ręcznego) + `npm run lint` + `npm run build` bez błędów.

## Czego NIE robimy

- Nie dodajemy endpointu wsadowego (`batch insert`) do `/api/flashcards` — „Zaakceptuj wszystkie” iteruje istniejący zapis per-karta.
- Nie dodajemy przycisku „cofnij ocenę” ani logu przeglądów w sesji nauki (poza zakresem S-04/S-05).
- Nie audytujemy ani nie zmieniamy wariantów `default`, `destructive`, `secondary`, `link` komponentu `Button` — mają już jawny, poprawny kolor tekstu.
- Nie dodajemy nowej zależności (np. Radix Dialog/`shadcn add dialog`) na potrzeby modala potwierdzającego.
- Nie zmieniamy zachowania „Odrzuć” ani logiki przejścia do stanu `summary` poza integracją „Zaakceptuj wszystkie”.

## Podejście do implementacji

Trzy niezależne fazy, każda dotyka jednego komponentu. Kolejność: najpierw najprostsza i najbardziej izolowana zmiana (kontrast przycisków — jeden plik, żadnej logiki stanu), potem „Zaakceptuj wszystkie” (rozszerza istniejący komponent i pętlę zapisu), na końcu przerwanie sesji (nowy element UI + stan potwierdzenia). Każda faza jest niezależnie weryfikowalna i nie blokuje pozostałych.

## Faza 1: Poprawka kontrastu przycisków (`outline` / `ghost`)

### Przegląd

Dodanie jawnego koloru tekstu `text-foreground` do wariantów `outline` i `ghost` w `buttonVariants` (`src/components/ui/button.tsx`), aby tekst był czytelny w stanie domyślnym niezależnie od koloru tekstu elementu nadrzędnego.

### Wymagane zmiany:

#### 1. Komponent Button

**Plik**: `src/components/ui/button.tsx`

**Cel**: Zapewnić czytelny kontrast tekstu w stanie domyślnym (bez hover) dla wariantów `outline` i `ghost`, które obecnie nie ustawiają jawnego koloru tekstu i dziedziczą go z rodzica.

**Kontrakt**: W definicji `variants.variant` w `cva(...)`:
- `outline`: dodać `text-foreground` do listy klas (przed `hover:` modyfikatorami), zachowując istniejące `border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50`.
- `ghost`: dodać `text-foreground` do listy klas, zachowując istniejące `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`.

Token `--foreground` jest już zdefiniowany w `src/styles/global.css` (jasny i ciemny motyw) i zmapowany przez `@theme inline`, więc kolor automatycznie dostosuje się do motywu bez dodatkowej konfiguracji.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi bez nowych błędów/ostrzeżeń
- `npm run build` kończy się sukcesem

#### Weryfikacja ręczna:

- Na stronie `/study` (tło ciemne, tekst rodzica biały): przyciski z wariantem `outline` („Wszystkie fiszki”, „Spróbuj ponownie”, „Wybierz inny tryb”, „Powrót do dashboardu” w podsumowaniu) mają czytelny tekst w stanie domyślnym, bez potrzeby najeżdżania myszą
- Na stronie `/dashboard` w widoku generatora AI: przyciski `outline` („Edytuj”, „Anuluj”, „Spróbuj ponownie”, „Wygeneruj kolejne”) i `ghost` („Odrzuć”) pozostają czytelne zarówno w stanie domyślnym, jak i po najechaniu
- W widoku kolekcji (`FlashcardCollection.tsx`): przyciski `outline`/`ghost` („Edytuj”, „Usuń”, „Anuluj”) pozostają czytelne
- Brak regresji wizualnej — kolory tła i hover nie zmieniły się, zmienił się tylko domyślny kolor tekstu

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu automatycznych weryfikacji, zatrzymaj się na ręczne potwierdzenie przed przejściem do Fazy 2.

---

## Faza 2: „Zaakceptuj wszystkie” propozycje AI

### Przegląd

Dodanie przycisku „Zaakceptuj wszystkie” w widoku `reviewing` komponentu `FlashcardGenerator`, obok istniejącego licznika propozycji. Kliknięcie zapisuje wszystkie nieodrzucone propozycje (uwzględniając aktualną edytowaną treść, jeśli propozycja jest w trakcie edycji) do kolekcji, wykorzystując istniejącą ścieżkę zapisu per-karta. Błędy częściowe są pokazywane per-propozycja z możliwością ponowienia (istniejący mechanizm `saveError` + „Spróbuj ponownie”).

### Wymagane zmiany:

#### 1. Rozszerzenie stanu i logiki `FlashcardGenerator`

**Plik**: `src/components/FlashcardGenerator.tsx`

**Cel**: Dodać funkcję `handleAcceptAll()`, która iteruje po wszystkich propozycjach o dyspozycji `pending` (pomijając `accepted`, `rejected`, `saving`) i wywołuje dla każdej `handleAccept(id, q, a)` z aktualną treścią — jeśli propozycja jest w trakcie edycji (`isEditing: true`), użyć `editQuestion`/`editAnswer` (i zamknąć tryb edycji przed zapisem, analogicznie do `handleEditSave`); w przeciwnym razie użyć `question`/`answer`. Wywołania zapisu wykonują się współbieżnie (`Promise.allSettled`), tak aby błąd jednej propozycji nie zatrzymywał zapisu pozostałych — każdy pojedynczy `handleAccept` już samodzielnie obsługuje własny błąd (ustawia `saveError` na tej propozycji) i przywraca ją do stanu `pending`/`isEditing`, więc "Spróbuj ponownie" na tej konkretnej karcie działa bez dodatkowych zmian.

**Kontrakt**: Nowa funkcja `async function handleAcceptAll()` w głównym komponencie, obok `handleAccept`. Odczytuje `stateRef.current`, filtruje propozycje `disposition === "pending"`, dla każdej ustala `(q, a)` (edytowana treść jeśli `isEditing`, inaczej oryginalna), i wywołuje `Promise.allSettled(proposals.map(p => handleAccept(p.id, q, a)))`. Nie zwraca wartości — wynik jest widoczny przez aktualizacje stanu z wnętrza `handleAccept` (w tym przejście do `summary` przez `toSummaryOrReviewing`, które i tak uruchomi się automatycznie po ostatnim zaakceptowanym elemencie).

#### 2. Przycisk „Zaakceptuj wszystkie” w widoku `reviewing`

**Plik**: `src/components/FlashcardGenerator.tsx`

**Cel**: Dodać przycisk obok istniejącego licznika „X z Y propozycji do obsłużenia” w bloku `state.status === "reviewing"`, wywołujący `handleAcceptAll()`. Przycisk powinien być wyłączony (`disabled`), gdy nie ma żadnej propozycji `pending` (np. wszystkie już zaakceptowane/odrzucone/w trakcie zapisu) — analogicznie do istniejącego wzorca `disabled` na innych przyciskach akcji.

**Kontrakt**: W JSX bloku `reviewing`, obok `<p>{...} propozycji do obsłużenia</p>`, dodać `<Button size="sm" onClick={() => void handleAcceptAll()} disabled={!state.proposals.some(p => p.disposition === "pending")}>Zaakceptuj wszystkie</Button>` (owinięte w kontener flex, aby licznik i przycisk były w jednym wierszu, np. `<div className="flex items-center justify-between">`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi bez nowych błędów/ostrzeżeń
- `npm run build` kończy się sukcesem
- TypeScript: brak błędów typów (część `npm run build`/`lint` z regułami type-checked)

#### Weryfikacja ręczna:

- Wygenerować propozycje AI, kliknąć „Zaakceptuj wszystkie” przy wszystkich propozycjach w stanie `pending` → wszystkie zapisują się, licznik i przejście do `summary` działają poprawnie (dashboard odświeża kolekcję o wszystkie zaakceptowane fiszki)
- Edytować jedną propozycję (bez zapisywania), kliknąć „Zaakceptuj wszystkie” → propozycja zapisuje się z **edytowaną** treścią, nie oryginalną
- Odrzucić jedną propozycję przed kliknięciem „Zaakceptuj wszystkie” → odrzucona propozycja pozostaje odrzucona, nie jest ponownie zapisywana
- Zasymulować błąd zapisu (np. wyłączyć sieć na chwilę) podczas „Zaakceptuj wszystkie” → propozycje, które się nie zapisały, pokazują błąd z opcją „Spróbuj ponownie” per karta; pozostałe propozycje zapisały się poprawnie mimo błędu jednej z nich
- Przycisk „Zaakceptuj wszystkie” jest wyłączony, gdy wszystkie propozycje są już zaakceptowane/odrzucone

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu automatycznych weryfikacji, zatrzymaj się na ręczne potwierdzenie przed przejściem do Fazy 3.

---

## Faza 3: Przerwanie sesji nauki

### Przegląd

Dodanie przycisku „Zakończ sesję” widocznego przez cały czas trwania aktywnej sesji nauki (status `session`), który po potwierdzeniu w lekkim panelu z podsumowaniem dotychczasowego postępu (liczba ocenionych kart) przekierowuje użytkownika do `/dashboard`. Ponieważ każda ocena zapisuje się natychmiast (`/api/study/review`), przerwanie nie traci żadnego już zapisanego postępu.

### Wymagane zmiany:

#### 1. Nowy stan potwierdzenia w `StudySession`

**Plik**: `src/components/StudySession.tsx`

**Cel**: Dodać obsługę potwierdzenia przerwania sesji bez utraty istniejącego stanu `session` (aby "Anuluj" na potwierdzeniu wracało dokładnie tam, gdzie użytkownik był).

**Kontrakt**: Dodać do stanu sesji nowe pole boolowskie `confirmingExit: boolean` w wariancie `{ status: "session"; ...; confirmingExit: boolean }` (domyślnie `false`, inicjalizowane w `handleSelectMode`). Dodać handlery `handleRequestExit()` (ustawia `confirmingExit: true`), `handleCancelExit()` (ustawia `confirmingExit: false`) i `handleConfirmExit()` (przekierowuje: `window.location.href = "/dashboard"`).

#### 2. Przycisk „Zakończ sesję” i panel potwierdzenia

**Plik**: `src/components/StudySession.tsx`

**Cel**: Wyświetlić przycisk „Zakończ sesję” na górze widoku aktywnej sesji (w jednym wierszu z istniejącym „Karta X z Y”, pełniąc rolę nagłówka sesji — statyczny link „← Powrót do dashboardu” w `study.astro` znajduje się poza tym komponentem i nie ma dostępu do stanu `ratingCounts`/`index`, więc nowy przycisk zastępuje go funkcjonalnie podczas aktywnej sesji). Po kliknięciu, gdy `confirmingExit === true`, renderować panel potwierdzenia w miejscu treści karty (analogiczny stylistycznie do istniejących paneli `rounded-xl border border-white/10 bg-white/5`) z tekstem podsumowującym postęp (np. `Oceniono {index} z {queue.length} fiszek. Na pewno zakończyć sesję?`) i dwoma przyciskami: „Zakończ” (`handleConfirmExit`, `variant="destructive"` lub domyślny) i „Anuluj” (`handleCancelExit`, `variant="outline"`).

**Kontrakt**: W bloku renderu `state.status === "session"`: nagłówek `<div className="flex items-center justify-between"><p>Karta {index+1} z {queue.length}</p><Button size="sm" variant="ghost" onClick={handleRequestExit}>Zakończ sesję</Button></div>`. Warunkowo, gdy `state.confirmingExit`, renderować panel potwierdzenia zamiast (lub nad) treścią karty/przyciskami oceny — implementator wybiera układ zgodny z istniejącym stylem karty.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `npm run lint` przechodzi bez nowych błędów/ostrzeżeń
- `npm run build` kończy się sukcesem

#### Weryfikacja ręczna:

- W trakcie aktywnej sesji (przed ocenieniem jakiejkolwiek karty), kliknięcie „Zakończ sesję” pokazuje panel potwierdzenia z „Oceniono 0 z N fiszek”
- Kliknięcie „Anuluj” w panelu potwierdzenia wraca dokładnie do tej samej karty (bez utraty `revealed`/`index`)
- Po ocenieniu kilku kart, kliknięcie „Zakończ sesję” → panel pokazuje poprawną liczbę ocenionych; potwierdzenie przekierowuje do `/dashboard`
- Po powrocie do `/dashboard` i ponownym wejściu w `/study`, oceny wykonane przed przerwaniem są odzwierciedlone w harmonogramie SRS (np. fiszka nie pojawia się ponownie w „Do powtórki dziś”, jeśli oceniono ją tego dnia z wystarczającym interwałem)
- Przycisk „Zakończ sesję” jest widoczny i działa niezależnie od tego, czy odpowiedź jest odsłonięta (`revealed`) czy nie

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu automatycznych weryfikacji, zatrzymaj się na ręczne potwierdzenie — to ostatnia faza planu.

---

## Strategia testowania

### Testy jednostkowe:

- Brak istniejącej infrastruktury testów jednostkowych dla tych komponentów w repozytorium — nie wprowadzamy nowej w ramach tego planu (poza zakresem S-05). Weryfikacja opiera się na krokach ręcznych poniżej.

### Testy integracyjne:

- Brak istniejącej infrastruktury e2e — weryfikacja end-to-end wykonywana ręcznie w przeglądarce (patrz Kroki testowania ręcznego).

### Kroki testowania ręcznego:

1. **Kontrast przycisków**: otworzyć `/study` i `/dashboard`, sprawdzić czytelność tekstu na wszystkich przyciskach `outline`/`ghost` w stanie domyślnym (bez najeżdżania).
2. **Zaakceptuj wszystkie**: wygenerować fiszki z tekstu, zaakceptować wszystkie jednym kliknięciem, zweryfikować liczbę fiszek w kolekcji.
3. **Zaakceptuj wszystkie + edycja**: edytować jedną propozycję, zaakceptować wszystkie, zweryfikować że zapisana treść to treść edytowana.
4. **Przerwanie sesji**: rozpocząć sesję, ocenić 2-3 karty, przerwać sesję, zweryfikować przekierowanie do `/dashboard` i brak utraty ocenionych kart (sprawdzić `due_date`/`state` w Supabase lub ponownie wejść w sesję).
5. **Regresja**: zweryfikować, że istniejące przepływy (pojedyncza akceptacja, edycja, odrzucenie w generatorze; pełne ukończenie sesji nauki) nadal działają bez zmian.

## Uwagi dotyczące wydajności

Brak istotnych implikacji wydajnościowych — „Zaakceptuj wszystkie” wykonuje równoległe (nie sekwencyjne) żądania `POST /api/flashcards` przez `Promise.allSettled`, co jest odpowiednie przy typowej liczbie propozycji (3-10 wg `src/lib/ai-schemas.ts`).

## Uwagi dotyczące migracji

Brak zmian schematu danych ani migracji — wszystkie trzy poprawki dotyczą wyłącznie warstwy UI/komponentów.

## Referencje

- Poprzednia implementacja (generowanie AI): `context/archive/2026-06-22-ai-generation-flow/plan.md`
- Poprzednia implementacja (sesja nauki): `context/archive/2026-08-02-study-session/plan.md`
- `src/components/FlashcardGenerator.tsx:210-243` (handleAccept), `:205-213` (toSummaryOrReviewing)
- `src/components/StudySession.tsx:85-117` (handleRate, persistencja per-karta)
- `src/components/ui/button.tsx:5-28` (buttonVariants)
- `src/styles/global.css:8-24,42-58,80-96` (tokeny `--foreground` i mapowanie `@theme inline`)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Poprawka kontrastu przycisków (`outline` / `ghost`)

#### Automatyczne

- [x] 1.1 `npm run lint` przechodzi bez nowych błędów/ostrzeżeń — dc62988
- [x] 1.2 `npm run build` kończy się sukcesem — dc62988

#### Ręczne

- [x] 1.3 Przyciski `outline` na `/study` czytelne w stanie domyślnym — dc62988
- [x] 1.4 Przyciski `outline`/`ghost` na `/dashboard` (generator AI) czytelne w stanie domyślnym i po hover — dc62988
- [x] 1.5 Przyciski `outline`/`ghost` w widoku kolekcji czytelne — dc62988
- [x] 1.6 Brak regresji wizualnej tła/hover — dc62988

### Faza 2: „Zaakceptuj wszystkie” propozycje AI

#### Automatyczne

- [x] 2.1 `npm run lint` przechodzi bez nowych błędów/ostrzeżeń — 38f478f
- [x] 2.2 `npm run build` kończy się sukcesem — 38f478f
- [x] 2.3 Brak błędów TypeScript — 38f478f

#### Ręczne

- [x] 2.4 „Zaakceptuj wszystkie” zapisuje wszystkie propozycje pending i odświeża kolekcję — 38f478f
- [x] 2.5 Edytowana (niezapisana) propozycja zapisuje się z edytowaną treścią — 38f478f
- [x] 2.6 Odrzucona propozycja nie jest ponownie zapisywana — 38f478f
- [x] 2.7 Częściowy błąd zapisu: pozostałe propozycje zapisują się poprawnie, błędna pokazuje „Spróbuj ponownie” — 38f478f
- [x] 2.8 Przycisk wyłączony, gdy brak propozycji `pending` — 38f478f

### Faza 3: Przerwanie sesji nauki

#### Automatyczne

- [x] 3.1 `npm run lint` przechodzi bez nowych błędów/ostrzeżeń — c7a726b
- [x] 3.2 `npm run build` kończy się sukcesem — c7a726b

#### Ręczne

- [x] 3.3 „Zakończ sesję” przed oceną jakiejkolwiek karty pokazuje „Oceniono 0 z N” — c7a726b
- [x] 3.4 „Anuluj” wraca do tej samej karty bez utraty stanu — c7a726b
- [x] 3.5 Potwierdzenie po ocenieniu kilku kart przekierowuje do `/dashboard` — c7a726b
- [x] 3.6 Oceny sprzed przerwania są trwałe (widoczne po powrocie do sesji) — c7a726b
- [x] 3.7 Przycisk działa niezależnie od stanu `revealed` — c7a726b
