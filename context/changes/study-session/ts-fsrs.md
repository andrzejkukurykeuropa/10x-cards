---
change_id: study-session
title: Dokumentacja ts-fsrs (Context7)
created: 2026-08-02
source: context7 (/open-spaced-repetition/ts-fsrs)
---

## Model `Card` (stan karty)
```typescript
interface Card {
  due: Date              // termin kolejnej powtórki — odpowiednik due_date
  stability: number       // stabilność pamięci (dni, R=90%) — NOWE
  difficulty: number      // trudność karty (1–10) — NOWE, zastępuje easiness_factor
  elapsed_days: number    // dni od ostatniej powtórki (deprecated, wyliczalne)
  scheduled_days: number  // dni do kolejnej powtórki — odpowiednik interval
  learning_steps: number  // indeks aktualnego kroku nauki — NOWE
  reps: number            // liczba powtórek — odpowiednik repetitions
  lapses: number          // liczba "zapomnień" — NOWE
  state: State            // New | Learning | Review | Relearning — NOWE
  last_review?: Date      // data ostatniej powtórki — NOWE
}
```
(Potwierdza i doprecyzowuje tabelę mapowania z `research.md` — dodatkowo ujawnia pole `learning_steps`, nieuwzględnione wcześniej.)

## Tworzenie nowej karty — `createEmptyCard()`
```typescript
import { createEmptyCard } from 'ts-fsrs'
const card = createEmptyCard() // due = now, state = New, stability/difficulty/reps/lapses = 0
```
Wspiera opcjonalny `now` (Date/ISO/ms) i `afterHandler` do rzutowania na własny typ (przydatne np. do zmapowania na encję `flashcards` z dodatkowymi polami typu `id`).

## Scheduler — `fsrs()`, `repeat()`, `next()`
```typescript
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'

const scheduler = fsrs()
const card = createEmptyCard()

// podgląd wszystkich 4 wariantów oceny bez mutacji karty (np. do wyświetlenia dev/debug)
const preview = scheduler.repeat(card, new Date())
preview[Rating.Good].card // stan karty po ocenie "Good"

// zastosowanie wybranej przez użytkownika oceny
const result = scheduler.next(card, new Date(), Rating.Good)
result.card // zaktualizowana karta (due, stability, difficulty, reps, lapses...)
result.log  // wpis do historii powtórek (ReviewLog)
```
- `Rating` enum: `Again` (1), `Hard` (2), `Good` (3), `Easy` (4) — odpowiada 4 przyciskom oceny w UI sesji nauki.
- `next()` rzuca `FSRSValidationError` przy nieprawidłowej ocenie/karcie/dacie — do obsłużenia w API route.
- `repeat()` jest opcjonalny dla S-04 (przydatny tylko jeśli UI ma pokazywać przewidywane interwały przed kliknięciem oceny).

## Zgodność z Cloudflare Workers (edge runtime)
- Pakiet `ts-fsrs` (core scheduling) to czysty TypeScript/JS — **bez zależności Node-specific**, nadaje się do Workers/edge.
- Osobny pakiet `@open-spaced-repetition/binding` (WASM-owy optymalizator parametrów FSRS, do trenowania własnych wag na podstawie historii recenzji) **nie jest wspierany na edge runtime** w domyślnej ścieżce WASI — wymaga jawnego bundlowania WASM/worker albo działania w przeglądarce z nagłówkami cross-origin-isolation.
- **Wniosek dla S-04:** używać wyłącznie pakietu `ts-fsrs` (scheduler), nie `binding` — potwierdza to wcześniejsze założenie z `research.md`, że sam kod `ts-fsrs` nie korzysta z API Node i powinien działać w Workers.
