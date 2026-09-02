import { describe, expect, it } from "vitest";
import type { APIRoute } from "astro";
import { GET as flashcardsGet, POST as flashcardsPost } from "@/pages/api/flashcards";
import { PATCH as flashcardPatch, DELETE as flashcardDelete } from "@/pages/api/flashcards/[id]";
import { GET as studyQueueGet } from "@/pages/api/study/queue";
import { POST as studyReviewPost } from "@/pages/api/study/review";
import { POST as generateFlashcardsPost } from "@/pages/api/generate-flashcards";
import { DELETE as accountDelete } from "@/pages/api/account";
import { buildApiContext } from "../helpers/api-context";

/**
 * Every endpoint below reads `context.locals.user` and must return 401 before touching
 * the database when there is no session. `signin.ts`/`signup.ts`/`confirm.ts` are
 * deliberately excluded — they don't consume `locals.user` and must stay reachable
 * without a session.
 */
interface EndpointCase {
  name: string;
  handler: APIRoute;
  method: string;
  url: string;
  params?: Record<string, string | undefined>;
}

const endpoints: EndpointCase[] = [
  { name: "GET /api/flashcards", handler: flashcardsGet, method: "GET", url: "http://localhost/api/flashcards" },
  { name: "POST /api/flashcards", handler: flashcardsPost, method: "POST", url: "http://localhost/api/flashcards" },
  {
    name: "PATCH /api/flashcards/[id]",
    handler: flashcardPatch,
    method: "PATCH",
    url: "http://localhost/api/flashcards/00000000-0000-0000-0000-000000000000",
    params: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    name: "DELETE /api/flashcards/[id]",
    handler: flashcardDelete,
    method: "DELETE",
    url: "http://localhost/api/flashcards/00000000-0000-0000-0000-000000000000",
    params: { id: "00000000-0000-0000-0000-000000000000" },
  },
  { name: "GET /api/study/queue", handler: studyQueueGet, method: "GET", url: "http://localhost/api/study/queue" },
  {
    name: "POST /api/study/review",
    handler: studyReviewPost,
    method: "POST",
    url: "http://localhost/api/study/review",
  },
  {
    name: "POST /api/generate-flashcards",
    handler: generateFlashcardsPost,
    method: "POST",
    url: "http://localhost/api/generate-flashcards",
  },
  { name: "DELETE /api/account", handler: accountDelete, method: "DELETE", url: "http://localhost/api/account" },
];

describe("API auth gating (no session)", () => {
  it.each(endpoints)("$name returns 401 with locals.user = null", async ({ handler, method, url, params }) => {
    const context = buildApiContext({ method, url, params, locals: { user: null } });

    const response = await handler(context);

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });
});
