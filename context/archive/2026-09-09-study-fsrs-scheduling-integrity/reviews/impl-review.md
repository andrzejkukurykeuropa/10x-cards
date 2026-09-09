<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Study/FSRS scheduling integrity — pokrycie testowe Ryzyka #4

- **Plan**: context/changes/study-fsrs-scheduling-integrity/plan.md
- **Scope**: Phase 1–3 of 3 (pełny przegląd planu)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION → wszystkie 3 findingi rozstrzygnięte w triage (2026-09-09): F1 udokumentowany (dług lintu odłożony do osobnej zmiany przed §3 Faza 5), F2 sprostowany w `plan.md` § Addenda A1, F3 zweryfikowany (oba wstrzyknięcia regresji odtworzone i potwierdzone). Zero zmian w dostarczonym kodzie testowym — findingi dotyczyły tekstu planu, długu lintu spoza zakresu i rzetelności odhaczeń.
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Podsumowanie: trzy dostarczone pliki testowe (`tests/lib/fsrs.test.ts` — 22 testy,
`tests/api/study-review.test.ts` — 6, `tests/components/StudySession.test.tsx` — 3)
są solidne, dobrze izolowane (asercje id-scoped + `cleanupFlashcards` w `afterEach`),
zgodne ze wzorcami sąsiednich plików i wszystkie przechodzą. Cały zestaw: 74/74 zielone.
Zero zmian w `src/**` / `supabase/**` — dyscyplina zakresu wzorowa. Dwa problemy do
rozważenia: (1) `npm run lint` jest czerwony (błędy w plikach spoza tej zmiany), a mimo
to bramka lintu została odhaczona jako zielona w każdej fazie; (2) plan w kilku miejscach
mówi `again` → `Relearning`, podczas gdy implementacja poprawnie asertuje `Review`.

## Findings

