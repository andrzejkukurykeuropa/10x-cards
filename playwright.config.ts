import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * `override: true` mirrors `tests/setup/global-setup.ts`: a local `.env.test` must always
 * win over any SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY already present in the shell or CI
 * environment. Without it dotenv silently keeps the pre-existing value, and the e2e global
 * setup — which creates accounts through the service-role Admin API — could target a real
 * project. `assertLocalSupabaseUrl()` is the second half of that guard.
 */
loadEnv({ path: ".env.test", override: true });

const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Which runtime the suite drives. `context/foundation/test-plan.md` (§4, Risk #7) leaves this
 * deliberately open, because `astro dev` and `npm run preview` are not guaranteed to behave
 * identically for state that has to survive a document reload:
 *
 *   dev     (default) — `astro dev`, fast iteration, no build step.
 *   preview           — `npm run build && npm run preview`, production bundle on workerd.
 *
 * Switch with E2E_TARGET=preview. Any risk whose verdict could differ between the two must be
 * confirmed against `preview` before it is treated as settled.
 */
const target = process.env.E2E_TARGET === "preview" ? "preview" : "dev";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // A stray `test.only` must never silently shrink the CI suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/setup/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // Authenticates once via the real /api/auth/signin endpoint and saves the cookies.
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: "**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user-a.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // `--port` must be passed through, otherwise E2E_PORT would move the URL Playwright waits
    // on while the server kept booting on Astro's default 4321.
    command:
      target === "preview" ? `npm run build && npm run preview -- --port ${PORT}` : `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // `preview` builds first, so it needs materially longer than `dev`.
    timeout: target === "preview" ? 300_000 : 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
