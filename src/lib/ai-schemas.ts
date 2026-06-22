import { z } from "zod";

export const flashcardsOutputSchema = z.object({
  flashcards: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
      }),
    )
    .min(3)
    .max(10),
});

export type FlashcardsOutput = z.infer<typeof flashcardsOutputSchema>;
