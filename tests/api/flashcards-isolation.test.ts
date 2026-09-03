import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { GET as flashcardsGet, POST as flashcardsPost } from "@/pages/api/flashcards";
import { PATCH as flashcardPatch, DELETE as flashcardDelete } from "@/pages/api/flashcards/[id]";
import { buildApiContext, createCookieJar } from "../helpers/api-context";
import { signInAsTestUser, cleanupFlashcards } from "../helpers/test-session";
import { TEST_USER_A, TEST_USER_B } from "../helpers/test-users";

/**
 * User A creates a flashcard; user B (a fully independent session) tries to list, edit,
 * and delete it. A non-owner request must be indistinguishable from "resource does not
 * exist" (404, never 200 with someone else's data, never 500). A positive control on A's
 * own flashcard proves the mechanism actually discriminates owner vs. non-owner, rather
 * than "B sees nothing" being a coincidence.
 */
describe("Flashcards isolation between users (Risk #3)", () => {
  let sessionA: { cookieHeader: string; user: User };
  let sessionB: { cookieHeader: string; user: User };
  const createdIds: string[] = [];

  beforeAll(async () => {
    sessionA = await signInAsTestUser(TEST_USER_A);
    sessionB = await signInAsTestUser(TEST_USER_B);
  });

  afterEach(async () => {
    await cleanupFlashcards(createdIds.splice(0));
  });

  async function createFlashcardAsA(): Promise<string> {
    const context = buildApiContext({
      method: "POST",
      url: "http://localhost/api/flashcards",
      headers: { "Content-Type": "application/json", Cookie: sessionA.cookieHeader },
      body: JSON.stringify({ question: "Isolation question A", answer: "Isolation answer A" }),
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const response = await flashcardsPost(context);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string };
    createdIds.push(body.id);
    return body.id;
  }

  it("B's flashcard list does not include A's flashcard", async () => {
    const flashcardId = await createFlashcardAsA();

    const context = buildApiContext({
      method: "GET",
      url: "http://localhost/api/flashcards",
      headers: { Cookie: sessionB.cookieHeader },
      cookies: createCookieJar(),
      locals: { user: sessionB.user },
    });
    const response = await flashcardsGet(context);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string }[];
    expect(body.some((f) => f.id === flashcardId)).toBe(false);
  });

  it("B cannot PATCH A's flashcard (404, not 200 with someone else's data)", async () => {
    const flashcardId = await createFlashcardAsA();

    const context = buildApiContext({
      method: "PATCH",
      url: `http://localhost/api/flashcards/${flashcardId}`,
      headers: { "Content-Type": "application/json", Cookie: sessionB.cookieHeader },
      body: JSON.stringify({ question: "Hijacked by B" }),
      params: { id: flashcardId },
      cookies: createCookieJar(),
      locals: { user: sessionB.user },
    });
    const response = await flashcardPatch(context);

    expect(response.status).toBe(404);
  });

  it("B cannot DELETE A's flashcard, and it still exists afterward", async () => {
    const flashcardId = await createFlashcardAsA();

    const deleteContext = buildApiContext({
      method: "DELETE",
      url: `http://localhost/api/flashcards/${flashcardId}`,
      headers: { Cookie: sessionB.cookieHeader },
      params: { id: flashcardId },
      cookies: createCookieJar(),
      locals: { user: sessionB.user },
    });
    const deleteResponse = await flashcardDelete(deleteContext);
    expect(deleteResponse.status).toBe(404);

    // Verify as A that the flashcard survived B's delete attempt.
    const getContext = buildApiContext({
      method: "GET",
      url: "http://localhost/api/flashcards",
      headers: { Cookie: sessionA.cookieHeader },
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const getResponse = await flashcardsGet(getContext);
    const body = (await getResponse.json()) as { id: string }[];
    expect(body.some((f) => f.id === flashcardId)).toBe(true);
  });

  it("positive control: A can PATCH and DELETE their own flashcard", async () => {
    const flashcardId = await createFlashcardAsA();

    const patchContext = buildApiContext({
      method: "PATCH",
      url: `http://localhost/api/flashcards/${flashcardId}`,
      headers: { "Content-Type": "application/json", Cookie: sessionA.cookieHeader },
      body: JSON.stringify({ question: "Updated by owner A" }),
      params: { id: flashcardId },
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const patchResponse = await flashcardPatch(patchContext);
    expect(patchResponse.status).toBe(200);

    const deleteContext = buildApiContext({
      method: "DELETE",
      url: `http://localhost/api/flashcards/${flashcardId}`,
      headers: { Cookie: sessionA.cookieHeader },
      params: { id: flashcardId },
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const deleteResponse = await flashcardDelete(deleteContext);
    expect(deleteResponse.status).toBe(204);
  });
});
