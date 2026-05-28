---
name: 10x-rule-review
description: >
  Review the condition of an "AI rules" file (CLAUDE.md, AGENTS.md,
  .cursor/rules/*.mdc, .github/copilot-instructions.md, .windsurfrules,
  nested per-area rule files, or any other rule-for-AI markdown) and produce
  a 5-point scorecard with concrete, actionable fixes. Use when the user
  invokes /10x-rule-review with a path to a rules file, or asks to "review
  AI rules", "audit AGENTS.md", "check my CLAUDE.md", "score my agent
  instructions", "is this rules file healthy", or similar. The skill is
  agnostic to which tool the rules file targets — it scores the file as a
  rule-for-AI artifact, not as a project document.
---

# Przegląd reguł 10x

Oceń plik reguł AI w pięciu aspektach i przedstaw konkretne poprawki. Plik poddawany przeglądowi to dowolny plik markdown z regułami dla AI, który poda użytkownik — ta umiejętność nie zakłada CLAUDE.md, AGENTS.md ani żadnego konkretnego narzędzia.

Umiejętność nigdy nie edytuje pliku. Tworzy kartę wyników. Użytkownik decyduje, co z tym zrobić.

## Rozwiązanie wejścia

`$ARGUMENTS` powinien być ścieżką do pojedynczego pliku markdown (bezwzględną, względną do repozytorium lub z prefiksem `@`). Przykłady:

- `@CLAUDE.md`
- `AGENTS.md`
- `.cursor/rules/api.mdc`
- `src/api/AGENTS.md`
- `.github/copilot-instructions.md`
- `~/.claude/CLAUDE.md`

Jeśli `$ARGUMENTS` jest pusty, zapytaj użytkownika o ścieżkę. Nie zgaduj.

Jeśli ścieżka prowadzi do katalogu, zapytaj, który plik ma zostać przejrzany. Jeśli prowadzi do wielu plików (np. `**/AGENTS.md`), oceniaj je pojedynczo i zgłaszaj każdą kartę wyników oddzielnie — nie łącz.

Jeśli plik nie istnieje, zatrzymaj się i zgłoś ścieżkę. Nie wymyślaj treści.

## Czego ta umiejętność NIE robi

- Nie edytuje pliku reguł, *chyba że użytkownik wyraźnie zatwierdzi zmianę kolejności zaproponowaną przez Sprawdzenie 5*. Domyślny wynik jest tylko do odczytu.
- Nie generuje pełnej "naprawionej wersji" pliku. Co najwyżej, Sprawdzenie 5 może przenosić/przegrupowywać sekcje; nigdy nie przepisuje treści reguł.
- Nie zakłada docelowego narzędzia pliku. CLAUDE.md, AGENTS.md, `.mdc`, `.windsurfrules`, niestandardowe nazwy — wszystkie traktowane są jako "plik reguł dla AI".
- Nie ocenia *treści projektu* (architektury, wyborów technologicznych, konwencji). Ocenia *stan artefaktu reguły* — tak samo, jak przegląd kodu ocenia kod, a nie produkt.

## Procedura

1. Przeczytaj cały plik (użyj narzędzia do czytania plików raz; jeśli ma > 2000 linii, czytaj w kawałkach, aż do ukończenia).
2. Oblicz Sprawdzenia 1–4.
3. Uruchom Sprawdzenie 5 w jego własnym wieloetapowym przepływie (5a lista → 5b komentarz → 5c propozycja → 5d zapytanie za pomocą narzędzia interakcji z użytkownikiem → 5e przypomnienie o atomowej zmianie). Edycja zmiany kolejności, jeśli taka nastąpi, odbywa się tutaj i tylko za wyraźną zgodą użytkownika.
4. Wydrukuj kartę wyników w dokładnym formacie pod nagłówkiem "Format wyjściowy". Uwzględnij podsumowanie propozycji zmiany kolejności i decyzję użytkownika w wynikach Sprawdzenia 5.
5. Zatrzymaj się. Nie proponuj dalszych działań, chyba że użytkownik o to poprosi.

---

## 5 sprawdzeń

### Sprawdzenie 1 — Długość

Policz niepuste linie (ignoruj puste linie i czyste linie separatorów, takie jak `---`).

| Linie | Werdykt | Symbol |
|---|---|---|
| 0–200 | dobrze | OK |
| 201–500 | uwaga | WARN |
| 501+ | ostrzeżenie | FAIL |

Dlaczego to ważne: długie pliki reguł zajmują miejsce w oknie kontekstu użytkownika, a reguły w środku pliku otrzymują najsłabszą uwagę od modelu. Długość jest wskaźnikiem tego, że "płacisz kontekstem za rzeczy, których agent nie potrzebuje w każdej sesji".

Dla WARN/FAIL, sugeruj:
- Podziel reguły dla poszczególnych obszarów na zagnieżdżone pliki bliżej ich kodu (np. `src/api/AGENTS.md`).
- Zastąp zduplikowane dokumenty odniesieniami `@` do kanonicznego pliku.
- Usuń reguły, które nie są związane z powtarzającym się trybem awarii agenta.

### Sprawdzenie 2 — Bezpośrednie fragmenty kodu/konfiguracji

Skanuj w poszukiwaniu bloków kodu w ogrodzeniach (```` ``` ````) i wbudowanych bloków kodu dłuższych niż ~3 linie.

