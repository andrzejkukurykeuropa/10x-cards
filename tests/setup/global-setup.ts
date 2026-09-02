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
  loadEnv({ path: ".env.test" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test (copy .env.test.example and fill in " +
        "values from `npx supabase status`).",
    );
  }

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
