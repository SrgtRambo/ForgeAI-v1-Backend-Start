# Replit Deployment — Forge AI Backend

This guide walks you through deploying the Forge AI backend on Replit.

## 1. Import to Replit

1. Open [replit.com](https://replit.com) and click **Create Repl**.
2. Choose **Import from GitHub** and enter: `https://github.com/SrgtRambo/ForgeAI-v1-Backend-Start.git`
3. Select branch `phase-8`.

## 2. Add a Postgres Database

1. In the Replit sidebar, click **Database** (or **Tools → Database**).
2. Create a new Postgres database.
3. Replit automatically injects `DATABASE_URL` as an environment variable.

## 3. Apply the Database Schema

1. Open the Replit Shell.
2. Run: `psql $DATABASE_URL -f backend/schema.sql`

This creates the `users`, `purchases`, `site_briefs`, `site_image_assets`, and `analysis_usage` tables.

## 4. Add Secrets (Replit Secrets)

In Replit, go to **Secrets** (lock icon in the sidebar) and add:

| Secret | Value | Required |
|--------|-------|----------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | Yes (primary AI provider) |
| `GROQ_API_KEY` | Your Groq API key | No (fast fallback when OpenRouter rate-limits) |
| `KILO_API_KEY` | Your Kilo API key | No (free-tier fallback) |
| `AI_ENDPOINT` + `AI_API_KEY` | Custom OpenAI-compatible endpoint | No (custom provider) |
| `UNSPLASH_ACCESS_KEY` | Your Unsplash access key | Yes (stock imagery) |
| `PEXELS_API_KEY` | Your Pexels API key | No (stock imagery fallback; optional) |
| `STRIPE_SECRET_KEY` | Your Stripe secret key | No (payments off without it) |
| `STRIPE_WEBHOOK_SECRET` | Your Stripe webhook secret | No (payments off without it) |

Optional overrides (defaults work without these):
- `PORT` (default `4000`)
- `BASE_URL` (default `http://localhost:4000`)
- `FRONTEND_URL` (default = BASE_URL)
- `CORS_ORIGINS` (default `http://localhost:8080`)
- `MODEL_STANDARD` (default `google/gemini-2.5-flash`)
- `MODEL_PRO` (default `anthropic/claude-sonnet-4.5`)
- `ANALYSIS_DAILY_LIMIT` (default `5`)
- `STORAGE_BUCKET` (default `projects`)
- `JOB_CONCURRENCY` (default `2`)
- `ALLOW_FREE_GENERATION` (default `false`)

## 5. Run the Backend

Click the **Run** button in Replit, or run in Shell:

```bash
cd backend && npm start
```

The server will listen on the port Replit assigns (defaults to 4000).

### Health check
Visit `https://<your-repl>.replit.dev/health` — you should see:

```json
{ "ok": true, "payments": false, "freeGeneration": false, "jobs": 0 }
```

## 6. Run the Frontend Studio

The frontend (`src/`) is a TanStack Start app that now calls the backend API directly (no Supabase). To run it on Replit:

1. Add `VITE_BACKEND_URL` as a Replit Secret pointing to your backend's URL (e.g. `https://<your-backend-repl>.replit.dev`)
2. In the frontend Shell: `npm run dev`
3. Visit `https://<your-frontend-repl>.replit.dev/studio`

The Studio will authenticate via Replit headers (`X-Replit-User-Id`), load projects from the backend API, and sync changes back to the backend.

## 7. Architecture Notes

- **Auth**: Replit Auth via `X-Replit-User-Id` / `X-Replit-User-Name` headers (injected by Replit middleware).
- **DB**: Plain Postgres via `pg` Pool over `DATABASE_URL` (no Supabase, no RLS).
- **Storage**: Replit Object Storage (`@replit/object-storage`) for zips and images.
- **AI**: OpenRouter (`OPENROUTER_API_KEY`) for analysis, copy, and QA critic.
- **Images**: Unsplash → Pexels fallback; no hotlinking; images stored in Replit Object Storage.
- **Frontend**: Replit-native; no Supabase imports remain in active code paths. Calls backend API via `src/lib/api.ts`.
- **Chromium**: `replit.nix` includes system libraries for Playwright/Chromium (Phase 7 QA render gate).
