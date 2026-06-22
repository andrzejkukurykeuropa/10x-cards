---
change_id: ai-sdk-edge-spike
title: AI SDK integration on Cloudflare edge — generate-flashcards endpoint
status: implementing
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

F-02 z roadmapy. Weryfikacja i implementacja Vercel AI SDK (`ai` + `@ai-sdk/openai`) na Cloudflare Workers edge runtime. Permanentny endpoint `POST /api/generate-flashcards` ze `streamObject` i schematem Zod. Fundament wymagany przez S-02 (`ai-generation-flow`).
