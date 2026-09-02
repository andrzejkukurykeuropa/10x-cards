import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

/**
 * Logs in as the given test user through the exact same `@supabase/ssr` factory used
 * in production (`src/lib/supabase.ts`), with an in-memory fake cookie store standing
 * in for Astro's `AstroCookies`. `signInWithPassword()` triggers the real internal
 * cookie-writing mechanism, so the returned header is production-shaped without any
 * knowledge of the internal token format.
 */
export async function signInAsTestUser(credentials: {
  email: string;
  password: string;
}): Promise<{ cookieHeader: string; user: User }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be set (check .env.test).");
  }

  const cookieStore = new Map<string, string>();

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        const header = Array.from(cookieStore.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join("; ");
        return parseCookieHeader(header).map(({ name, value }) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          cookieStore.set(name, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    throw new Error(`Failed to sign in test user ${credentials.email}: ${error.message}`);
  }

  const cookieHeader = Array.from(cookieStore.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return { cookieHeader, user: data.user };
}

/**
 * Deletes the given flashcard ids through the service-role client, bypassing RLS.
 * Used from `afterEach`/`afterAll` in Phase 3 isolation tests to keep the shared
 * `flashcards` table clean between test files.
 */
export async function cleanupFlashcards(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (check .env.test).");
  }

  const admin = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from("flashcards").delete().in("id", ids);
  if (error) {
    throw new Error(`Failed to clean up flashcards ${ids.join(", ")}: ${error.message}`);
  }
}
