import { fsrs, generatorParameters, Rating, State, type CardInput, type Grade } from "ts-fsrs";
import type { Flashcard, StudyRating } from "@/types";

/**
 * enable_short_term: false — wyłącza logikę krótkoterminowych kroków nauki w minutach (`learning_steps`),
 * które nie mają odpowiednika w schemacie DB. Karty w stanie Learning/Relearning są planowane w dniach.
 */
export const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

const RATING_TO_GRADE: Record<StudyRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

type FsrsRow = Pick<
  Flashcard,
  "due_date" | "stability" | "difficulty" | "scheduled_days" | "repetitions" | "lapses" | "state" | "last_review"
>;

/**
 * Mapuje wiersz `flashcards` na `CardInput` wymagany przez scheduler `ts-fsrs`.
 * `due_date IS NULL` (nowo utworzona fiszka) jest traktowane jak "do powtórki teraz".
 * `learning_steps`/`elapsed_days` są zawsze ustawiane na 0 — nieużywane przy `enable_short_term: false`
 * i nieprzechowywane w schemacie DB.
 */
export function flashcardToCardInput(row: FsrsRow, now: Date): CardInput {
  return {
    due: row.due_date ?? now,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0,
    scheduled_days: row.scheduled_days,
    learning_steps: 0,
    reps: row.repetitions,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ?? undefined,
  };
}

/**
 * Przelicza ocenę użytkownika przez scheduler FSRS i zwraca pola gotowe do zapisu w tabeli `flashcards`.
 */
export function scheduleReview(row: FsrsRow, rating: StudyRating, now: Date): FsrsRow {
  const result = scheduler.next(flashcardToCardInput(row, now), now, RATING_TO_GRADE[rating]);
  const card = result.card;
  return {
    due_date: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    repetitions: card.reps,
    lapses: card.lapses,
    state: State[card.state] as Flashcard["state"],
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}
