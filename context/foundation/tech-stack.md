---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Dlaczego ten stos

`10x-astro-starter` to opinionowany starter dla solo developera budującego web-applikację po godzinach w 6 tygodni. Supabase dostarcza auth (e-mail + hasło z FR-001/FR-002) i bazę PostgreSQL bez dodatkowej konfiguracji, co eliminuje największe ryzyko MVP — utratę danych fiszek (guardrail PRD). Astro + TypeScript + Zod zapewniają pełne typowanie i konwencje folderów, które agent AI rozumie bez dodatkowych instrukcji. Cloudflare Pages obsługuje streaming, więc wywołania AI/LLM (FR-003) mogą zwracać odpowiedzi strumieniowo do przeglądarki; integrację z OpenAI lub Anthropic dodaje się jako jedną zależność npm (np. `ai` SDK od Vercel). Jedyne znane tarcie: edge runtime wymaga, by logika generowania fiszek zmieściła się w limicie czasu workera — przy standardowych modelach tekstowych to nie jest problem dla 6-tygodniowego MVP.
