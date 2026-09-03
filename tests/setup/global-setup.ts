import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_USER_A, TEST_USER_B } from "../helpers/test-users";

/**
 * Vitest `globalSetup`: runs once before the whole test run, outside the Vite/Astro
 * module graph — `astro:env/server` is unavailable here, so env vars are loaded
 * directly from `.env.test` via `dotenv` and read from `process.env`.
 */
export default async function globalSetup() {
  // `override: true` ensures a local `.env.test` always wins over any SUPABASE_URL/
  // SUPABASE_SERVICE_ROLE_KEY already present in the shell/CI environment (e.g. build
  // secrets for a real project) — without it, dotenv silently keeps the pre-existing
  // value and this suite could run destructive service-role calls against a real project.
  loadEnv({ path: ".env.test", override: true });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test (copy .env.test.example and fill in " +
        "values from `npx supabase status`).",
    );
  }

  assertLocalSupabaseUrl(supabaseUrl);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const user of [TEST_USER_A, TEST_USER_B]) {
    await createTestUserIfMissing(admin, user);
  }
}

async function createTestUserIfMissing(admin: SupabaseClient, user: { email: string; password: string }) {
  const { error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
  });

  if (!error) {
    return;
  }

  // Idempotent: a prior test run already created this user — treat as success.
  const alreadyExists = error.code === "email_exists" || /already registered|already exists/i.test(error.message);

  if (!alreadyExists) {
    throw new Error(`Failed to create test user ${user.email}: ${error.message}`);
  }
}

/**
 * Fails fast if `SUPABASE_URL` doesn't point at a local instance. Service-role admin
 * calls (user creation, `cleanupFlashcards()`'s deletes) are destructive and bypass
 * RLS — this suite must never run them against a real (staging/prod) project, which
 * could otherwise happen silently if `SUPABASE_URL` leaks in from a shell/CI
 * environment instead of `.env.test`.
 */
export function assertLocalSupabaseUrl(supabaseUrl: string): void {
  const { hostname } = new URL(supabaseUrl);
  const isLocal = hostname === "127.0.0.1" || hostname === "localhost";

  if (!isLocal) {
    throw new Error(
      `Refusing to run test suite against non-local SUPABASE_URL "${supabaseUrl}" (hostname "${hostname}"). ` +
        "This suite performs destructive service-role operations and must only target a local `npx supabase start` " +
        "instance. Check .env.test and any inherited shell/CI environment variables.",
    );
  }
}
