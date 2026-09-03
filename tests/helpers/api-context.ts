import type { APIContext, AstroCookieSetOptions } from "astro";

/**
 * Minimal in-memory cookie jar matching the interface `cookies.set()` expects when
 * called from `src/lib/supabase.ts`'s `createServerClient` `setAll()` callback.
 * `.toCookieHeader()` serializes accumulated cookies into a `Cookie` header string
 * usable on a subsequent request "as" the user who logged in.
 */
export function createCookieJar(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));

  return {
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    // `options` (path/domain/maxAge/etc.) is accepted to match the real `cookies.set()`
    // signature callers rely on (see src/lib/supabase.ts's setAll() callback) — this
    // in-memory jar only needs the name/value pair, so options is intentionally unused.
    set(name: string, value: string, _options?: AstroCookieSetOptions) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
    has(name: string) {
      return store.has(name);
    },
    toCookieHeader() {
      return Array.from(store.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
  };
}

export type CookieJar = ReturnType<typeof createCookieJar>;

interface BuildApiContextOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  cookies?: CookieJar;
  locals?: Partial<App.Locals>;
  params?: Record<string, string | undefined>;
}

/**
 * Builds a minimal, type-compatible stand-in for Astro's `APIContext` sufficient to
 * invoke `GET`/`POST`/`PATCH`/`DELETE` handlers from `src/pages/api/**` directly,
 * without booting the full Astro server. Covers every context field this repository's
 * handlers and middleware read: `request`, `cookies`, `locals`, `params`, `url`, and
 * `redirect` (used by `signout.ts` and `src/middleware.ts`).
 */
export function buildApiContext(options: BuildApiContextOptions): APIContext {
  const { method, url, headers, body, cookies = createCookieJar(), locals = { user: null }, params = {} } = options;

  const requestHeaders = new Headers(headers);
  if (cookies.toCookieHeader() && !requestHeaders.has("Cookie")) {
    requestHeaders.set("Cookie", cookies.toCookieHeader());
  }

  const request = new Request(url, { method, headers: requestHeaders, body });

  return {
    request,
    cookies,
    locals,
    params,
    url: new URL(url),
    // Mirrors Astro's `context.redirect(path, status?)`, used by `signout.ts` and the
    // middleware — the only other `APIContext` field this repository's handlers read.
    redirect(location: string, status = 302) {
      return new Response(null, { status, headers: { Location: location } });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as APIContext;
}
