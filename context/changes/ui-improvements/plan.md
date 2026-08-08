# Plan implementacji: Poprawki UI (S-07)

## Przegląd

S-07 z roadmapy: (1) zalogowany użytkownik ma łatwo dostępny, widoczny link do `/settings` z dowolnego ekranu aplikacji (dashboard, sesja nauki, ustawienia), zamiast konieczności ręcznego wpisywania adresu; (2) strona główna `/` przestaje pokazywać domyślny szablon powitalny Astro Startera i zamiast tego wyświetla prostą, dedykowaną stronę tytułową 10xCards.

## Analiza stanu obecnego

- `src/components/Topbar.astro` już istnieje i zawiera logikę zalogowany/niezalogowany (email + link „Dashboard” + „Sign out” vs. linki „Sign in”/„Sign up”), ale jest używany **wyłącznie** w `Welcome.astro` (czyli na `/`).
- `src/pages/dashboard.astro`, `src/pages/study.astro`, `src/pages/settings.astro` mają własne, niespójne nagłówki wewnątrz kart „cosmic” i nie zawierają linku do ustawień. `dashboard.astro` ma własny przycisk „Sign out” osadzony w karcie nagłówka.
- `src/components/Welcome.astro` to niezmieniony szablon startera „10x Astro Starter” z hero, dwoma CTA (Sign in/Sign up) i trzema kartami funkcji marketingowych startera — niezwiązanymi z 10xCards.
- `src/pages/index.astro` renderuje tylko `<Layout><Welcome /></Layout>`.
- Konwencja wizualna w całej aplikacji (dashboard, study, settings, auth) to `bg-cosmic min-h-screen` + karty `rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl` z gradientowym nagłówkiem `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent`.
- `/settings` jest już chronione przez `PROTECTED_ROUTES` w `src/middleware.ts`.

### Kluczowe odkrycia:

- Topbar jest gotowym, reużywalnym komponentem — rozszerzenie go i włączenie na 3 kolejne strony to najmniejsza zmiana spełniająca wymaganie „z dowolnego ekranu”.
- Usunięcie przycisku „Sign out” z karty dashboardu jest konieczne, aby uniknąć duplikacji po dodaniu Topbar (Topbar już ma „Sign out”).
- Zamiana `Welcome.astro` nie wymaga zmian w `index.astro` poza ewentualnie przekazaniem `user` — strona tytułowa ma pokazywać link do dashboardu, gdy użytkownik jest zalogowany, więc potrzebuje dostępu do `Astro.locals.user`.

## Pożądany stan końcowy

- Na dashboard, sesji nauki i stronie ustawień widoczny jest wspólny pasek (Topbar) z linkiem „Ustawienia” obok istniejących elementów (email, Dashboard, Sign out).
- Dashboard nie ma już zduplikowanego przycisku „Sign out” w karcie — jedynym miejscem wylogowania jest Topbar.
- `/` renderuje prostą stronę tytułową 10xCards (nazwa, tagline, CTA Sign in/Sign up dla gościa lub link do dashboardu dla zalogowanego) w stylu `bg-cosmic` bez dodatkowych dekoracji (orby/gwiazdy), spójnym z resztą aplikacji.
- Weryfikacja: `npm run lint` i `npm run build` przechodzą; ręczna nawigacja po wszystkich czterech stronach potwierdza widoczność i działanie linku „Ustawienia” oraz poprawność nowej strony głównej dla zalogowanego i niezalogowanego użytkownika.

## Czego NIE robimy

- Nie zmieniamy logiki uwierzytelniania, `middleware.ts` ani `PROTECTED_ROUTES`.
- Nie tworzymy nowego, osobnego komponentu nawigacyjnego (NavBar) — rozszerzamy istniejący `Topbar.astro`.
- Nie dodajemy menu rozwijanego ani ikony trybika — link „Ustawienia” jest zwykłym linkiem tekstowym.
- Nie zachowujemy efektów wizualnych „cosmic” (orby, gwiazdy) z obecnego `Welcome.astro` na nowej stronie tytułowej.
- Nie zmieniamy zawartości/funkcjonalności samej strony `/settings` (poza dodaniem Topbar) — usuwanie konta pozostaje bez zmian.
- Nie aktualizujemy PRD (S-07 nie ma odnośników PRD — poza zakresem).

## Podejście do implementacji

Rozszerzyć `Topbar.astro` o link „Ustawienia” w gałęzi zalogowanego użytkownika, następnie dołączyć `<Topbar />` na górze `dashboard.astro`, `study.astro` i `settings.astro` (przekazując `user` tak jak robi to `Welcome.astro`), usuwając zduplikowany przycisk „Sign out” z karty dashboardu. Następnie zastąpić zawartość `Welcome.astro` nową, uproszczoną treścią 10xCards, zachowując istniejący plik/nazwę komponentu (mniejsza zmiana niż tworzenie nowego pliku i aktualizacja importu), ale usuwając orby/gwiazdy i karty funkcji.