Oznacz każdy blok, który wygląda jak:
- Przykładowy komponent, punkt końcowy, migracja, schemat, zapytanie, skrypt bash lub test.
- Plik konfiguracyjny (`tsconfig.json`, `eslintrc`, `package.json`, `wrangler.toml`).
- Szablon migracji lub boilerplate, który znajduje się gdzie indziej w repozytorium.

**Nie** oznaczaj:
- Krótkich fragmentów strukturalnych używanych do zdefiniowania *formatu*, który agent musi wygenerować (np. 2–4-liniowy szablon kształtu błędu).
- Przykładów poleceń (`npm run dev`, `git rebase` itp.).
- Bloków Mermaid/diagramów.

Dla każdego oznaczonego bloku, sugeruj:
- Przenieś fragment do prawdziwego pliku w repozytorium.
- Zastąp blok jednowierszowym odniesieniem `@`, np. `@src/features/users/user.service.ts`, `@docs/api-errors.md`.
- Powód: przykład będzie błędny w dwóch miejscach przy następnym refaktoryzacji; odniesienie nie może się rozjechać.

Werdykt: OK, jeśli 0 oznaczonych bloków · WARN, jeśli 1–2 · FAIL, jeśli 3+.

### Sprawdzenie 3 — Precyzyjny język

Skanuj w poszukiwaniu niejasnych intencji, których nie można sprawdzić w porównaniu z różnicą. Częste błędy:

- "Napisz czysty kod"
- "Postępuj zgodnie z najlepszymi praktykami"
- "Dbaj o jakość"
- "Bądź konsekwentny"
- "Używaj nowoczesnych wzorców"
- "Uczyń go czytelnym / łatwym w utrzymaniu / solidnym"
- "Prawidłowo obsługuj błędy"
- "Utrzymuj prostotę"

Dla każdego dopasowania, **zawsze proponuj co najmniej jedną konkretną, testowalną alternatywę osadzoną w kontekście tego projektu**. Nigdy nie sugeruj "po prostu to usuń" — autor umieścił tam tę linię z jakiegoś powodu; Twoim zadaniem jest przetłumaczenie intencji na coś, co recenzent może sprawdzić w porównaniu z różnicą.

Aby ugruntować sugestię, czerp sygnały z:
- przeglądanego pliku (wspomniany stos, konwencje nazewnictwa podane gdzie indziej, twarde reguły w innych sekcjach),
- pobliskich akapitów wokół niejasnego wyrażenia (co autor zamierzał powiedzieć?),
- widocznego kontekstu repozytorium, jeśli jest dostępny (`package.json`, `tsconfig.json`, wybór frameworka, konfiguracja lintera, pliki reguł rodzeństwa).

Jeśli kontekst projektu naprawdę nie sugeruje niczego konkretnego, zaproponuj rozsądne domyślne ustawienie dla wykrytego stosu i oznacz je **(założone)**, aby autor wiedział, że ma to potwierdzić.