### F1 — `npm run lint` jest czerwony; kryteria lintu faz (1.4 / 2.4 / 3.5) odhaczone jako zielone

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Dimension**: Success Criteria
- **Location**: plan.md:252, plan.md:373, plan.md:490 (kryteria „Lint przechodzi: `npm run lint`")
- **Detail**:
  `npm run lint` kończy się **49 błędami** w 6 plikach `src/**`, z których **żaden nie
  należy do tej zmiany**: `src/components/AccountDeletion.tsx`, `src/components/ui/checkbox.tsx`,
  `src/components/ui/dialog.tsx`, `src/lib/inactive-accounts.ts`,
  `src/pages/api/admin/cleanup-inactive-accounts.ts`, `src/pages/api/generate-flashcards.ts`.
  Wszystkie te pliki są **niezmienione od przed Fazą 1** (`git diff --stat aaf2e7c..HEAD` na
  tych ścieżkach = pusty); ich commity treści (`3cd5bb0`, `431be8c`) są przodkami `aaf2e7c`.
  Wniosek: `npm run lint` był już czerwony, gdy pola 1.4 / 2.4 / 3.5 („Lint przechodzi:
  `npm run lint`") oznaczono `[x]` z SHA `aaf2e7c` / `3896df3` / `1ab61d2` — podpis na ślepo
  albo świadome odhaczenie cudzych błędów.
  Trzy nowe pliki testowe **same są czyste**: `npx eslint tests/**/*.{ts,tsx}` → 0 błędów.
  Konfiguracja ESLint/Prettier też jest stabilna (ostatnia zmiana `ec37797`, również przodek
  `aaf2e7c`). To nie jest regresja tej zmiany — ale plan Fazy 5 („Quality-gates wiring")
  chce podłączyć `unit + integration` jako **wymaganą bramę CI**, a przy czerwonym
  `npm run lint` cała brama lintu jest już zablokowana i wymaga osobnej akcji.
- **Fix A ⭐ Recommended**: Zawęź/uściślij kryterium — odhacz „lint czysty dla dostarczonych
  plików" (`npx eslint tests/**`) i **odnotuj w raporcie oraz w `test-plan.md` §6.6**, że
  repo-wide `npm run lint` jest czerwony z przyczyn zewnętrznych; otwórz osobną zmianę
  (`/10x-new lint-debt-cleanup`) na 46 auto-fixowalnych + 3 ręczne błędy przed Fazą 5.
  - Strength: Utrzymuje dyscyplinę zakresu (ta faza to „bez zmian w kodzie produkcyjnym");
    czyni dług widocznym dla Fazy 5, która i tak dotyka bram CI.
  - Tradeoff: Brama lintu pozostaje czerwona do czasu tej osobnej zmiany.
  - Confidence: HIGH — błędy udowodnienie pre-istniejące i poza zakresem; `--fix` pokrywa 46/49.
  - Blind spot: Nie sprawdzono, czy CI (`.github/workflows/ci.yml`) już teraz faila na master
    z tego powodu — jeśli tak, dług jest pilniejszy.
- **Fix B**: Napraw wszystkie 49 błędów lintu teraz (`npm run lint:fix` + 3 ręczne w
  `cleanup-inactive-accounts.ts` / `generate-flashcards.ts`) w ramach tej zmiany.
  - Strength: `npm run lint` znów zielony; kryteria faz stają się prawdziwie spełnione.
  - Tradeoff: Rozszerzenie zakresu zmiany „test-only" o edycje 6 plików `src/**` — łamie
    własną barierę planu „Czego NIE robimy" i miesza dług cudzej lekcji z tą fazą.
  - Confidence: MED — `no-unnecessary-condition` i `no-deprecated` (`generateObject`) mogą
    wymagać nietrywialnej decyzji, nie samego formatowania.
  - Blind spot: `generateObject is deprecated` może być świadomą decyzją innej lekcji (m3l1).
- **Decision**: FIXED via Fix A — `test-plan.md` §6.6 rozszerzone o „Dług lintu blokujący §3 Faza 5"; dług wypisany w `follow-ups/review-fixes.md` (F1) z akcją przed podłączeniem bramy CI. Trzy nowe pliki testowe potwierdzone lint-czyste. Naprawa 49 błędów odłożona do osobnej zmiany.

### F2 — Plan mówi `again` na karcie `Review` → `Relearning`; implementacja poprawnie asertuje `Review`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Plan Adherence
- **Location**: plan.md:41, plan.md:207, plan.md:316, plan.md:523 vs `tests/lib/fsrs.test.ts:132-138`, `tests/api/study-review.test.ts:135-170`
- **Detail**:
  Plan w czterech miejscach twierdzi, że powtórzone / „again" przejście na karcie w stanie
  `Review` przenosi ją do `Relearning` (np. Faza 1: „*`state === "Relearning"`*"; case 2.3:
  „*zwrócony `state === "Relearning"`*"). Jednak `research.md:88-94` (z odnośnikami do kodu
  `ts-fsrs`) **oraz sam plan.md:30** ustalają, że `enable_short_term: false` ⇒
  `LongTermScheduler` ⇒ każdy grade utrwala `State.Review`, a `Learning`/`Relearning` nigdy
  nie trafiają do bazy. Implementacja poszła za badaniem: `fsrs.test.ts:132-138` asertuje
  `state === "Review"` dla `again` na Review (22/22 przechodzą), a integracyjny 2.3 w ogóle
  rezygnuje z asercji `state` (asertuje `lapses` +1 i cofnięty `due_date`). Implementacja
  jest **poprawna**; wadliwy jest tekst planu (spec asercji Fazy 1 i case 2.3), który
  wprowadzi w błąd każdego, kto później potraktuje plan jako źródło prawdy — w tym
  `/10x-tdd` czytający „książkę kucharską".
- **Fix**: Dopisz jednozdaniowy addendum do `plan.md` (i/lub `change.md` „## Notes")
  prostujący cztery miejsca: pod `LongTermScheduler` (`enable_short_term: false`) `again` na
  karcie `Review` **pozostaje `Review`**, a „cofnięcie" jest obserwowalne przez `lapses` +1
  i krótszy `due_date`, nie przez zmianę `state`. `test-plan.md` §6.6 opisuje to już poprawnie.
- **Decision**: FIXED via Fix now — `plan.md` dostał sekcję „## Addenda (przegląd implementacji, 2026-09-09)" pkt A1 prostujący cztery miejsca; wiążący jest addendum, zaimplementowane testy są poprawne.

### F3 — Ręczne odhaczenia wstrzyknięcia regresji (1.6 / 2.8 / 3.8) bez śladu w historii

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Success Criteria
- **Location**: plan.md:599 (1.6), plan.md:617 (2.8), plan.md:636 (3.8)
- **Detail**:
  Trzy ręczne kryteria („wstrzyknięta regresja faktycznie łamie test; cofnięta") są
  oznaczone `[x]` z SHA fazy. Z natury nie zostawiają śladu w diffie (zmiana jest cofana),
  więc nie da się ich zweryfikować post-hoc. To **prawidłowa metoda** z planu, nie zarzut co
  do treści — ale w połączeniu z F1 (bramka lintu odhaczona mimo czerwieni) rodzi pytanie,
  czy ręczne pola były realnie wykonane. Weryfikator odtworzył je częściowo automatycznie:
  usunięcie `enable_short_term: false` łamie asercję granulacji dziennej i `state === "Review"`
  — mechanika testu jest zdrowa, więc twierdzenie 1.6 jest wiarygodne. 2.8 / 3.8 nie
  odtworzono.
- **Fix**: Przy kolejnym dotknięciu obszaru (lub w epilogu) wykonaj ponownie wstrzyknięcia z
  plan.md:498-500 (synchroniczny `useRef` guard w `handleRate` → 3.2 czerwone, 3.1/3.3
  zielone) i plan.md:382 (kontrola idempotencji → 2.3 czerwone) i potwierdź; jeśli któreś nie
  łamie testu zgodnie z opisem — to realne ustalenie do eskalacji.
- **Decision**: FIXED via Fix now — weryfikator odtworzył oba wstrzyknięcia w tej sesji:
  - **3.8**: `submitLockRef` (synchroniczny `useRef` guard + reset w `finally`) w `handleRate`
    → `tests/components/StudySession.test.tsx` 3.2 **czerwone** (`reviewCallCount` 1 zamiast 2),
    3.1 i 3.3 **zielone**. Zgodne z plan.md:498-500.
  - **2.8**: check `due_date > now` po SELECT w `review.ts` → `tests/api/study-review.test.ts`
    2.3 **czerwone** (replay `409` zamiast `200`), 2.1/2.2/2.4/2.5/2.6 **zielone**. Zgodne z
    plan.md:382.
  - Oba wstrzyknięcia cofnięte (`git checkout --`), `git status` czysty poza `context/**`;
    31/31 testów obszaru znów zielone. Twierdzenia 2.8/3.8 z `## Progress` potwierdzone rzetelne.
