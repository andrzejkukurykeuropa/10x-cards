import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3, LanguageModelV3GenerateResult } from "@ai-sdk/provider";

/**
 * Reusable seam for the AI generation tests (Faza 2 wdrożenia, §3 Ryzyko #2/#5).
 *
 * The mock boundary is the **provider** (`@ai-sdk/groq`), never `ai` itself: each
 * test file does
 *
 * ```ts
 * const groqRef = vi.hoisted(() => ({ model: undefined as LanguageModelV3 | undefined }));
 * vi.mock("@ai-sdk/groq", () => ({ createGroq: () => () => groqRef.model }));
 * ```
 *
 * and swaps `groqRef.model = buildMockModel({...})` per test. Because only the
 * provider is replaced, the real `generateObject` from `ai` still runs and does
 * the real zod validation of the model output — so a bad shape produces a real
 * `NoObjectGeneratedError`, which is exactly the boundary Ryzyko #2 needs
 * exercised (see test-plan §2/§4 anti-pattern: "over-mocking `ai` internals").
 */

type BuildMockModelOptions =
  /** Model returns this JSON text as its single text part (real validation then runs). */
  | { text: string; error?: never; hang?: never }
  /** `doGenerate` rejects with this error (APICallError, AbortError, …). */
  | { error: unknown; text?: never; hang?: never }
  /** `doGenerate` never settles — used to document the missing server-side timeout. */
  | { hang: true; text?: never; error?: never };

/** V3 usage block in the exact nested shape `@ai-sdk/groq` emits (see convert-groq-usage). */
const MOCK_USAGE: LanguageModelV3GenerateResult["usage"] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
  raw: undefined,
};

function textResult(text: string): LanguageModelV3GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: MOCK_USAGE,
    warnings: [],
  };
}

/**
 * Builds a `MockLanguageModelV3` in one of three modes: success with a given JSON
 * text, `doGenerate` throwing a given error, or `doGenerate` hanging forever.
 * Call counts are observable via the returned model's `doGenerateCalls`.
 */
export function buildMockModel(opts: BuildMockModelOptions): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    provider: "mock-groq",
    modelId: "openai/gpt-oss-120b",
    doGenerate: async () => {
      if ("hang" in opts && opts.hang) {
        return new Promise<never>(() => {
          /* never settles — no server-side timeout barrier exists */
        });
      }
      if ("error" in opts && opts.error !== undefined) {
        // Replays whatever the provider boundary threw — the value is opaque by design
        // (APICallError, a bare AbortError-shaped Error, etc.), so `unknown` is correct here.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw opts.error;
      }
      return textResult((opts as { text: string }).text);
    },
  });
}

/** Serializes `count` well-formed flashcard pairs as the model's text output. */
export function flashcardsJson(count: number): string {
  const flashcards = Array.from({ length: count }, (_, i) => ({
    question: `Question ${i + 1}`,
    answer: `Answer ${i + 1}`,
  }));
  return JSON.stringify({ flashcards });
}

/**
 * Thin wrapper over the `APICallError` constructor so tests don't repeat the
 * boilerplate. `isRetryable: true` drives the real `ai` retry loop (maxRetries=2)
 * to a `RetryError`; `isRetryable: false` propagates straight out.
 */
export function makeApiCallError(opts: { statusCode: number; isRetryable: boolean; message?: string }): APICallError {
  return new APICallError({
    message: opts.message ?? `Groq API error ${opts.statusCode}`,
    url: "https://api.groq.com/openai/v1/chat/completions",
    requestBodyValues: {},
    statusCode: opts.statusCode,
    isRetryable: opts.isRetryable,
  });
}

/** An error shaped like a fetch/stream abort — `ai` lets `name: "AbortError"` pass through untouched. */
export function makeAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

export type { LanguageModelV3 };