Przykłady (zwróć uwagę, jak każda zamiana wykorzystuje nazwy/konwencje specyficzne dla projektu, a nie ogólne porady):

| Niejasne wyrażenie w pliku | Sygnał kontekstu projektu | Ugruntowana, testowalna zamiana |
|---|---|---|
| "Napisz czysty kod" | TypeScript + ESLint wspomniane w tym samym pliku | "Unikaj `any`. Funkcje powyżej 40 linii muszą być podzielone. Uruchom `pnpm lint` przed zatwierdzeniem." |
| "Prawidłowo obsługuj błędy" | Twarda reguła wcześniej: API zwraca kształt `{ error: {...} }` | "Obsługi API muszą zwracać `{ error: { code, message, context } }` zgodnie z powyżej zdefiniowanym kształtem. Nigdy nie rzucaj surowych błędów." |
| "Bądź konsekwentny w nazewnictwie" | Plik wspomina `feature.handler.ts` gdzie indziej | "Używaj `<feature>.handler.ts` (pasującego do istniejących obsług w `src/api/`), a nie `featureHandler.ts`." |
| "Używaj nowoczesnych wzorców" | Projekt używa natywnego JS, brak lodash w `package.json` | "Używaj natywnych metod `Array`/`Object`. Nie dodawaj `lodash` — nie ma go w `package.json` i tak ma pozostać." |
| "Uczyń komponenty czytelnymi" | Projekt React + Tailwind | "Komponenty powyżej 150 linii muszą być podzielone. Klasy Tailwind przechodzą przez `cn()` dla warunków (założone — potwierdź, jeśli używany jest inny pomocnik)." |
| "Utrzymuj prostotę" | Usługa Python FastAPI | "Preferuj jeden model Pydantic na żądanie/odpowiedź. Brak zagnieżdżonych dekoratorów poza `@router.post` + `@requires_auth`." |

Werdykt: OK, jeśli 0 niejasnych fraz · WARN, jeśli 1–3 · FAIL, jeśli 4+.

Werdykt: OK, jeśli 0 niejasnych fraz · WARN, jeśli 1–3 · FAIL, jeśli 4+.

### Sprawdzenie 4 — Nadmiarowa wiedza

Jesteś agentem aktorem przeglądającym ten plik. Przeczytaj go tak, jakbyś czytał go na początku sesji i zadaj jedno pytanie po każdym akapicie:

> **"Czy wiedziałem to już, zanim otworzyłem plik?"**

Jeśli odpowiedź brzmi "tak, to jest w moich danych treningowych" lub "tak, to jest udokumentowane domyślne ustawienie frameworka" lub "tak, README/konfiguracja lintera już to mówi" — oznacz to. Autor zapłacił kontekstem za coś, czego nie musiałeś wyjaśniać.

Użyj tych autokontroli podczas skanowania:

- **Test "bez niespodzianek".** Czy mógłbyś sam stworzyć ten akapit, gdybyś został o to poproszony, bez dostępu do projektu? Jeśli tak — nadmiarowe.
- **Test "domyślne ustawienia frameworka".** Czy reguła powtarza coś, co framework, konfiguracja lintera, sprawdzanie typów lub narzędzie do testowania już wymusza (np. "używaj trybu ścisłego TypeScript", "używaj czyszczenia `useEffect`", "FastAPI używa Pydantic do walidacji", "PostgreSQL obsługuje JSONB")? Jeśli tak — nadmiarowe. Narzędzie wykryje naruszenie; proza nic nie doda.
- **Test "definicji".** Czy akapit definiuje ogólny termin inżynierski ("co to jest warstwa usług", "czym jest REST", "czym są hooki", "czym jest JSX", "czym jest `Decimal`")? Znasz je. Oznacz i usuń.
- **Test "może być linkiem".** Czy duplikuje `README.md`, skrypty `package.json`, układ projektu lub ustawienia `.eslintrc`? Jeśli tak — zastąp `@README.md` / `@package.json` / `@.eslintrc.json`. Odniesienie się nie rozjeżdża; skopiowana proza tak.
- **Test "zapachu samouczka".** Jeśli akapit brzmi jak sekcja ze strony "Pierwsze kroki" frameworka lub artykułu na Medium — to jest treść samouczka, a nie wiedza o projekcie. Czytałeś je podczas szkolenia.

