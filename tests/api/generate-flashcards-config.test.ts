import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { buildApiContext } from "../helpers/api-context";

/**
 * SEPARATE FILE on purpose: `vi.mock("astro:env/server")` must be in effect when
 * the endpoint module is evaluated. Every other test file imports the endpoint
 * with the real (dummy) `GROQ_API_KEY` from `.env.test`; here we need it absent.
 * `generate-flashcards.ts` imports ONLY `GROQ_API_KEY` from this module, so a
 * narrow mock is safe. `@ai-sdk/groq` is NOT mocked here — the request never
 * reaches the AI block.
 */
vi.mock("astro:env/server", () => ({ GROQ_API_KEY: undefined }));

const { POST: generateFlashcards } = await import("@/pages/api/generate-flashcards");

const FAKE_USER = { id: "00000000-0000-0000-0000-000000000000" } as User;
const VALID_TEXT = "The quick brown fox jumps over the lazy dog near the river bank at dawn.";

function postGenerate() {
  return buildApiContext({
    method: "POST",
    url: "http://localhost/api/generate-flashcards",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: VALID_TEXT }),
    locals: { user: FAKE_USER },
  });
}

/**
 * 3.2 — The config gate is the ONLY failure mode whose body differs from the
 * generic "AI generation failed". Two 500s the client sees:
 *   - { error: "AI service not configured" }  ← this test (GROQ_API_KEY unset)
 *   - { error: "AI generation failed" }        ← every collapsed AI failure (Faza 2)
 * Same HTTP status (500); the ONLY thing that distinguishes them is the response
 * body. A future status change (e.g. 503) or message change, or moving the check
 * after the AI block, SHOULD break this test.
 *
 * `GROQ_API_KEY: ""` (empty string) takes the same `!GROQ_API_KEY` branch, so the
 * `undefined` variant covers both.
 */
describe("POST /api/generate-flashcards — config gate with a distinguishable cause (Risk #2)", () => {
  it("GROQ_API_KEY undefined → 500 { error: 'AI service not configured' }, AI block never reached", async () => {
    const response = await generateFlashcards(postGenerate());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "AI service not configured" });
  });
});
