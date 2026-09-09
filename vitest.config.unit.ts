/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "node",
    include: ["tests/lib/**/*.test.ts"],
    passWithNoTests: true,
  },
});
