import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { POST as flashcardsPost } from "@/pages/api/flashcards";
import { GET as studyQueueGet } from "@/pages/api/study/queue";
import { POST as studyReviewPost } from "@/pages/api/study/review";
import { buildApiContext, createCookieJar } from "../helpers/api-context";
import { signInAsTestUser, cleanupFlashcards } from "../helpers/test-session";
import { TEST_USER_A, TEST_USER_B } from "../helpers/test-users";

/**
 * Analogous to flashcards-isolation.test.ts but for the study path: user A creates a
 * flashcard, user B queries the study queue and attempts to submit a review for A's
 * card. A non-owner must not see the card, must not be able to mutate its FSRS
 * scheduling state, and the schedule fields must be provably unchanged afterward.
 */
describe("Study queue/review isolation between users (Risk #3)", () => {
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
      body: JSON.stringify({ question: "Study isolation question A", answer: "Study isolation answer A" }),
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const response = await flashcardsPost(context);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string };
    createdIds.push(body.id);
    return body.id;
  }

  async function queueAsB() {
    const context = buildApiContext({
      method: "GET",
      url: "http://localhost/api/study/queue",
      headers: { Cookie: sessionB.cookieHeader },
      cookies: createCookieJar(),
      locals: { user: sessionB.user },
    });
    return studyQueueGet(context);
  }

  it("B's study queue does not include A's flashcard", async () => {
    const flashcardId = await createFlashcardAsA();

    const response = await queueAsB();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string }[];
    expect(body.some((f) => f.id === flashcardId)).toBe(false);
  });

  it("B cannot submit a review for A's flashcard, and its schedule stays unchanged", async () => {
    const flashcardId = await createFlashcardAsA();

    const reviewContext = buildApiContext({
      method: "POST",
      url: "http://localhost/api/study/review",
      headers: { "Content-Type": "application/json", Cookie: sessionB.cookieHeader },
      body: JSON.stringify({ id: flashcardId, rating: "good" }),
      cookies: createCookieJar(),
      locals: { user: sessionB.user },
    });
    const reviewResponse = await studyReviewPost(reviewContext);
    expect(reviewResponse.status).toBe(404);

    // Verify as A that the schedule fields are untouched by B's attempt.
    const queueContext = buildApiContext({
      method: "GET",
      url: "http://localhost/api/study/queue?mode=all",
      headers: { Cookie: sessionA.cookieHeader },
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const queueResponse = await studyQueueGet(queueContext);
    const body = (await queueResponse.json()) as { id: string; last_review: string | null; state: string }[];
    const card = body.find((f) => f.id === flashcardId);
    expect(card).toBeDefined();
    expect(card?.last_review).toBeNull();
    expect(card?.state).toBe("New");
  });

  it("positive control: A can submit a review for their own flashcard and scheduling fields change", async () => {
    const flashcardId = await createFlashcardAsA();

    const reviewContext = buildApiContext({
      method: "POST",
      url: "http://localhost/api/study/review",
      headers: { "Content-Type": "application/json", Cookie: sessionA.cookieHeader },
      body: JSON.stringify({ id: flashcardId, rating: "good" }),
      cookies: createCookieJar(),
      locals: { user: sessionA.user },
    });
    const reviewResponse = await studyReviewPost(reviewContext);
    expect(reviewResponse.status).toBe(200);
    const body = (await reviewResponse.json()) as { last_review: string | null; due_date: string };
    expect(body.last_review).not.toBeNull();
  });
});