Co **nie** jest nadmiarowe (nie oznaczaj):
- Konwencje specyficzne dla projektu, które są sprzeczne z domyślnymi ustawieniami frameworka ("używamy `useEffect` tylko do efektów ubocznych niezwiązanych z danymi").
- Lokalne pułapki i historyczne obejścia, których nie można było wywnioskować z kodu ("tabela `events` jest partycjonowana według miesiąca — masowe wstawienia do niewłaściwej partycji kończą się cicho niepowodzeniem").
- Wewnętrzne zasady nazewnictwa, układu lub przepływu pracy ("posty znajdują się w `<verb>_<noun>.posting.ts`").
- Reguły, które wyglądają ogólnie, ale są związane z prawdziwym incydentem (plik powinien wspominać o incydencie lub linkować do rejestru trybów awarii).

Dla każdego oznaczonego akapitu, sugeruj jedną z opcji:
- **Usuń go** — już to wiedziałeś.
- **Zastąp odniesieniem `@`** — `@README.md`, `@tsconfig.json`, `@docs/...`.
- **Zachowaj tylko, jeśli jest poparte incydentem** — a jeśli tak, poproś autora o dodanie notatki o incydencie w tekście, aby reguła przetrwała przyszłe audyty.

Werdykt: OK, jeśli 0 nadmiarowych akapitów · WARN, jeśli 1–3 · FAIL, jeśli 4+.

### Sprawdzenie 5 — Kolejność reguł

Modele zwracają większą uwagę na początek i koniec długich kontekstów ("uwaga w kształcie litery U"). Krytyczne reguły ukryte w środku długiego pliku są statystycznie mniej prawdopodobne do przestrzegania. To sprawdzenie ma swój własny wieloetapowy przepływ, ponieważ zmiana kolejności pliku jest znaczącą edycją, a nie jednowierszową poprawką.

Wykonaj kroki w kolejności. Wynik tego sprawdzenia trafia do karty wyników *i* może wywołać interaktywną zmianę kolejności.

#### Krok 5a — Wypisz bieżącą kolejność wysokiego poziomu

Przejdź przez plik i wydrukuj bieżącą strukturę najwyższego poziomu jako numerowaną listę. Użyj nagłówków H1/H2 (i H3 tylko wtedy, gdy nie ma H2). Uwzględnij numer linii każdego nagłówka. **Nie** komentuj jeszcze — po prostu przedstaw to, co jest.

Przykład:
```
Bieżąca kolejność:
1. # Witamy w OrderFlow (linia 1)
2. ## O zespole (linia 5)
3. ## Misja projektu (linia 9)
4. ## Nasze wartości (linia 13)
5. ## Stos technologiczny (linia 22)
6. ## Konfiguracja (linia 36)
7. ## TypeScript (linia 78)
...
N. ## Konwencje projektu (linia 312)
```

Jeśli plik nie ma nagłówków, powiedz to wyraźnie: *"Brak nagłówków sekcji — plik to jeden niezróżnicowany blok."*

#### Krok 5b — Skomentuj kolejność

Teraz opatrz listę adnotacjami. Dla każdej sekcji nadaj jej krótki tag i jednowierszową notatkę. Użyj tych tagów:

- **CRITICAL** — reguła nośna (bezpieczeństwo, pieniądze, nieodwracalność, specyficzne dla projektu "nigdy nie rób X").
- **USEFUL** — prawdziwa wiedza o projekcie, która pomaga, ale nie jest pułapką.
- **INTRO** — powitanie/misja/zespół — obniża gęstość sygnału na górze.
- **REDUNDANT** — już oznaczono w Sprawdzeniu 4 (domyślne ustawienia frameworka, definicje, treść samouczka).
- **VAGUE** — już oznaczono w Sprawdzeniu 3.
- **REFERENCE** — wskazuje na inne pliki za pomocą składni `@` (tanie, dobre wszędzie).

