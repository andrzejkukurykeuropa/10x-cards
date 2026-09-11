// risk: context/foundation/test-plan.md §2 Risk #7 — unreviewed flashcard proposals are lost on
//       page reload, silently, with no warning and no way to get them back except paying for
//       another generation.
// layer: e2e is the only layer that can answer this. §6.3 records why: jsdom can unmount and
//       remount a component, but it never destroys the JS execution context, so a remount test
//       would report "state survived" for a page that in reality loses everything. remount ≠ reload.
import { expect, test } from "@playwright/test";

// Long enough to clear the generator's MIN_LEN (40) gate, otherwise the button stays disabled.
const SOURCE_TEXT = "Astro renderuje strony po stronie serwera, a React obsluguje wyspy interaktywne w tym projekcie.";

test.describe("Risk #7 — unreviewed proposal durability across a real page reload", () => {
  /**
   * DELIBERATE REGRESSION (§6.4 pt 7 convention: we *document* today's behaviour as a known risk,
   * we do not *require* it). Proposal state lives only in React `useState` inside
   * `FlashcardGenerator`, so a document reload drops every unreviewed proposal and the user is
   * never warned. This test asserts that loss, together with the absence of any warning, and is
   * built to turn RED the moment either half of the protection lands:
   *   - proposals persisted (sessionStorage / server draft / anything) → they are still visible
   *     after the reload → the "gone" assertions fail;
   *   - a `beforeunload` guard added → a dialog is recorded → the "no warning" assertion fails.
   *
   * Cleanup: none needed by design. The test stops at the review stage and never accepts a
   * proposal, so it writes no row to `flashcards`; the route mock lives and dies with this page's
   * browser context. Nothing is shared with a parallel worker.
   */
  test("unreviewed proposals are dropped by a page reload, with no warning (deliberate regression)", async ({
    page,
  }) => {
    // `astro dev` compiles the dashboard island on first request, and the CI runtime is slower
    // than a warm local server, so this one flow needs more than the 30s project default.
    test.setTimeout(60_000);

    // A unique marker per run keeps parallel workers and re-runs from matching each other's text.
    // The two questions must not be substrings of one another — getByText matches case-insensitive
    // substrings, so "Pytanie X" would also resolve inside "Drugie pytanie X".
    const marker = `E2E-${Date.now()}`;
    const firstQuestion = `Pierwsze pytanie ${marker}`;
    const secondQuestion = `Drugie pytanie ${marker}`;

    // Real vs mocked: auth, middleware, routing, SSR and the flashcards API all stay real — that
    // is where the integration risk lives. Only the LLM call behind /api/generate-flashcards is
    // stubbed at the network boundary: it costs money, is non-deterministic, and Risk #7 starts
    // *after* proposals reach the review stage. Exercising the generation happy path here is the
    // anti-pattern §2 names for this very risk.
    await page.route("**/api/generate-flashcards", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          flashcards: [
            { question: firstQuestion, answer: `Pierwsza odpowiedz ${marker}` },
            { question: secondQuestion, answer: `Druga odpowiedz ${marker}` },
          ],
        }),
      });
    });

    // Registering a listener disables Playwright's automatic dialog handling, so every dialog is
    // recorded here and then accepted — accepting a `beforeunload` means "leave the page", which
    // keeps the reload going so the rest of the test still runs.
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      void dialog.accept();
    });

    // Step 1 — reach the review stage with proposals that are generated but not yet reviewed.
    await page.goto("/dashboard");

    const sourceInput = page.getByRole("textbox", { name: /Wklej artykuł/ });
    const generateButton = page.getByRole("button", { name: "Generuj fiszki" });

    // The generator is an Astro island, so the textarea accepts text before React has hydrated.
    // When it then mounts with empty state, React's value tracker is seeded from the DOM value
    // already there — refilling the same text afterwards produces no change event and the button
    // would stay disabled forever. Clearing first guarantees a real change on every attempt, and
    // the retry waits on application state (the button going enabled), never on a duration.
    await expect(async () => {
      await sourceInput.fill("");
      await sourceInput.fill(SOURCE_TEXT);
      await expect(generateButton).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    await generateButton.click();

    // Step 2 — this is the state the user paid for and has not reviewed yet.
    await expect(page.getByText(firstQuestion, { exact: true })).toBeVisible();
    await expect(page.getByText(secondQuestion, { exact: true })).toBeVisible();
    await expect(page.getByText("2 z 2 propozycji do obsłużenia")).toBeVisible();

    // Step 3 — a real document reload. Unlike a jsdom remount this tears down the whole execution
    // context, which is exactly the event Risk #7 is about.
    //
    // The dashboard island fetches the collection from /api/flashcards in a mount effect, so that
    // response is proof the island has hydrated and every mount effect has already run. Without
    // waiting for it, the assertions below would run against the server-rendered HTML — where the
    // proposals are trivially absent — and would stay green even for an app that restores them a
    // moment later. (A future fix that rehydrates drafts from a *later* server response would need
    // this anchor extended to that response.)
    const collectionLoaded = page.waitForResponse(
      (response) => response.url().includes("/api/flashcards") && response.request().method() === "GET",
    );
    await page.reload();
    await collectionLoaded;

    // Positive control: the dashboard came back healthy. Without this, every "is gone" assertion
    // below would also pass on a blank page or a 500, and the test would protect nothing.
    await expect(page.getByRole("heading", { name: "Generuj fiszki" })).toBeVisible();
    await expect(sourceInput).toBeVisible();

    // Step 4 — the risk itself. Nothing warned the user…
    expect(dialogs, "a beforeunload warning is now shown — Risk #7 is (partly) protected").toEqual([]);

    // …and the unreviewed proposals are gone, along with the source text that produced them.
    await expect(page.getByText(marker)).toHaveCount(0);
    await expect(page.getByText("propozycji do obsłużenia")).toHaveCount(0);
    await expect(sourceInput).toHaveValue("");
  });
});
