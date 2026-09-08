import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { buildMockModel, flashcardsJson, makeApiCallError, makeAbortError } from "../helpers/ai-mock";
import { buildApiContext } from "../helpers/api-context";
import { POST as generateFlashcards } from "@/pages/api/generate-flashcards";

/**
 * Provider seam: replace `@ai-sdk/groq` only, so the real `generateObject` from
 * `ai` (and its real zod validation of the model output) still runs. `groqRef.model`
 * is swapped per test. See `tests/helpers/ai-mock.ts` for the rationale.
 *
 * SCOPE (test-plan §3 Faza 2, Ryzyko #2): this file locks the CURRENT buffered
 * request/response contract of `POST /api/generate-flashcards`. The failure-mode
 * cases (2.2–2.4) assert that every distinguishable AI SDK failure collapses to
 * one non-informative `500 {"error":"AI generation failed"}`. That collapse is a
 * KNOWN RISK we are DOCUMENTING, not a contract we endorse — a future change that
 * splits the catch-all (502/504/422 with a distinguishable cause) SHOULD break
 * these tests and force a deliberate update. This file changes no production code.
 */
const groqRef = vi.hoisted(() => ({ model: undefined as LanguageModelV3 | undefined }));
vi.mock("@ai-sdk/groq", () => ({
  createGroq: () => () => groqRef.model,
}));

const FAKE_USER = { id: "00000000-0000-0000-0000-000000000000" } as User;
const INPUT_TEXT = "The quick brown fox jumps over the lazy dog near the river bank at dawn.";

function postGenerate(body: string) {
  return buildApiContext({
    method: "POST",
    url: "http://localhost/api/generate-flashcards",
    headers: { "Content-Type": "application/json" },
    body,
    locals: { user: FAKE_USER },
  });
}

const withText = (text: string) => postGenerate(JSON.stringify({ text }));

/** The mock model of the last `buildMockModel(...)` assignment — for call-count assertions. */
function currentModel() {
  return groqRef.model as unknown as { doGenerateCalls: unknown[] };
}