Następnie przedstaw problem strukturalny w jednym akapicie. Przykłady:

> "Krytyczne reguły bezpieczeństwa i dzierżawy znajdują się na dole (linia 312). Pierwsze 35 linii to INTRO/wartości/marketing, które model będzie mocno ważył, ale które nie zawierają żadnych możliwych do wykonania reguł. Ryzyko: agent czyta całą nadmierną treść i pomija reguły, które faktycznie mają znaczenie."

> "Kolejność jest z grubsza poprawna — twarde reguły na górze, konwencje w środku, odniesienia na dole. Jeden akapit INTRO w linii 1 mógłby zostać skrócony, ale nie jest potrzebna restrukturyzacja."

#### Krok 5c — Zaproponuj lepszą kolejność (tylko w razie potrzeby)

Jeśli komentarz w 5b zidentyfikował prawdziwy problem, zaproponuj docelową kolejność. Sformułuj to jako *"sekcje przeniesione na górę / zachowane / przeniesione na dół / usunięte"*, a nie jako pełne przepisanie każdej linii.

Przykład:
```
Proponowana kolejność:
1. ## Twarde reguły (było: linia 312) ← przeniesione na górę
2. ## Konwencje projektu (było: linia 312, podzielone) ← przeniesione w górę
3. ## Stos technologiczny (było: linia 22) ← zachowane
4. ## Konfiguracja (było: linia 36) ← zachowane, zastąp @README.md jeśli to możliwe
5. ## Tryby awarii (nowa sekcja) ← zbierz tutaj reguły oparte na incydentach
— ## O zespole / Misja / Wartości ← usuń (Sprawdzenie 3/4 już je oznaczyło)
```

Jeśli 5b nie znalazło problemu, pomiń całkowicie 5c — powiedz *"Kolejność jest prawidłowa; nie jest potrzebna restrukturyzacja."*

#### Krok 5d — Zapytaj przed zmianą kolejności

Jeśli 5c wygenerowało propozycję, **zapytaj użytkownika:** przed dotknięciem pliku. Sformułuj pytanie konkretnie. Przykładowe opcje:

- **Tak, zmień kolejność pliku teraz** — zastosuj proponowaną strukturę, zachowaj całą treść reguł, tylko przenieś/przegrupuj sekcje.
- **Przenieś tylko krytyczne reguły na górę** — minimalna zmiana: podnieś twarde reguły na górę, resztę pozostaw bez zmian.
- **Nie, po prostu zostaw sugestię w raporcie** — nie edytuj pliku; karta wyników pozostaje.
- **Pokaż mi najpierw różnicę** — wygeneruj zmieniony plik jako blok podglądu na czacie, bez zapisu.

Jeśli użytkownik wybierze opcję edycji, zastosuj ją ostrożnie: zachowaj każdy bajt treści reguł (przenoszą się tylko nagłówki i bloki sekcji) i wykonaj jedną edycję. Jeśli użytkownik wybierze "zostaw sugestię", nie rób nic.

#### Krok 5e — Przypomnienie o atomowej zmianie

Zawsze kończ Sprawdzenie 5 tym przypomnieniem, niezależnie od tego, czy nastąpiła zmiana kolejności:

> **Przetestuj każdą zmianę w następnej sesji agenta.** Zmiana kolejności pliku reguł to zmiana kształtu kontekstu — jej wpływ na zachowanie agenta ujawnia się dopiero przy następnym uruchomieniu rzeczywistego zadania. Stosuj zmiany pojedynczo (atomowo): zmień kolejność, a następnie uruchom reprezentatywne zadanie, a następnie przejdź do następnej zmiany (podziel, usuń duplikaty, przepisz). Łączenie wielu zmian strukturalnych uniemożliwia przypisanie zmiany zachowania do konkretnej edycji.

#### Werdykt

Oceń plik przed jakąkolwiek zmianą kolejności, na podstawie oryginalnej kolejności:

