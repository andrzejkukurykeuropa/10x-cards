import { describe, expect, it, vi } from "vitest";
import { onRequest } from "@/middleware";
import { signInAsTestUser } from "./helpers/test-session";
import { TEST_USER_A } from "./helpers/test-users";
import { buildApiContext } from "./helpers/api-context";

/**
 * Builds a minimal context for `onRequest` via the shared `buildApiContext` helper, with
 * a spy wrapping `redirect` so tests can assert whether it was invoked.
 */
function buildMiddlewareContext(options: { path: string; cookieHeader?: string }) {
  const context = buildApiContext({
    method: "GET",
    url: `http://localhost${options.path}`,
    headers: options.cookieHeader ? { Cookie: options.cookieHeader } : undefined,
  });

  const redirect = vi.spyOn(context, "redirect");

  return { context, redirect };
}

describe("middleware onRequest", () => {
  it("redirects an unauthenticated user away from a protected route and does not call next()", async () => {
    const { context, redirect } = buildMiddlewareContext({ path: "/dashboard" });
    const next = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

    await onRequest(context, next);

    expect(redirect).toHaveBeenCalledWith("/auth/signin");
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["/dashboard", "/study", "/settings"])(
    "allows an authenticated user to reach the protected route %s",
    async (path) => {
      const { cookieHeader } = await signInAsTestUser(TEST_USER_A);
      const { context, redirect } = buildMiddlewareContext({ path, cookieHeader });
      const next = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

      await onRequest(context, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("does not block an unauthenticated request to a public route", async () => {
    const { context, redirect } = buildMiddlewareContext({ path: "/" });
    const next = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

    await onRequest(context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  // Documents the current prefix-matching behavior of PROTECTED_ROUTES (fail-closed on
  // any path starting with a protected prefix, even a non-existent one) as a deliberate
  // contract, not a bug to fix — see research.md Open Questions.
  it("still redirects for an unauthenticated request to a non-existent path matching a protected prefix", async () => {
    const { context, redirect } = buildMiddlewareContext({ path: "/dashboard-anything" });
    const next = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

    await onRequest(context, next);

    expect(redirect).toHaveBeenCalledWith("/auth/signin");
    expect(next).not.toHaveBeenCalled();
  });
});
