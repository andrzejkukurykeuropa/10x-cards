export interface Flashcard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export type FlashcardDto = Omit<Flashcard, "user_id">;