describe("POST /api/generate-flashcards — buffered request/response contract (Risk #2)", () => {
  beforeEach(() => {
    groqRef.model = undefined;
  });

  // 2.1 — Positive control. Without this, the failure-mode tests below would only
  // prove "something returns 500". This asserts the SHAPE of a success, not just status.
  describe("2.1 positive control — well-formed proposals", () => {
    it.each([3, 10])("model returns %i valid pairs → 200 with exact { flashcards: [...] } shape", async (count) => {
      groqRef.model = buildMockModel({ text: flashcardsJson(count) });

      const response = await generateFlashcards(withText(INPUT_TEXT));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = (await response.json()) as { flashcards: { question: string; answer: string }[] };
      expect(Object.keys(body)).toEqual(["flashcards"]);
      expect(body.flashcards).toHaveLength(count);
      for (const card of body.flashcards) {
        expect(typeof card.question).toBe("string");
        expect(card.question.length).toBeGreaterThan(0);
        expect(typeof card.answer).toBe("string");
        expect(card.answer.length).toBeGreaterThan(0);
      }
    });
  });

  // 2.2 — DELIBERATE REGRESSION. A structurally invalid model output makes the real
  // `generateObject` throw NoObjectGeneratedError (cause: TypeValidationError or
  // JSONParseError). The endpoint collapses it to a generic 500 — indistinguishable
  // from a provider outage (2.3). We document this collapse; we do not require it.
  describe("2.2 schema-mismatch collapse (deliberate regression)", () => {
    it.each([
      [
        "too few cards (< .min(3))",
        JSON.stringify({
          flashcards: [
            { question: "q1", answer: "a1" },
            { question: "q2", answer: "a2" },
          ],
        }),
      ],
      [
        "empty answer (< .min(1))",
        JSON.stringify({
          flashcards: [
            { question: "q1", answer: "" },
            { question: "q2", answer: "a2" },
            { question: "q3", answer: "a3" },
          ],
        }),
      ],
      ["non-JSON text (JSONParseError path)", "Sorry, I could not generate flashcards for this text."],
    ])("%s → generic 500, body === { error: 'AI generation failed' }", async (_label, modelText) => {
      groqRef.model = buildMockModel({ text: modelText });

      const response = await generateFlashcards(withText(INPUT_TEXT));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "AI generation failed" });
    });
  });

  // 2.3 — DELIBERATE REGRESSION. Provider HTTP errors. The only observable difference
  // between a retryable and a non-retryable failure is the call count of the provider
  // boundary — the HTTP status the client sees is identical (500). We document the
  // collapse; a future 502-on-outage split SHOULD break this.
  describe("2.3 provider-failure collapse (deliberate regression)", () => {
    it("retryable APICallError (503) → real retry loop runs (3 calls), endpoint 500", async () => {
      groqRef.model = buildMockModel({ error: makeApiCallError({ statusCode: 503, isRetryable: true }) });

      const response = await generateFlashcards(withText(INPUT_TEXT));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "AI generation failed" });
      // Original attempt + maxRetries(2) — proves the real `ai` retry loop executed.
      expect(currentModel().doGenerateCalls).toHaveLength(3);
    });

    it("non-retryable APICallError (401) → propagates immediately (1 call), endpoint 500", async () => {
      groqRef.model = buildMockModel({ error: makeApiCallError({ statusCode: 401, isRetryable: false }) });

      const response = await generateFlashcards(withText(INPUT_TEXT));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "AI generation failed" });
      expect(currentModel().doGenerateCalls).toHaveLength(1);
    });
  });

  // 2.4 — DELIBERATE REGRESSION. An abort-shaped error (name === "AbortError") passes
  // through `ai` untouched and is NOT retried. Today it collapses to a generic 500.
  // This is precisely the mode a future `abortSignal`/timeout change will trigger —
  // the test pins "today, abort === generic 500" so that change updates it knowingly.
  describe("2.4 abort collapse (deliberate regression)", () => {
    it("AbortError from doGenerate → not retried (1 call), endpoint 500", async () => {
      groqRef.model = buildMockModel({ error: makeAbortError() });

      const response = await generateFlashcards(withText(INPUT_TEXT));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "AI generation failed" });
      expect(currentModel().doGenerateCalls).toHaveLength(1);
    });
  });

  // 2.5 — Barrier. Input validation must run BEFORE the AI block even with the provider
  // mocked, otherwise the seam could mask a regression that wastes an AI call on bad
  // input (also relevant to Risk #5 cost).
  describe("2.5 input validation still enforced before the AI block", () => {
    it.each([
      ["text just under .min(40) (39 chars)", { text: "a".repeat(39) }],
      ["text just over .max(1000) (1001 chars)", { text: "a".repeat(1001) }],
    ])("%s → 422 Invalid input, doGenerate not called", async (_label, payload) => {
      groqRef.model = buildMockModel({ text: flashcardsJson(3) });

      const response = await generateFlashcards(postGenerate(JSON.stringify(payload)));

      expect(response.status).toBe(422);
      expect((await response.json()) as { error: string }).toMatchObject({ error: "Invalid input" });
      expect(currentModel().doGenerateCalls).toHaveLength(0);
    });

    it("malformed JSON body → 422 Invalid JSON body, doGenerate not called", async () => {
      groqRef.model = buildMockModel({ text: flashcardsJson(3) });

      const response = await generateFlashcards(postGenerate("{ not json"));

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "Invalid JSON body" });
      expect(currentModel().doGenerateCalls).toHaveLength(0);
    });
  });

  // 3.1 — DELIBERATE REGRESSION. There is NO server-side timeout barrier: no
  // `abortSignal`, no `timeout` on `generateObject`, no Worker CPU/wall limit in
  // wrangler config. When the provider hangs, the endpoint handler hangs with it —
  // the "spinner forever" of test-plan §2 #2, from the server side. We are PINNING
  // the current absence of a time barrier: a future `abortSignal: AbortSignal.timeout(...)`
  // in the endpoint SHOULD break this test — that is the intended signal that the
  // fix landed. Fake timers so the test doesn't actually wait; "10 minutes" is a
  // proxy for "no application layer interrupts", not a formal proof of infinity.
  describe("3.1 no server-side timeout barrier (deliberate regression)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("hung provider → handler still pending after a simulated 10 minutes", async () => {
      groqRef.model = buildMockModel({ hang: true });

      const handlerPromise = Promise.resolve(generateFlashcards(withText(INPUT_TEXT)));
      // Swallow a late rejection so it never surfaces as unhandled after the test ends.
      handlerPromise.catch(() => undefined);

      await vi.advanceTimersByTimeAsync(600_000);

      const outcome = await Promise.race([handlerPromise.then(() => "settled"), Promise.resolve("still-pending")]);
      expect(outcome).toBe("still-pending");
    });
  });
});
