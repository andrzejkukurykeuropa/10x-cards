/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    globalSetup: ["tests/setup/global-setup.ts"],
    testTimeout: 15000,
    passWithNoTests: true,
  },
});
