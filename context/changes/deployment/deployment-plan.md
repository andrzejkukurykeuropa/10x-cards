# Plan wdrożenia: Cloudflare Workers + Pages

> Platforma: Cloudflare Workers + Pages  
> Źródło: `context/foundation/infrastructure.md`  
> Data: 2026-05-31

## Podejście

**Constraint (m1l5-2):** Auto-deploy na `master` obsługuje wyłącznie **natywna integracja Git Cloudflare Pages**. Żaden zewnętrzny system CI/CD (w tym GitHub Actions) nie może deployować. CI służy tylko jako quality gate (lint + build).

```
push → master
  ├── GitHub Actions CI  →  lint + build  (quality gate)
  └── Cloudflare Pages   →  deploy        (production + preview URLs dla PR)
```

**Zewnętrzna integracja:** Supabase (auth + DB) — sekrety muszą być skonfigurowane w CF Pages **przed** pierwszym buildem, ponieważ `astro:env/server` wymaga ich przy buildzie.

---

## Faza 0 — Prerequisites: konfiguracja CLI i środowiska

### 0.1 — Node.js (wymagana wersja)

Projekt wymaga **Node.js 22.14.0** (`.nvmrc`).

```bash
# Sprawdzić aktualną wersję:
node --version   # powinno zwrócić v22.14.0

# Jeśli inna wersja — przełączyć przez nvm (Linux/macOS) lub fnm (Windows):
nvm use          # czyta .nvmrc automatycznie
# lub:
fnm use          # czyta .nvmrc automatycznie
```

