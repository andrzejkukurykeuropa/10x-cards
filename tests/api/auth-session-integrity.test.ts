import { describe, expect, it } from "vitest";
import { GET as flashcardsGet } from "@/pages/api/flashcards";
import { POST as signoutPost } from "@/pages/api/auth/signout";
import { buildApiContext, createCookieJar } from "../helpers/api-context";
import { signInAsTestUser } from "../helpers/test-session";
import { TEST_USER_A } from "../helpers/test-users";

describe("auth session integrity", () => {
  it("a session obtained from sign-in authorizes a subsequent request to another endpoint", async () => {
    const { cookieHeader, user } = await signInAsTestUser(TEST_USER_A);

    const context = buildApiContext({
      method: "GET",
      url: "http://localhost/api/flashcards",
      headers: { Cookie: cookieHeader },
      locals: { user },
    });

    const response = await flashcardsGet(context);

    expect(response.status).toBe(200);
  });

  // Documents the existing "always redirect to /" contract of signout.ts even when there
  // is no session to sign out of (its `signOut()` error, if any, is swallowed) — see
  // research.md Open Questions ("signout.ts swallows signOut() errors"). This locks in
  // current behavior deliberately, not as an endorsement of it.
  it("signing out without a session still redirects to /", async () => {
    const context = buildApiContext({
      method: "POST",
      url: "http://localhost/api/auth/signout",
      cookies: createCookieJar(),
      locals: { user: null },
    });

    const response = await signoutPost(context);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
  });
});
