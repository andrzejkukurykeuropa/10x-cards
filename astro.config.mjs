// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import process from "node:process";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // The Cloudflare adapter's Vite plugin sets `resolve.external` on the worker environment,
  // which conflicts with Vitest's `node` test environment when `getViteConfig` merges the
  // full Astro config (see vitest.config.ts). Skip the adapter under `vitest` so `npm run test`
  // can reuse the same Astro/Vite config without booting a Cloudflare Worker environment.
  adapter: process.env.VITEST
    ? undefined
    : cloudflare({
        imageService: "passthrough",
      }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      CLEANUP_ENDPOINT_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      OPENAI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      GITHUB_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
      GEMINI_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      GROQ_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
