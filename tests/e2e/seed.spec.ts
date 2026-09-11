// seed: the reference spec for this suite. Every convention an e2e test here is expected to
//       follow is demonstrated once, in place, with the reason next to it — read this file (and
//       context/foundation/test-plan.md §6.3) before writing or generating another spec.
//       It is a real, runnable test, not a template: a convention nobody runs rots.
// risk: context/foundation/test-plan.md §2 Risk #7, positive half — the row demands that a
//       proposal either survives a reload *or* the user is warned. `proposal-durability-across-
//       reload.spec.ts` pins the unreviewed side (silently lost, deliberate regression). This one
//       pins the reviewed side: once accepted, the card is persisted and a reload must not lose
//       it. Together they bracket the risk; neither is a snapshot of whatever the app does today.
// layer: e2e, for the same reason as its sibling — reload destroys the JS execution context, and
//       no jsdom remount can prove anything about that (§6.3). Everything below the browser
//       (the POST contract, RLS) is already covered cheaper in tests/api/.
import { expect, test } from "@playwright/test";

// Long enough to clear the generator's MIN_LEN (40) gate, otherwise the button stays disabled.
const SOURCE_TEXT = "Astro renderuje strony po stronie serwera, a React obsluguje wyspy interaktywne w tym projekcie.";

/**
 * Path comparison, never `url.includes()`. `/api/generate-flashcards` *contains* the string
 * "/api/flashcards", so a substring match on the mocked generation call would resolve the wrong
 * response and the test would wait on — or assert against — something it never meant to.
 */
function isFlashcardsApi(url: string, method: string, wanted: string) {
  return new URL(url).pathname === "/api/flashcards" && method === wanted;
}

test.describe("Risk #7 (positive half) — a reviewed proposal is persisted and survives a reload", () => {
  // Rows this spec created, drained by the cleanup hook below. Collected as ids rather than
  // matched by text at cleanup time, so a failed assertion mid-test still leaves an exact handle.
  const createdFlashcardIds: string[] = [];

  /**
   * Cleanup runs in `afterEach`, not at the end of the test body: a test that fails at its third
   * assertion must still delete what its second assertion created, otherwise the next run starts
   * against a dirtier database than this one did and the suite slowly becomes non-repeatable.
   *
   * It deletes through the real `DELETE /api/flashcards/:id` (the endpoint is RLS-scoped to the
   * owner) using the `request` fixture, which carries the same `storageState` as the browser
   * context but does not depend on the page surviving the failure.
   */
  test.afterEach(async ({ request, baseURL }) => {
    // `splice(0)` empties the list as it reads it, so a retry cannot try to delete the same row
    // twice and fail cleanup on a 404 for a row it already removed.
    for (const id of createdFlashcardIds.splice(0)) {
      // Astro's `security.checkOrigin` is on for on-demand rendered routes and answers a
      // state-changing request without a matching Origin header with 403. A browser always sends
      // one; `request` does not. Supplying it keeps cleanup production-shaped instead of
      // weakening the app's CSRF protection to accommodate a test (same reasoning as auth.setup.ts).
      const response = await request.delete(`/api/flashcards/${id}`, { headers: { Origin: baseURL ?? "" } });
      expect(
        response.ok(),
        `cleanup failed to delete flashcard ${id} (HTTP ${response.status()}) — the next run inherits it`,
      ).toBeTruthy();
    }
  });

  test("an accepted proposal is still in the collection after a page reload", async ({ page }) => {
    // `astro dev` compiles the dashboard island on first request, and a cold run is slower than a
    // warm local server, so this flow needs more than the 30s project default.
    test.setTimeout(60_000);

    // Unique per run, so parallel workers and repeated runs never match each other's data — and
    // so a row left behind by an earlier failure can never make this run pass.
    const marker = `SEED-${Date.now()}`;
    const question = `Pytanie ${marker}`;
    const answer = `Odpowiedz ${marker}`;

    // Real vs mocked, drawn deliberately: auth, middleware, SSR, `/api/flashcards` and the
    // database stay real — that is where the risk lives. Only the LLM call is stubbed at the
    // network boundary, because it costs money, is non-deterministic, and this risk begins
    // *after* proposals reach the review stage. One proposal, not two: the test needs exactly
    // enough fixture to reach the state under test.
    await page.route("**/api/generate-flashcards", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ flashcards: [{ question, answer }] }),
      });
    });

    await page.goto("/dashboard");

    // Locators: `getByRole` first, always. The textbox is addressed by its accessible name and
    // the buttons by theirs — never a CSS class or DOM position, which change with every restyle
    // and would make this test fail for reasons that have nothing to do with the risk.
    const sourceInput = page.getByRole("textbox", { name: /Wklej artykuł/ });
    const generateButton = page.getByRole("button", { name: "Generuj fiszki" });

    // Wait on state, never on time. The generator is an Astro island: text typed before React
    // hydrates is kept in the DOM but lost to component state, and React's value tracker is then
    // seeded from that same DOM value — so refilling the identical text fires no change event and
    // the button would stay disabled forever. Clearing first guarantees a real change on each
    // attempt; the exit condition is the button becoming enabled, not any elapsed duration.
    // There is no `waitForTimeout` anywhere in this suite, and this is the case that tempts it.
    await expect(async () => {
      await sourceInput.fill("");
      await sourceInput.fill(SOURCE_TEXT);
      await expect(generateButton).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    await generateButton.click();

    // `exact: true`: `getByText` matches a case-insensitive *substring* by default, so a loose
    // matcher here would also hit the collection card rendered later with the same text.
    await expect(page.getByText(question, { exact: true })).toBeVisible();

    // The response promise is created *before* the click that triggers it — awaiting it after the
    // fact races the network and flakes. The accepted row's id comes from the response body,
    // which is what makes deterministic cleanup possible at all.
    const created = page.waitForResponse((response) =>
      isFlashcardsApi(response.url(), response.request().method(), "POST"),
    );

    // `exact: true` again, for a different reason: the accessible name "Zaakceptuj" is a substring
    // of "Zaakceptuj wszystkie", and a locator resolving to two buttons fails on strict mode.
    await page.getByRole("button", { name: "Zaakceptuj", exact: true }).click();

    const createdCard = (await (await created).json()) as { id: string };
    expect(createdCard.id, "POST /api/flashcards returned no id — cleanup would leak the row").toBeTruthy();
    createdFlashcardIds.push(createdCard.id);

    await expect(page.getByText("Zaakceptowano 1 fiszek")).toBeVisible();

    // The risk event: a real document reload, which tears down the whole execution context.
    //
    // The collection fetches `/api/flashcards` in a mount effect, so that response is proof the
    // island hydrated and its effects ran. Without this anchor the assertion below could resolve
    // against the SSR HTML — passing, or failing, for reasons unrelated to persistence.
    const collectionLoaded = page.waitForResponse((response) =>
      isFlashcardsApi(response.url(), response.request().method(), "GET"),
    );
    await page.reload();
    await collectionLoaded;

    // Positive control before the real assertion: prove the page came back healthy, so a blank
    // page or a 500 can never be mistaken for a verdict about the risk.
    await expect(page.getByRole("heading", { name: "Moja kolekcja" })).toBeVisible();

    // The assertion the risk is about. It turns red the day an accepted card stops being
    // persisted — which is exactly what Risk #7 describes, one step further down the review flow.
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    await expect(page.getByText(answer, { exact: true })).toBeVisible();
  });
});
