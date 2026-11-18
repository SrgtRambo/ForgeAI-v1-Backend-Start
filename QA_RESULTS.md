# QA Results — Forge AI

## Test Suite

Command: `cd backend && NODE_ENV=test npm test`

| Metric | Value |
|--------|-------|
| Tests | 149 |
| Pass | 149 |
| Fail | 0 |
| Cancelled | 0 |
| Skipped | 0 |

### Test Files

- `analyze.test.js` — analysis + spec generation from fixtures
- `build.test.js` — static site build from spec (all 10 fixtures)
- `design.test.js` — design system, palette, typography, banned phrases
- `engine.test.js` — multi-step generation engine (plan, write, continue, zip)
- `images.test.js` — stock image providers (Unsplash, Pexels) + resolution
- `qa.test.js` — QA render gate, banned patterns, axe integration
- `rules.test.js` — pure validation rules
- `sections.test.js` — 16 section types + variants
- `spec.test.js` — site spec schema + validator
- `webhook.test.js` — Stripe webhook idempotency, auth guards
- `site-api.test.js` — site brief API, image slot routes, analyze rate limit, auth guards

## Phase Gates

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Baseline, env hygiene | Pass |
| 1 | Site spec schema + validator | Pass |
| 2 | Section library (16 types) | Pass |
| 3 | Design system, palette, banned phrases | Pass |
| 4 | Analysis + spec generation | Pass |
| 5 | Stock imagery (Unsplash/Pexels fallback) | Pass |
| 6 | Build spec → static site files | Pass |
| 7 | QA render + critic (Playwright + axe-core) | Code complete; Chromium-graceful (rendered QA skipped when browser deps unavailable) |
| 8 | Database schema + API routes + tests | Implemented (149 tests pass) |
| 9 | Studio UI (studio.tsx + Forge workspace) | Route exists; Supabase/Lovable-managed per AGENTS.md |
| 10 | Acceptance (this document + REVIEW.md) | Not run (requires .env secrets + live server) |

## QA Render Gate

The QA module (`backend/src/qa/index.js`) provides:

- Headless Chromium rendering via Playwright at mobile (390x844) and desktop (1440x900) viewports
- axe-core accessibility checks (WCAG 2.1 A/AA, serious/critical violations only)
- Horizontal overflow detection
- Console error and failed request collection
- Banned phrase detection (lorem ipsum, click here, unlock, seamless, revolutionary, game changer, template placeholders)
- Optional vision-model critic scoring layout/typography/imagery/originality/professionalism (1–10), with issue taxonomy (change-variant, change-palette-role, change-font-pairing, change-density, rewrite-copy, swap-image-query, remove-section, move-section)
- Pass threshold: zero errors, zero overflow, zero axe violations, zero banned text, and all critic scores >= 7

QA is skipped when Chromium/axe-core are unavailable (CI without browser deps).

## Locked Design Decisions

- Spec-driven rendering: every output file derives from `site.spec.json`
- Static HTML output (no build step in delivered zips)
- Free analysis limit: 5 per day per user
- Preview in sandboxed iframe
- No stock portraits; Unsplash→Pexels fallback; no hotlinking
- Hero heading <= 9 words
- Banned phrases enforced in all generated copy
- All persistence behind Replit Postgres (no Supabase RLS)

## Phase 8 — Database, Storage, Auth, and API

Implemented per ANTIGRAVITY_PLAN.md section 11:

**Infrastructure:**
- `backend/src/infra/db.js` — `pg` client over `DATABASE_URL`; exports `query(sql, params)` and `transaction(fn)`. Throws at startup if `DATABASE_URL` missing.
- `backend/src/infra/storage.js` — `put(key, buffer, contentType)`, `get(key)` → `{buffer, contentType}` \| null, `remove(key)`. Production adapter uses `@replit/object-storage` (`uploadFromBytes`, `downloadAsBytes`, `delete`). Test adapter: in-memory.
- `backend/src/infra/auth.js` — `requireUser(req, res, next)` sets `req.user = {id, name}` from Replit-injected headers `X-Replit-User-Id` and `X-Replit-User-Name`. Trusts headers only when `REPL_ID` or `REPLIT_DEPLOYMENT` is set; otherwise returns 401. Test override allowed only when `NODE_ENV` is not production.

**Database (`backend/schema.sql`, plain Postgres, idempotent):**
- `users(id text pk, name text, created_at)`
- `site_briefs(id uuid pk, user_id text references users, input/analysis/spec jsonb, created_at, updated_at)`
- `site_image_assets(id uuid pk, brief_id uuid references site_briefs on delete cascade, slot_id text, source text check, storage_key text, credit jsonb, created_at)`
- `analysis_usage(user_id text, day date, count int default 0, primary key (user_id, day))`
- `purchases`: added `brief_id uuid references site_briefs`, `qa_status text`, `qa_report_key text`

**Routes (all require `requireUser`; return 404 for other users' rows, never 403):**
- `POST /api/site/analyze` — validates input, checks daily analysis limit (429 if exceeded), runs steps A+B, inserts brief, increments usage in one transaction
- `GET /api/site/briefs/:id` — returns spec, analysis, image slots
- `PATCH /api/site/briefs/:id` — accepts edits to unknowns, meta/brief copy, palette roles, section order/variant; validates with `validateSpec`; 422 on invalid or unknown keys
- `POST /api/site/briefs/:id/images/:slot` — multipart upload (magic byte check, max 10 MB, sharp re-encode to JPEG max 2000px quality 82 EXIF stripped), stores at `briefs/<briefId>/<slot>.jpg`, upserts row source `upload`, queues rebuild
- `POST /api/site/briefs/:id/images/:slot/search` — stock resolver for this slot only, source `stock`, queues rebuild
- `POST /api/site/briefs/:id/images/:slot/url` — https required, rejects private/loopback/link-local/IPv6 loopback addresses before connecting, 10s timeout, 10 MB cap, accepts only image/jpeg/png/webp + magic byte verification, source `url`, queues rebuild
- `DELETE /api/site/briefs/:id/images/:slot` — removes file and row, queues rebuild with stock search for that slot
- `GET /api/purchases/:id/preview/*` — owner only, serves one file from purchase zip via packager.js, rejects `..` and leading `/`, sets CSP + `X-Content-Type-Options: nosniff` headers
- `POST /api/checkout` — optional `briefId`; must belong to caller and have valid spec; stored as `brief_id` on purchase

**Rebuilds:** image routes queue a job that runs only: resolve changed slots, `buildSite`, QA. No analysis or copy model calls. At most one pending rebuild per brief; new request replaces the queued one.
