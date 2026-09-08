// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FlashcardGenerator from "@/components/FlashcardGenerator";

/**
 * COMPONENT LAYER of Ryzyko #2 (test-plan §3 Faza 2). `FlashcardGenerator.tsx`
 * blindly casts `res.json()` to `FlashcardsOutput` and immediately `.map(...)`
 * with no runtime shape validation (`:239-240`). These tests PIN the current
 * degradation behaviour for malformed / degenerate 200 payloads and for a hung
 * `fetch`. The failure-mode cases are DELIBERATE REGRESSIONS: adding runtime
 * validation or a client-side `AbortController` (both desirable fixes) SHOULD
 * break them and force a knowing update. This file changes no production code.
 *
 * Global `environment` in vitest.config.ts is `node`; this file opts into jsdom
 * via the docblock above. `crypto.randomUUID` (used by `makeProposal`) is
 * provided by the jsdom environment.
 */

const VALID_TEXT = "The quick brown fox jumps over the lazy dog near the river bank at dawn while everyone watched.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function renderAndSubmit(text = VALID_TEXT) {
  render(<FlashcardGenerator onComplete={vi.fn()} />);
  const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>(/min\. 40 znaków/i);
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Generuj fiszki" }));
  return { textarea };
}

/** Normalises whitespace across the JSX-split "{n} z {m} propozycji do obsłużenia" counter. */
function counterText(): string {
  return screen
    .getByText(/propozycji do obsłużenia/)
    .textContent.replace(/\s+/g, " ")
    .trim();
}

describe("FlashcardGenerator — review UI resilience to malformed payload (Risk #2)", () => {
  // 5.1 — Positive control. Without it, 5.2–5.4 would only prove "something failed to render".
  describe("5.1 positive control — well-formed 200 payload renders proposals", () => {
    it("200 { flashcards: [3 pairs] } → reviewing state with 3 proposal cards", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          flashcards: [
            { question: "Bonjour", answer: "Dzień dobry" },
            { question: "Merci", answer: "Dziękuję" },
            { question: "Au revoir", answer: "Do widzenia" },
          ],
        }),
      );

      renderAndSubmit();

      expect(await screen.findByText("Bonjour")).toBeTruthy();
      expect(screen.getByText("Dzień dobry")).toBeTruthy();
      expect(screen.getByText("Au revoir")).toBeTruthy();
      expect(counterText()).toBe("3 z 3 propozycji do obsłużenia");
      expect(screen.getAllByRole("button", { name: "Zaakceptuj" })).toHaveLength(3);
      expect(screen.getAllByRole("button", { name: "Edytuj" })).toHaveLength(3);
      expect(screen.getAllByRole("button", { name: "Odrzuć" })).toHaveLength(3);
    });
  });

  // 5.2 — DELIBERATE REGRESSION. A 200 payload missing the `flashcards` key (or with
  // a non-array value) makes the blind `data.flashcards.map` throw a TypeError, caught
  // into the error panel with the RAW error text — ugly but recoverable, not a hang.
  // We document this; runtime shape validation is a separate fix (which SHOULD break this).
  describe("5.2 missing `flashcards` key — degrades to error panel, not a hang (deliberate regression)", () => {
    it.each([
      ["empty object {}", {}],
      ["flashcards is not an array", { flashcards: "not-an-array" }],
    ])("200 with %s → error state, raw TypeError shown, recovery returns to idle", async (_label, body) => {
      fetchMock.mockResolvedValue(jsonResponse(body));

      const { textarea } = renderAndSubmit();

      const retry = await screen.findByRole("button", { name: "Spróbuj ponownie" });
      // Raw TypeError text (mentions `.map`) reaches the panel — the documented ugly state.
      expect(screen.getByText(/map/i)).toBeTruthy();

      fireEvent.click(retry);

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
      });
      expect(textarea.disabled).toBe(false);
    });
  });

  // 5.3 — DELIBERATE REGRESSION. `{ flashcards: [] }` → proposals = [], state `reviewing`
  // with "0 z 0", textarea + "Zaakceptuj wszystkie" disabled, and NO exit/reset control:
  // a soft hang with no way forward short of a page reload. NOTE: the server schema
  // `.min(3)` makes this payload unreachable through the real endpoint today — the client
  // has no barrier of its own, so if server validation ever weakened this UI would hang.
  describe("5.3 empty `flashcards: []` — soft hang (deliberate regression)", () => {
    it("200 { flashcards: [] } → reviewing '0 z 0', controls disabled, no way forward", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ flashcards: [] }));

      const { textarea } = renderAndSubmit();

      const acceptAll = await screen.findByRole<HTMLButtonElement>("button", { name: "Zaakceptuj wszystkie" });
      expect(acceptAll.disabled).toBe(true);
      expect(textarea.disabled).toBe(true);
      expect(counterText()).toBe("0 z 0 propozycji do obsłużenia");
      expect(screen.queryByRole("button", { name: "Zaakceptuj" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Wygeneruj kolejne|Spróbuj ponownie/ })).toBeNull();
    });
  });

  // 5.4 — DELIBERATE REGRESSION. `fetch` never resolves → component stuck in `loading`:
  // spinner, "Generowanie…" button + textarea disabled, and NO `AbortController` / cancel
  // button. Client-side mirror of the server-side 3.1. Adding a cancel + client timeout
  // (desirable fix) SHOULD break this.
  describe("5.4 fetch never resolves — spinner forever, no cancel (deliberate regression)", () => {
    it("hung fetch → stuck in loading, no cancel affordance, state never advances", async () => {
      fetchMock.mockImplementation(() => new Promise(() => undefined));

      const { textarea } = renderAndSubmit();

      expect(await screen.findByText("AI generuje fiszki…")).toBeTruthy();

      // Flush any pending microtasks — the state must not advance.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.getByText("AI generuje fiszki…")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
      expect(screen.queryByText(/propozycji do obsłużenia/)).toBeNull();
      expect(screen.queryByRole("button", { name: /Anuluj/i })).toBeNull();
      expect(textarea.disabled).toBe(true);
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "Generowanie…" }).disabled).toBe(true);
    });
  });
});
