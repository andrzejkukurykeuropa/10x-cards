import { test as setup, expect } from "@playwright/test";
import { TEST_USER_A } from "../../helpers/test-users";

export const USER_A_STORAGE_STATE = "tests/e2e/.auth/user-a.json";

/**
 * Authenticates without driving the sign-in UI, then saves the resulting cookies for every
 * spec in the `chromium` project to reuse. Logging in through the form in each test would be
 * slow, would couple unrelated specs to the auth page's markup, and would make an auth-page
 * regression fail the whole suite instead of the one test that actually covers it.
 *
 * The request goes through the real `/api/auth/signin` endpoint (not a hand-built Supabase
 * client), so the stored cookies are exactly the ones production issues.
 *
 * A spec that must be unauthenticated opts out with:
 *   test.use({ storageState: { cookies: [], origins: [] } });
 */
setup("authenticate as test user A", async ({ request, baseURL }) => {
  const response = await request.post("/api/auth/signin", {
    // Astro's `security.checkOrigin` is on by default for on-demand rendered routes and
    // answers a form POST without a matching Origin header with 403. A real browser form
    // submission always sends it, so this keeps the request production-shaped rather than
    // weakening the app's CSRF protection to accommodate the test.
    headers: { Origin: baseURL ?? "" },
    form: { email: TEST_USER_A.email, password: TEST_USER_A.password },
  });

  expect(response.ok()).toBeTruthy();

  // On success the endpoint redirects to "/"; on failure it redirects back to
  // /auth/signin?error=... with a 2xx after the redirect is followed, so status alone
  // is not enough to tell the two apart.
  expect(new URL(response.url()).pathname, "sign-in was rejected — check .env.test credentials").not.toBe(
    "/auth/signin",
  );

  // Prove the session actually satisfies the middleware before other specs depend on it:
  // /dashboard is in PROTECTED_ROUTES and redirects anonymous users to /auth/signin.
  const dashboard = await request.get("/dashboard");
  expect(new URL(dashboard.url()).pathname, "saved session does not pass the protected-route middleware").toBe(
    "/dashboard",
  );

  await request.storageState({ path: USER_A_STORAGE_STATE });
});