## Faza 1: Rozszerzenie Topbar o link „Ustawienia”

### Przegląd

Dodać link nawigacyjny „Ustawienia” do istniejącego komponentu `Topbar.astro`, widoczny tylko dla zalogowanych użytkowników, obok linku „Dashboard”.

### Wymagane zmiany:

#### 1. Link „Ustawienia” w Topbar

**Plik**: `src/components/Topbar.astro`

**Cel**: Dodać link `<a href="/settings">Ustawienia</a>` w sekcji zalogowanego użytkownika, tuż obok istniejącego linku „Dashboard”, używając tej samej klasy stylu (`text-purple-300 transition-colors hover:text-purple-100 hover:underline`).

**Kontrakt**: Link musi być widoczny tylko w gałęzi `user ? (...) : (...)` (analogicznie do „Dashboard”), zachowując kolejność: email → Dashboard → Ustawienia → Sign out.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`

#### Weryfikacja ręczna:

- Link „Ustawienia” jest widoczny w Topbar na `/` po zalogowaniu i prowadzi do `/settings`
- Link „Ustawienia” nie pojawia się dla niezalogowanego użytkownika

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem, zanim przejdziesz do następnej fazy.

---

## Faza 2: Integracja Topbar w dashboard/study/settings

### Przegląd

Dołączyć rozszerzony `Topbar` na górze `dashboard.astro`, `study.astro` i `settings.astro`, tak aby link „Ustawienia” (i pozostałe elementy Topbar) był dostępny z każdego z tych ekranów. Usunąć zduplikowany przycisk „Sign out” z karty nagłówka dashboardu.

### Wymagane zmiany:

#### 1. Dashboard — dodanie Topbar i usunięcie duplikatu Sign out

**Plik**: `src/pages/dashboard.astro`

**Cel**: Zaimportować i wyrenderować `<Topbar />` nad istniejącą kartą nagłówka (wewnątrz `<div class="mx-auto max-w-5xl">`, przed kartą z tytułem „Dashboard”), tak jak robi to `Welcome.astro`. Usunąć `<form method="POST" action="/api/auth/signout">...</form>` z wiersza przycisków w karcie (Topbar przejmuje funkcję wylogowania), zostawiając tam tylko link „Rozpocznij naukę”.

**Kontrakt**: `Topbar` przyjmuje `user` niejawnie przez `Astro.locals` (tak samo jak w `Welcome.astro` — nie wymaga propsów). Layout strony (karty, tytuł, powitanie) pozostaje bez zmian poza usunięciem przycisku Sign out.

#### 2. Sesja nauki — dodanie Topbar

**Plik**: `src/pages/study.astro`

**Cel**: Zaimportować i wyrenderować `<Topbar />` nad istniejącą kartą nagłówka sesji nauki, analogicznie do dashboardu.

**Kontrakt**: Bez zmian w reszcie strony (nagłówek „Sesja nauki” + link powrotu do dashboardu + `StudySession` pozostają jak są).

#### 3. Ustawienia — dodanie Topbar

**Plik**: `src/pages/settings.astro`

**Cel**: Zaimportować i wyrenderować `<Topbar />` nad istniejącą kartą nagłówka ustawień, analogicznie do pozostałych stron.

**Kontrakt**: Bez zmian w reszcie strony (nagłówek „Ustawienia” + karta usuwania konta pozostają jak są).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Na `/dashboard`, `/study` i `/settings` widoczny jest Topbar z linkiem „Ustawienia” prowadzącym do `/settings`
- Na dashboardzie nie ma już zduplikowanego przycisku „Sign out” w karcie — wylogowanie działa wyłącznie przez Topbar
- Wylogowanie z dowolnej z tych stron działa poprawnie (przekierowanie po Sign out)

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem, zanim przejdziesz do następnej fazy.

---

## Faza 3: Nowa strona tytułowa 10xCards

### Przegląd

Zastąpić zawartość `Welcome.astro` (renderowaną na `/`) prostą, dedykowaną stroną tytułową 10xCards — bez orbów/gwiazd, w stylu spójnym z resztą aplikacji (`bg-cosmic` + karta), z nazwą produktu, krótkim taglinem opisującym propozycję wartości i odpowiednim CTA w zależności od stanu zalogowania.

### Wymagane zmiany:

#### 1. Treść strony tytułowej

**Plik**: `src/components/Welcome.astro`

**Cel**: Zastąpić obecną zawartość (orby, gwiazdy, hero „10x Astro Starter”, karty funkcji startera) prostą sekcją w kontenerze `bg-cosmic min-h-screen` z kartą `rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl` zawierającą: nazwę „10xCards” (gradientowy nagłówek jak na dashboard/settings), krótki tagline (np. „Wklej tekst, a AI wygeneruje dla Ciebie gotowe fiszki do nauki — Ty tylko zatwierdzasz”), oraz CTA: jeśli `user` istnieje — link do `/dashboard`; w przeciwnym razie — linki „Sign in” i „Sign up” (zachowując istniejące klasy przycisków z obecnego `Welcome.astro`). Zachować `<Topbar />` na górze (już tam jest).

**Kontrakt**: Komponent nadal przyjmuje/używa `Astro.locals.user` (przez sam `Topbar`, plus bezpośrednio w nowej sekcji CTA — należy dodać `const { user } = Astro.locals;` w frontmatterze). Struktura pliku: `Topbar` → hero/karta z nazwą + tagline + CTA. Usunąć sekcję kart funkcji (`Authentication Ready` / `Modern Stack` / `Developer Experience`) oraz elementy dekoracyjne (orby, gwiazdy) i związane z nimi klasy (`bg-cosmic relative min-h-screen w-full overflow-hidden` zastąpić prostym `bg-cosmic min-h-screen p-4` jak na dashboard/settings).

#### 2. Tytuł strony

**Plik**: `src/pages/index.astro`

**Cel**: Ustawić `title="10xCards"` na `<Layout>` (obecnie brak propsa `title`, więc używany jest domyślny „10x Astro Starter”).

**Kontrakt**: `<Layout title="10xCards"><Welcome /></Layout>`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Weryfikacja ręczna:

- `/` wyświetla nazwę „10xCards”, krótki tagline i przyciski Sign in/Sign up dla gościa
- Po zalogowaniu `/` wyświetla link do dashboardu zamiast Sign in/Sign up
- Brak orbów/gwiazd i kart funkcji startera na stronie
- Tytuł karty przeglądarki pokazuje „10xCards”

**Uwaga implementacyjna**: Po zakończeniu tej fazy i przejściu wszystkich automatycznych weryfikacji, zatrzymaj się tutaj na ręczne potwierdzenie od człowieka, że testy ręczne zakończyły się sukcesem.

---

## Strategia testowania

### Testy jednostkowe:

- Brak nowych testów jednostkowych — zmiany są czysto prezentacyjne (Astro components), projekt nie ma obecnie testów komponentów Astro.

### Testy integracyjne:

- Brak — poza zakresem MVP; weryfikacja ręczna pokrywa scenariusze end-to-end.

### Kroki testowania ręcznego:

1. Zalogować się i przejść kolejno przez `/dashboard`, `/study`, `/settings` — potwierdzić widoczność i działanie linku „Ustawienia” w Topbar na każdej z nich.
2. Na dashboardzie potwierdzić brak zduplikowanego przycisku „Sign out” i że wylogowanie przez Topbar działa (przekierowanie).
3. Wylogować się i otworzyć `/` — potwierdzić nową treść (nazwa, tagline, Sign in/Sign up), brak orbów/gwiazd/kart funkcji.
4. Zalogować się i otworzyć `/` ponownie — potwierdzić, że zamiast Sign in/Sign up pojawia się link do dashboardu.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` (S-07)
- Istniejący wzorzec Topbar: `src/components/Topbar.astro`
- Wzorzec stylu strony: `src/pages/settings.astro`, `src/pages/dashboard.astro`, `src/pages/auth/signin.astro`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>` po zatwierdzeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Rozszerzenie Topbar o link „Ustawienia”

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint`