> **Windows bez nvm/fnm:** Pobrać Node.js 22 LTS z [nodejs.org](https://nodejs.org) lub przez `winget install OpenJS.NodeJS.LTS`.

---

### 0.2 — Wrangler CLI (już w devDependencies)

Wrangler **v4.90.0** jest w `devDependencies` — nie trzeba instalować globalnie. Zawsze uruchamiać przez `npx`:

```bash
# Weryfikacja wersji:
npx wrangler --version   # powinno zwrócić 4.90.0 lub wyższy
```

---

### 0.3 — Konto Cloudflare

- [ ] Założyć konto na [cloudflare.com](https://cloudflare.com) jeśli nie istnieje (plan **Free** wystarczy dla MVP).
- [ ] Zanotować **Account ID**: Dashboard → prawy panel → "Account ID" (format: `a1b2c3d4...`).

---

### 0.4 — Logowanie wrangler do Cloudflare

```bash
npx wrangler login
```

Otworzy przeglądarkę z OAuth flow Cloudflare. Po autoryzacji token jest zapisany lokalnie w:
- Linux/macOS: `~/.wrangler/config/default.toml`
- Windows: `%USERPROFILE%\.wrangler\config\default.toml`

```bash
# Zweryfikować logowanie:
npx wrangler whoami
# Oczekiwany output:
# Getting User settings...
# 👋 You are logged in with an OAuth Token, associated with the email you@example.com
# ┌──────────────────────┬──────────────────────────────────┐
# │ Account Name         │ Account ID                       │
# ├──────────────────────┼──────────────────────────────────┤
# │ Your Account         │ a1b2c3d4e5f6...                  │
# └──────────────────────┴──────────────────────────────────┘
```

> **CI/CD (niema interaktywne):** Cloudflare Pages Git integration nie używa tokena wrangler — autentykacja dzieje się przez OAuth podczas konfiguracji projektu w Dashboard.

---

### 0.5 — GitHub OAuth dla Cloudflare Pages Git Integration

Podczas tworzenia projektu Pages w Dashboard (Faza 2), Cloudflare poprosi o autoryzację dostępu do GitHub. Wymagane:

- [ ] Konto GitHub z dostępem do repo `andrzejkukurykeuropa/10x-cards`
- [ ] Zgoda na instalację **Cloudflare Pages GitHub App** w org/repozytorium

> Aplikacja GitHub wymaga uprawnień: `Read access to metadata`, `Read and write access to checks, deployments`.

---

### 0.6 — (Opcjonalne) Cloudflare MCP Server dla agent-assisted operations

Umożliwia agentom AI (Copilot CLI, Cursor, Claude Code) zarządzanie Workers/Pages przez MCP protocol.

```json
// Dodać do konfiguracji MCP klienta (np. .github/copilot-instructions.md lub ustawień IDE):
{
  "mcpServers": {
    "cloudflare-docs": {
      "command": "npx",
      "args": ["mcp-remote", "https://docs.mcp.cloudflare.com/mcp"]
    },
    "cloudflare-observability": {
      "command": "npx",
      "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/mcp"]
    }
  }
}
```

Wymaga: `npx mcp-remote` (instaluje się automatycznie przy pierwszym uruchomieniu).

---

### 0.7 — Weryfikacja .dev.vars (local dev secrets)

Przed jakimkolwiek `npm run dev` — upewnić się że plik `.dev.vars` istnieje (gitignored):

```bash
# Windows PowerShell:
Copy-Item .env.example .dev.vars
# Następnie uzupełnić wartościami z projektu Supabase:
# SUPABASE_URL=https://<project-ref>.supabase.co
# SUPABASE_KEY=<anon key z Settings → API>
```

```bash
# Zweryfikować że wrangler widzi zmienne:
npx wrangler dev --local
# Powinien wystartować bez błędów "missing env var"
```

---

### 0.8 — Supabase: konfiguracja projektu (produkcja)

#### 0.8.1 — Konto i projekt Supabase

- [ ] Założyć konto na [supabase.com](https://supabase.com) jeśli nie istnieje (plan **Free** wystarczy dla MVP).
- [ ] Kliknąć **New Project** → wybrać organizację → nadać nazwę (np. `10x-cards`).
- [ ] Wybrać region **Europe (Frankfurt / eu-central-1)** — najniższe opóźnienie z Polski.
- [ ] Ustawić silne hasło do bazy (zanotować — potrzebne przy migracji przez CLI).
- [ ] Poczekać ~2 minuty na inicjalizację projektu.

#### 0.8.2 — Pobranie danych połączenia

Po inicjalizacji projektu przejść do **Settings → API**:

| Klucz | Lokalizacja w Dashboard | Zmienna env |
|---|---|---|
| Project URL | `https://<ref>.supabase.co` | `SUPABASE_URL` |
| anon (public) key | pole "anon public" | `SUPABASE_KEY` |

> ⚠️ **Nie używać** klucza `service_role` — ma pełny dostęp z pominięciem RLS. `anon` key jest bezpieczny po stronie przeglądarki/serwera przy włączonym RLS.

```bash
# Skopiować wartości do .dev.vars (lokalne dev):
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 0.8.3 — Weryfikacja połączenia z hosted Supabase

```bash
# Sprawdzić dostępność projektu:
curl https://<project-ref>.supabase.co/rest/v1/ \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>"
# Oczekiwany output: {"message":"Not Found"} lub pusta lista — oznacza że auth działa
```

---

### 0.9 — Supabase: local development (Docker)

Local Supabase emuluje cały stack (Postgres, Auth, Storage, Realtime) lokalnie — nie trzeba łączyć się z hosted projektem podczas developmentu.

#### 0.9.1 — Wymagania

- [ ] **Docker Desktop** uruchomiony:  
  - Windows: [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
  - Zweryfikować: `docker --version` i `docker ps` (nie może zwrócić błędu)

#### 0.9.2 — Inicjalizacja Supabase CLI (jeśli nie zrobione)

```bash
# Supabase CLI jest w devDependencies — używać przez npx:
npx supabase --version   # weryfikacja

# Jeśli katalog supabase/ nie istnieje w repo:
npx supabase init
# Tworzy: supabase/config.toml
```

> W tym repo `supabase/` już istnieje (migrations w `supabase/migrations/`).

#### 0.9.3 — Linkowanie z projektem hosted (raz, na maszynę)

```bash
npx supabase login
# Otworzy przeglądarkę — zalogować się i wygenerować token dostępu

npx supabase link --project-ref <project-ref>
# project-ref = segment URL: https://<project-ref>.supabase.co
# Pyta o hasło do bazy (z kroku 0.8.1)
```

#### 0.9.4 — Uruchomienie lokalnego Supabase

```bash
npx supabase start
```

Pierwsze uruchomienie pobiera obrazy Docker (~500MB). Kolejne starty trwają kilka sekund.

Oczekiwany output:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   S3 Access Key: 625729a08b95bf1b7ff351a663f3a23c
   S3 Secret Key: 850181e4652dd023b7a98c58ae0d2d34bd487ee0bd82750
       S3 Region: local
```

#### 0.9.5 — Konfiguracja .dev.vars dla local dev

Skopiować `anon key` z outputu powyżej i zaktualizować `.dev.vars`:

```bash
# .dev.vars (gitignored) — wartości dla lokalnego Supabase:
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key z outputu supabase start>
```

> **Uwaga:** `.dev.vars` czyta `npm run dev` (Astro dev server z Cloudflare adapter). NIE `.env`.

#### 0.9.6 — Uruchomienie migracji lokalnie

```bash
# Zastosować wszystkie migracje z supabase/migrations/ na lokalnej bazie:
npx supabase db push
# lub (jeśli nie linkowano):
npx supabase db reset   # czyści bazę i aplikuje migracje od zera
```

Zweryfikować w Supabase Studio: [http://127.0.0.1:54323](http://127.0.0.1:54323) → Table Editor — powinny być widoczne tabele projektu.

#### 0.9.7 — Uruchomienie migracji na hosted (produkcja)

```bash
# Po upewnieniu się że migracje działają lokalnie:
npx supabase db push --linked
# Pyta o potwierdzenie przed zmianami na produkcyjnej bazie
```

> ⚠️ Supabase nie wspiera rollback migracji — stosować wyłącznie **forward-only migrations** (każda nowa migracja to addytywna zmiana).

#### 0.9.8 — Zatrzymanie lokalnego Supabase

```bash
npx supabase stop
# Zatrzymuje kontenery Docker, dane są zachowane

npx supabase stop --no-backup
# Zatrzymuje i usuwa dane (czyste uruchomienie przy następnym start)
```

#### 0.9.9 — Typowe problemy

| Problem | Przyczyna | Rozwiązanie |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop nie działa | Uruchomić Docker Desktop |
| `port 54321 already in use` | Poprzednia instancja działa | `npx supabase stop` najpierw |
| `supabase start` zawiesza się | Pierwszy download obrazów | Poczekać 5–10 min przy wolnym łączu |
| Auth nie działa po `npm run dev` | Złe wartości w `.dev.vars` | Sprawdzić `anon key` z `supabase start` output |
| Tabele nie istnieją lokalnie | Migracje niezastosowane | `npx supabase db reset` |

---

### 0.10 — Dry-run bundle check

Przed pierwszym produkcyjnym deployem — zweryfikować że bundle mieści się w limicie 3MB (free plan):

```bash
npm run build
npx wrangler deploy --dry-run --outdir dist
# Szukać w output: "Total Upload: X.XX KiB / gzip: X.XX KiB"
# Limit: 3 MB (free) / 10 MB (paid)
```

Jeśli bundle > 3MB → upgrade do Workers Paid (`$5/mies.`) lub optymalizacja (lazy imports, code splitting).

---

## Faza 1 — Aktualizacja wrangler.jsonc ✅

- [x] **1.1** Zmieniono `name` z `"10x-astro-starter"` na `"10x-cards"` w `wrangler.jsonc`.

- [ ] **1.2** Sprawdzić bundle size (po zalogowaniu do wrangler):
  ```bash
  npm run build
  npx wrangler deploy --dry-run --outdir dist
  ```
  Limit: 3MB (free plan) / 10MB (paid). Jeśli przekroczony → rozważyć upgrade Workers Paid ($5/mies.).

---

## Faza 2 — Utworzenie projektu Cloudflare Pages (natywna integracja Git)

- [ ] **2.1** W [Cloudflare Dashboard](https://dash.cloudflare.com):
  - **Workers & Pages → Create → Pages → Connect to Git → GitHub**
  - Autoryzować dostęp do repo `andrzejkukurykeuropa/10x-cards`

- [ ] **2.2** Skonfigurować build:

  | Pole | Wartość |
  |---|---|
  | Project name | `10x-cards` |
  | Production branch | `master` |
  | Framework preset | `Astro` |
  | Build command | `npm run build` |
  | Build output directory | `dist` |
  | Node.js version | `22` |

- [ ] **2.3** **NIE klikać "Save and Deploy"** — najpierw ustawić sekrety (Faza 3).

---

## Faza 3 — Konfiguracja sekretów produkcyjnych

Sekrety muszą być ustawione **przed** pierwszym buildem na CF Pages.

- [ ] **3.1** Ustawić sekrety przez CLI:
  ```bash
  npx wrangler pages secret put SUPABASE_URL --project-name 10x-cards
  npx wrangler pages secret put SUPABASE_KEY --project-name 10x-cards
  ```

- [ ] **3.2** Zweryfikować:
  ```bash
  npx wrangler pages secret list --project-name 10x-cards
  ```

- [ ] **3.3** Ustawić dla środowiska Preview (dla PR branch deploys):
  ```bash
  npx wrangler pages secret put SUPABASE_URL --project-name 10x-cards --env preview
  npx wrangler pages secret put SUPABASE_KEY --project-name 10x-cards --env preview
  ```

---

## Faza 4 — Weryfikacja local dev (.dev.vars)

- [ ] **4.1** Sprawdzić że `.dev.vars` istnieje z wartościami:
  ```
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_KEY=eyJhbGc...
  ```
  Jeśli brak: `Copy-Item .env.example .dev.vars` (Windows) i uzupełnić wartościami.

- [ ] **4.2** Przetestować lokalny dev:
  ```bash
  npm run dev
  ```
  Zalogować się przez `/auth/signin` → sprawdzić dashboard.

---

## Faza 5 — Pierwszy deploy

- [ ] **5.1** Wrócić do Dashboard (krok 2.3) → "Save and Deploy".  
  Lub przez CLI (jeśli projekt już utworzony):
  ```bash
  npm run build
  npx wrangler pages deploy dist --project-name 10x-cards
  ```

- [ ] **5.2** Monitorować logi buildu: Dashboard → Pages → 10x-cards → Deployments.

- [ ] **5.3** Zanotować URL deploymentu: `https://10x-cards.pages.dev` (lub inny).

**Edge case — build fails na CF Pages:**
- Brakujące sekrety → sprawdzić kroki 3.1–3.2
- CJS package conflict → dodać do `optimizeDeps.include` w `astro.config.mjs`
- Bundle > 3MB → sprawdzić dry-run z kroku 1.2

---

## Faza 6 — Smoke test

- [ ] **6.1** Otworzyć URL deploymentu w przeglądarce.
- [ ] **6.2** Strona główna (`/`) — ładuje się bez błędów.
- [ ] **6.3** Auth flow: `/auth/signup` → `/auth/signin` → `/dashboard` (redirect jeśli niezalogowany ✅).
- [ ] **6.4** W razie błędów — sprawdzić runtime logi:
  ```bash
  npx wrangler pages deployment tail --project-name 10x-cards
  ```

---

## Faza 7 — Weryfikacja CI (GitHub Actions)

- [ ] **7.1** Sprawdzić że GitHub Actions CI przechodzi po pushu (lint + build ✅).
- [ ] **7.2** Upewnić się że CI **nie ma kroku deploy** — to celowe. Deploy należy do CF Pages.

---

## Faza 8 — Procedury operacyjne

### Rollback
```bash
# Lista deploymentów
npx wrangler pages deployment list --project-name 10x-cards
# Rollback przez Dashboard → Pages → Deployments → "Rollback to this deployment"
```
⚠️ Migracje Supabase nie rollbackują się — stosować forward-only migrations.

### Rotacja sekretów
```bash
npx wrangler pages secret put SUPABASE_KEY --project-name 10x-cards
# Nowa wartość nadpisuje starą; CF Pages automatycznie redeploys
```

### Preview URLs dla PR
- Format: `https://<branch>.<hash>.10x-cards.pages.dev`
- Publiczne — zabezpieczyć przez Cloudflare Access (Zero Trust) przed launchem jeśli app ma wrażliwe dane.

### CPU limit (free plan)
- Limit: 10ms CPU/request. Sprawdzić w Dashboard → Pages → Metrics po deploy.
- Przekroczenie po dodaniu AI endpointu → upgrade do Workers Paid ($5/mies.).

---

## Kolejność kroków wymagających działania użytkownika

### Supabase (jednorazowo)
1. Założyć konto i projekt Supabase → pobrać `SUPABASE_URL` + `SUPABASE_KEY` (sekcja 0.8)
2. Zainstalować Docker Desktop i uruchomić (sekcja 0.9.1)
3. `npx supabase login` → `npx supabase link --project-ref <ref>` (sekcja 0.9.3)
4. `npx supabase start` → skopiować `anon key` do `.dev.vars` (sekcje 0.9.4–0.9.5)
5. `npx supabase db push` — zastosować migracje lokalnie (sekcja 0.9.6)
6. `npx supabase db push --linked` — zastosować migracje na hosted (sekcja 0.9.7)

### Cloudflare (jednorazowo)
7. `npx wrangler login` (sekcja 0.4)
8. Utworzyć projekt Pages w Dashboard (Faza 2)
9. Ustawić sekrety `SUPABASE_URL` + `SUPABASE_KEY` przez CLI (Faza 3)
10. Wyzwolić pierwszy deploy (Faza 5)

### Lokalny development (codziennie)
```bash
# Terminal 1 — Supabase (jeśli nie działa):
npx supabase start

# Terminal 2 — Astro dev server:
npm run dev
# Otworzyć http://localhost:4321
```
