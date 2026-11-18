# Forge Folio Payments

Build the backend to forge AI with user frienddly sign in, data management, security, etc. https://github.com/SrgtRambo/vs-code-connector.git

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d614b143-3f9e-4ec0-a77c-27fb6c4f425f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploy on Replit

Forge AI's backend runs on Replit. The frontend is a TanStack Start app that calls the backend API directly.

### 1. Import to Replit

1. Open [replit.com](https://replit.com) and click **Create Repl**.
2. Choose **Import from GitHub** and enter: `https://github.com/SrgtRambo/ForgeAI-v1-Backend-Start.git`
3. Select branch `phase-8`.

### 2. Add a Postgres Database

1. In the Replit sidebar, click **Database** → **Create new Postgres database**.
2. Replit automatically injects `DATABASE_URL` as an environment variable.

### 3. Apply the Database Schema

In the Replit Shell:
```bash
psql $DATABASE_URL -f backend/schema.sql
```

### 4. Add Replit Secrets

Go to **Secrets** (lock icon) and add:

| Secret | Value | Required |
|--------|-------|----------|
| `OPENROUTER_API_KEY` | OpenRouter API key | No (Kilo works free with no key) |
| `GROQ_API_KEY` | Groq API key | No (fast fallback) |
| `KILO_API_KEY` | Kilo API key | No (free-tier fallback, works without) |
| `UNSPLASH_ACCESS_KEY` | Unsplash access key | Yes (stock imagery) |
| `PEXELS_API_KEY` | Pexels API key | No (fallback, optional) |
| `STRIPE_SECRET_KEY` | Stripe secret key | No (payments off without it) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | No (payments off without it) |

Optional overrides (defaults shown):
- `PORT` (4000), `MODEL_STANDARD`, `MODEL_ANALYSIS`, `MODEL_SPEC`, `MODEL_COPY`, `MODEL_CRITIC`, `ANALYSIS_DAILY_LIMIT` (5), `STORAGE_BUCKET` (projects), `JOB_CONCURRENCY` (2), `ALLOW_FREE_GENERATION` (false)

### 5. Run

Click **Run** or in Shell:
```bash
cd backend && npm start
```

Health check: `https://<your-repl>.replit.dev/health`

### How AI works

Multiple providers with automatic fallback: **OpenRouter → Groq → Kilo (free, no key) → Custom**

Different models for different tasks:
- `MODEL_ANALYSIS` — understands business requirements
- `MODEL_SPEC` — designs site structure and copy
- `MODEL_COPY` — repairs banned phrases

### Architecture

- **Auth**: Replit Auth via `X-Replit-User-Id` / `X-Replit-User-Name` headers
- **DB**: Plain Postgres via `pg` Pool over `DATABASE_URL` (no Supabase)
- **Storage**: Replit Object Storage for zips and images
- **AI**: Multi-provider (OpenRouter/Groq/Kilo) with automatic fallback
- **Images**: Unsplash → Pexels fallback, no hotlinking
- **QA**: Playwright + axe-core render gate (Chromium supported via replit.nix)
