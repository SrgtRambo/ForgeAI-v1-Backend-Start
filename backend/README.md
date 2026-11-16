# Forge AI backend (generation engine)

A standalone Node.js server that sells and delivers custom software:

1. A signed-in customer picks a **type** and **tier** and describes their business.
2. **Stripe Checkout** takes the payment.
3. The **webhook** checks Stripe's signature, marks the purchase paid, and replies instantly.
4. A **background job** plans the project, writes every file with its own AI call (OpenRouter),
   zips it, and stores it privately in Supabase Storage.
5. The customer downloads it with a fresh one-hour link.

## What changed from the first version

| Before | Now |
| --- | --- |
| Whole project in one AI reply capped at 4096 tokens, so apps were cut off | Plan first, then one call per file, with automatic "continue" calls if a file is still cut off |
| `npm install` + `npm run build` inside the webhook (60–90 s, Stripe gives up after ~20 s) | Webhook replies immediately; work runs in a job queue that resumes after restarts |
| `express.json()` ran before the webhook, so Stripe signature checks always failed | Webhook reads the raw body |
| Anyone could fetch any download by id | Downloads require sign-in and only work for your own purchases |
| AI could write any path (e.g. `../../etc`) | Paths are checked; only safe file types, max size per file |
| One generic prompt | Five presets: `website`, `saas`, `social`, `spreadsheet`, `software` |
| 24-hour link saved in the database (goes stale) | New link created on each download |
| Stripe metadata carried the whole prompt (500-char limit) | Only ids go to Stripe |

## Run it (Replit or VS Code)

```bash
cd backend
npm install
cp .env.example .env    # on Replit, add these as Secrets instead
npm run dev             # http://localhost:4000/health
npm test                # runs the engine tests, no keys needed
```

### Secrets you need

| Name | Where to get it |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | A Supabase project you own → Project Settings → API. Run `sql/schema.sql` in its SQL editor first. |
| `OPENROUTER_API_KEY` | openrouter.ai/keys |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe dashboard (optional at first) |

Without Stripe keys the server still runs. Set `ALLOW_FREE_GENERATION=true` to test the whole
flow for free through `POST /api/generate-free` — **turn it off before going live**.

> The Lovable Cloud project behind the Forge AI website does not hand out a service-role key,
> so this standalone server needs its own Supabase project. Customers sign in on that project.

### Stripe webhook

Point a Stripe webhook at `https://YOUR-SERVER/api/stripe/webhook` with the events
`checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`.
Locally: `stripe listen --forward-to localhost:4000/api/stripe/webhook`.

## API

All `/api/*` routes except the webhook and catalog need `Authorization: Bearer <supabase access token>`.

| Method | Path | Body / result |
| --- | --- | --- |
| GET | `/health` | `{ ok, payments, freeGeneration, jobs }` |
| GET | `/api/catalog` | Types and tiers with prices |
| POST | `/api/checkout` | `{ prompt, type, tier }` → `{ url, purchaseId }` (send the customer to `url`) |
| POST | `/api/generate-free` | Same body, only when `ALLOW_FREE_GENERATION=true` → `{ purchaseId }` |
| GET | `/api/purchases` | Your purchases with `status` and `progress` |
| GET | `/api/purchases/:id` | One purchase |
| GET | `/api/purchases/:id/download` | `{ url }` once `status` is `ready` |
| POST | `/api/stripe/webhook` | Stripe only |

Purchase status flow: `pending` → `queued` → `processing` → `ready` (or `failed` / `cancelled`).

## Prices and limits

Set in `src/pricing.js`: Standard $9.99 (up to 8 files), Pro $19.99 (up to 16 files).
Models per tier: `MODEL_STANDARD`, `MODEL_PRO` in `.env`.

## Hosting notes

Runs as one long-lived Node process (Replit Deployments "Reserved VM", Railway, Render, Fly.io).
It is not suited to serverless/edge hosting because jobs run in the background after the reply.
Run a single instance: the job queue lives in memory and resumes unfinished jobs on start.