#### Ręczne

- [ ] 1.2 Link „Ustawienia” widoczny w Topbar na `/` po zalogowaniu i prowadzi do `/settings`
- [ ] 1.3 Link „Ustawienia” nie pojawia się dla niezalogowanego użytkownika

### Faza 2: Integracja Topbar w dashboard/study/settings

#### Automatyczne

- [ ] 2.1 Lint przechodzi: `npm run lint`
- [ ] 2.2 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 2.3 Topbar z linkiem „Ustawienia” widoczny na `/dashboard`, `/study` i `/settings`
- [ ] 2.4 Brak zduplikowanego przycisku „Sign out” na dashboardzie — wylogowanie działa wyłącznie przez Topbar
- [ ] 2.5 Wylogowanie z dowolnej z tych stron działa poprawnie

### Faza 3: Nowa strona tytułowa 10xCards

#### Automatyczne

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Build przechodzi: `npm run build`

#### Ręczne

- [ ] 3.3 `/` wyświetla nazwę „10xCards”, tagline i CTA Sign in/Sign up dla gościa
- [ ] 3.4 Po zalogowaniu `/` wyświetla link do dashboardu zamiast Sign in/Sign up
- [ ] 3.5 Brak orbów/gwiazd i kart funkcji startera na stronie
- [ ] 3.6 Tytuł karty przeglądarki pokazuje „10xCards”
