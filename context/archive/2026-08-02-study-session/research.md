---
change_id: study-session
title: Badanie bibliotek SRS dla S-04 (Sesja nauki)
created: 2026-08-02
source: web_search_exa
---

## Kontekst

S-04 wymaga biblioteki implementującej algorytm SRS (spaced repetition), zgodnej z:
- TypeScript
- Cloudflare Workers edge runtime (brak Node.js API, brak natywnych modułów)
- istniejącym schematem kolumn z F-03: `due_date`, `easiness_factor`, `interval`, `repetitions` (model SM-2)

## Znalezione biblioteki

### 1. `@open-spaced-repetition/sm-2` (zgodna z obecnym schematem, odrzucona)
- Klasyczny algorytm **SM-2** — dokładnie ten model, dla którego zaprojektowano schemat F-03 (`easiness_factor`, `interval`, `repetitions`).
- 0 zależności runtime, API: `Scheduler`, `Card`, `ReviewLog`.
- Repo: https://github.com/open-spaced-repetition/sm-2-ts
- Weekly downloads: ~7 (mała społeczność, ale kod mały/audytowalny).
- Instalacja: `npm install @open-spaced-repetition/sm-2`
- **Zaleta:** brak zmian w migracji SQL, plug-and-play z istniejącym schematem.

### 2. `ts-fsrs` (✅ wybrana)
- Implementuje **FSRS v6** (nowocześniejszy algorytm, lepsza trafność powtórek niż SM-2 wg badań).
- TS-native, wspiera ESM/CJS/UMD.
- Duża, aktywna społeczność (org `open-spaced-repetition`), dobrze udokumentowany (TypeDoc).
- Repo: https://github.com/open-spaced-repetition/ts-fsrs
- Instalacja: `pnpm add ts-fsrs` / `npm install ts-fsrs`
- ⚠️ README wskazuje wymóg Node.js ≥20 dla dev/testów pakietu; sam kod nie korzysta z Node-specific API, więc powinien działać w Workers.
- **Wada:** wymaga dodatkowych pól stanu (stability, difficulty) — rozszerzenie schematu F-03, większa zmiana niż zakładana w S-04.

### 3. `@monkey-dev-vibes/spaced-repetition` (alternatywa lekka)
- Implementacja SM-2, czysta funkcja `processReview(card, rating)`, zero zależności runtime, ~95 linii kodu.
- Jawnie reklamowana jako edge/Workers-friendly, dual ESM+CJS.
- Bardzo mała społeczność / nowy projekt — ryzyko utrzymania.
- Repo: https://github.com/Monkey-Dev-Vibes/spaced-repetition
- Instalacja: `npm install @monkey-dev-vibes/spaced-repetition`

## Wniosek / rekomendacja

**Wybrana biblioteka: `ts-fsrs`** (decyzja developera — priorytet jakości algorytmu nad zerowym kosztem migracji).

FSRS (Free Spaced Repetition Scheduler) istotnie przewyższa SM-2 pod względem trafności przewidywania zapominania (neuronowy model dopasowany do danych z realnych sesji nauki), kosztem większej złożoności stanu karty.

### Konsekwencja: schemat F-03 (SM-2) nie jest zgodny z FSRS — wymagany refaktor

Obecne kolumny `flashcards` (`easiness_factor`, `interval`, `repetitions`) odpowiadają modelowi SM-2. `ts-fsrs` operuje na innym modelu stanu karty (`Card` z pakietu `ts-fsrs`):

| Pole FSRS (`ts-fsrs` `Card`) | Typ | Opis |
|---|---|---|
| `due` | timestamp | odpowiednik `due_date` — można zmapować 1:1 |
| `stability` | float | stabilność pamięci (dni) — **nowe pole**, brak odpowiednika w SM-2 |
| `difficulty` | float (1–10) | trudność karty — **nowe pole**, zastępuje `easiness_factor` |
| `elapsed_days` | int | dni od ostatniej powtórki — wyliczalne z `last_review`, opcjonalnie przechowywane |
| `scheduled_days` | int | odpowiednik `interval` — można zmapować z korektą jednostek |
| `reps` | int | odpowiednik `repetitions` — mapowanie 1:1 |
| `lapses` | int | liczba "zapomnień" — **nowe pole**, brak w SM-2 |
| `state` | enum (New/Learning/Review/Relearning) | **nowe pole**, brak w SM-2 |
| `last_review` | timestamp \| null | **nowe pole**, brak w SM-2 |

**Wniosek:** `easiness_factor` traci sens pod FSRS (zastępowany przez `difficulty` + `stability`), a `state`, `stability`, `lapses`, `last_review` muszą zostać dodane. To wymaga **osobnej migracji SQL** rozszerzającej/zastępującej pola SRS w tabeli `flashcards`, wykonanej PRZED implementacją S-04.

### Rekomendacja architektoniczna

Dodać nowy fundament **F-04: Migracja schematu SRS z SM-2 na FSRS** (patrz zaktualizowany `roadmap.md`) jako wymaganie wstępne dla S-04, zamiast wykonywać refaktor "w locie" wewnątrz implementacji S-04.

## Dokumentacja `ts-fsrs`

Pełna dokumentacja API (model `Card`, `createEmptyCard()`, `fsrs()`/`repeat()`/`next()`, zgodność z Cloudflare Workers) — patrz [`ts-fsrs.md`](./ts-fsrs.md).

## Otwarta niewiadoma (z roadmap S-04)

- Pytanie: Którą bibliotekę SRS wybrać? Owner: developer. Block: **tak** — musi być wybrana przed implementacją S-04.
- **Status po tym badaniu:** ✅ Rozstrzygnięte — `ts-fsrs` (FSRS v6). Wymaga nowego fundamentu F-04 (migracja schematu) przed S-04.
