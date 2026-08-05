import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

/**
 * Creates a Supabase client authenticated with the `service_role` key, bypassing RLS.
 *
 * IMPORTANT: server-only, admin-only usage. Use exclusively for account deletion /
 * inactive-account cleanup endpoints â€” never for regular data access, and never
 * import this module from client-rendered code (React components, `.astro` frontmatter
 * that hydrates data to the client).
 */
export function createAdminClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
