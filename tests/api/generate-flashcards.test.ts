import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { buildMockModel, flashcardsJson } from "../helpers/ai-mock";
import { buildApiContext } from "../helpers/api-context";
import { POST as generateFlashcards } from "@/pages/api/generate-flashcards";

/**
 * Provider seam: replace `@ai-sdk/groq` only, so the real `generateObject` from
 * `ai` (and its real zod validation of the model output) still runs. `groqRef.model`
 * is swapped per test. See `tests/helpers/ai-mock.ts` for the rationale.
 */
const groqRef = vi.hoisted(() => ({ model: undefined as LanguageModelV3 | undefined }));
vi.mock("@ai-sdk/groq", () => ({
  createGroq: () => () => groqRef.model,
}));

const FAKE_USER = { id: "00000000-0000-0000-0000-000000000000" } as User;
const INPUT_TEXT = "The quick brown fox jumps over the lazy dog near the river bank at dawn.";

function postGenerate(text: string) {
  return buildApiContext({
    method: "POST",
    url: "http://localhost/api/generate-flashcards",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    locals: { user: FAKE_USER },
  });
}

describe("POST /api/generate-flashcards — buffered request/response contract (Risk #2)", () => {
  beforeEach(() => {
    groqRef.model = undefined;
  });

  // Faza 1 smoke test: proves the `@ai-sdk/groq` seam + hoisted model + the real
  // `generateObject` actually produce a 200 with the expected shape. Grows into
  // the full 2.1 positive control in Faza 2.
  it("valid model output → 200 with { flashcards: [...] } shape", async () => {
    groqRef.model = buildMockModel({ text: flashcardsJson(4) });

    const response = await generateFlashcards(postGenerate(INPUT_TEXT));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = (await response.json()) as { flashcards: { question: string; answer: string }[] };
    expect(Array.isArray(body.flashcards)).toBe(true);
    expect(body.flashcards).toHaveLength(4);
    for (const card of body.flashcards) {
      expect(typeof card.question).toBe("string");
      expect(card.question.length).toBeGreaterThan(0);
      expect(typeof card.answer).toBe("string");
      expect(card.answer.length).toBeGreaterThan(0);
    }
    expect(Object.keys(body)).toEqual(["flashcards"]);
  });
});
