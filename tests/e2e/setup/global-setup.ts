import vitestGlobalSetup from "../../setup/global-setup";

/**
 * Playwright `globalSetup`: runs once before the whole e2e run.
 *
 * Delegates to the Vitest global setup rather than duplicating it — that function already
 * loads `.env.test` with `override: true`, refuses to run against a non-local SUPABASE_URL
 * (`assertLocalSupabaseUrl`), and idempotently creates TEST_USER_A / TEST_USER_B through the
 * service-role Admin API. The e2e suite needs exactly the same preconditions, and keeping one
 * implementation means the local-only safety guard can never drift between the two runners.
 */
export default async function globalSetup(): Promise<void> {
  await vitestGlobalSetup();
}
