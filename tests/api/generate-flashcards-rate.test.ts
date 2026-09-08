import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { buildMockModel, flashcardsJson } from "../helpers/ai-mock";
import { buildApiContext } from "../helpers/api-context";
import { POST as generateFlashcards } from "@/pages/api/generate-flashcards";

// ŚWIADOMA MIGAWKA MVP — NIE jest to pożądany kontrakt.
// Badanie (research.md §F) potwierdziło: zero rate-limitu / kwoty / licznika /
// dedupe w całej aplikacji. Jedno konto może wołać generateObject w pętli bez
// sufitu kosztu.
// PRD Open Question "Kontrola kosztów generowania" (prd.md:110-112) — priorytet
// WYSOKI przed wdrożeniem produkcyjnym, nie-blokujący dla developmentu.
// Ten test utrwala LUKĘ, by wprowadzenie limitera było świadomą, wykrytą zmianą
// (limiter złamie ten test → wymusi jego aktualizację). Budowa limitera jest
// POZA zakresem tej fazy (osobna zmiana).

const groqRef = vi.hoisted(() => ({ model: undefined as LanguageModelV3 | undefined }));
vi.mock("@ai-sdk/groq", () => ({
  createGroq: () => () => groqRef.model,
}));

const FAKE_USER = { id: "00000000-0000-0000-0000-000000000000" } as User;
const INPUT_TEXT = "The quick brown fox jumps over the lazy dog near the river bank at dawn.";

function postGenerate() {
  return buildApiContext({
    method: "POST",
    url: "http://localhost/api/generate-flashcards",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: INPUT_TEXT }),
    locals: { user: FAKE_USER },
  });
}

/** No response on the `/api/generate-flashcards` path carries any throttle signal today. */
function expectNoRateLimitSignal(response: Response) {
  expect(response.status).not.toBe(429);
  expect(response.headers.get("Retry-After")).toBeNull();
  expect(response.headers.get("RateLimit-Limit")).toBeNull();
  expect(response.headers.get("RateLimit-Remaining")).toBeNull();
  expect(response.headers.get("X-RateLimit-Limit")).toBeNull();
}

describe("POST /api/generate-flashcards — unbounded generation contract (Risk #5, MVP snapshot)", () => {
  beforeEach(() => {
    groqRef.model = buildMockModel({ text: flashcardsJson(5) });
  });

  it("5 sequential requests from ONE identity → all 200, never 429 / throttle / cooldown", async () => {
    for (let i = 0; i < 5; i++) {
      // Fresh context per iteration — `Request` bodies are single-use.
      const response = await generateFlashcards(postGenerate());
      expect(response.status).toBe(200);
      expectNoRateLimitSignal(response);
    }
  });

  it("3 concurrent requests from ONE identity → all 200 (no dedupe, no concurrent serialization)", async () => {
    const responses = await Promise.all([
      generateFlashcards(postGenerate()),
      generateFlashcards(postGenerate()),
      generateFlashcards(postGenerate()),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expectNoRateLimitSignal(response);
    }
  });
});