- **OK** — góra pliku jest gęsta od reguł CRITICAL/USEFUL, jasne nagłówki, brak nadmiernego INTRO na początku.
- **WARN** — struktura jest mieszana: niektóre krytyczne reguły na górze, inne ukryte; lub nietrywialne INTRO na początku.
- **FAIL** — krytyczne reguły pojawiają się po linii 200, lub plik w ogóle nie ma nagłówków, lub pierwsze 30+ linii to czyste INTRO/marketing.

---

## Format wyjściowy

Wydrukuj dokładnie to, w tej kolejności. Użyj języka polskiego lub angielskiego, zgodnego z językiem zapytania użytkownika. Odwołaj się do `path:line` dla każdego konkretnego ustalenia, aby użytkownik mógł od razu do niego przejść.

```
# Przegląd reguł — <ścieżka>

**Ogólnie:** <jednowierszowe podsumowanie, np. "Zdrowy plik z dwoma punktami nadmiarowości" lub "Długi, niejasny i ciężki na dole — wymaga podziału">

## Karta wyników

| # | Sprawdzenie | Werdykt | Wynik |
|---|---|---|---|
| 1 | Długość | OK/WARN/FAIL | <n> niepustych linii |
| 2 | Bezpośrednie fragmenty | OK/WARN/FAIL | <n> oznaczonych bloków |
| 3 | Precyzyjny język | OK/WARN/FAIL | <n> niejasnych fraz |
| 4 | Nadmiarowa wiedza | OK/WARN/FAIL | <n> nadmiarowych reguł |
| 5 | Kolejność reguł | OK/WARN/FAIL | <jednowierszowy powód> |

## Ustalenia

### 1. Długość — <werdykt>
- <n> niepustych linii.
- <sugestia, jeśli WARN/FAIL, w przeciwnym razie pomiń>

### 2. Bezpośrednie fragmenty — <werdykt>
- `ścieżka:zakres-linii` — <jaki rodzaj fragmentu> → sugeruj odniesienie `@<plik>`.
- ...

### 3. Precyzyjny język — <werdykt>
- `ścieżka:linia` — "<niejasna fraza>" → "<testowalne przepisanie>"
- ...

### 4. Nadmiarowa wiedza — <werdykt>
- `ścieżka:linia` — <co jest nadmiarowe> → <usuń | zastąp @odniesieniem | zachowaj tylko, jeśli poparte incydentem>
- ...

### 5. Kolejność reguł — <werdykt>
- <obserwacja strukturalna, np. "Krytyczna reguła bezpieczeństwa w linii 287, wstępne bzdury w liniach 1–42">
- <sugestia>

## 3 najważniejsze działania
1. <najbardziej efektywna poprawka>
2. <druga>
3. <trzecia>
```

Jeśli sprawdzenie jest OK, nadal umieść je w tabeli, ale pomiń podsekcję "Ustalenia" (napisz `### N. <nazwa> — OK` i jedną krótką linię, nic więcej).

"3 najważniejsze działania" muszą być uporządkowane według efektywności, a nie według numeru sprawdzenia. Wybierz spośród wszystkich pięciu sprawdzeń.

---

## Przypadki brzegowe

- **Plik poniżej 50 linii:** nadal wykonaj wszystkie pięć sprawdzeń. Krótkie pliki często najczęściej zawodzą w Sprawdzeniu 3 (niejasne) i Sprawdzeniu 4 (nadmiarowe).
- **Plik składa się głównie z odniesień (`@…`) i niewielu reguł w tekście:** to dobry znak dla Sprawdzeń 2 i 4. Nie karaj go.
- **Plik to `.mdc` z frontmatterem (`globs:`, `alwaysApply:`):** policz linie reguł od miejsca po frontmatterze. Sam frontmatter to konfiguracja, a nie treść reguł.
- **Plik to wygenerowany szablon z `/init` i nietknięty:** nadal go przejrzyj. Często dominuje Sprawdzenie 4 (nadmiarowe) — to sygnał do jego wyczyszczenia.
- **Wiele plików reguł w projekcie:** przejrzyj ten, który został przekazany. Wspomnij o plikach rodzeństwa w "3 najważniejszych działaniach" tylko wtedy, gdy jest to istotne (np. duplikacja między głównym `AGENTS.md` a zagnieżdżonym).