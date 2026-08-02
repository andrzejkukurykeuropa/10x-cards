export enum FsrsState {
  New = "New",
  Learning = "Learning",
  Review = "Review",
  Relearning = "Relearning",
}

export interface Flashcard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  repetitions: number;
  stability: number;
  difficulty: number;
  state: FsrsState;
  lapses: number;
  last_review: string | null;
  scheduled_days: number;
}

export type FlashcardDto = Omit<Flashcard, "user_id">;

export interface FlashcardProposal {
  question: string;
  answer: string;
}

export interface GenerateFlashcardsRequest {
  text: string;
}

export interface UpdateFlashcardRequest {
  question?: string;
  answer?: string;
}
