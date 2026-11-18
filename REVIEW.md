# Review — Forge AI Backend Pipeline

## Scope

Complete 10-phase backend build for Forge AI: an AI-powered site generation system that takes a business prompt, analyzes it, produces a site spec, renders static HTML/CSS/JS files, runs QA (accessibility + banned copy + overflow), and delivers a zip via Stripe checkout or free generation tier.

## What Was Built

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Spec schema + validator | `backend/src/site/spec.js` | Validates site.spec.json structure |
| Section library | `backend/src/site/sections/` | 16 section types × variants (hero, features, testimonials, booking, team, etc.) |
| Design system | `backend/src/site/design/` | Palette, banned phrases, typography tokens |
| Analysis engine | `backend/src/site/analyze.js` | Converts business prompt → analysis JSON |
| Spec generator | `backend/src/site/build-spec-from-analysis.js` | Converts analysis → site spec |
| Image pipeline | `backend/src/site/images/` | Unsplash + Pexels providers, resolution, placeholder handling |
| Builder | `backend/src/site/build.js` | Spec → static files (HTML, CSS, JS, images, credits, README, sitemap, robots) |
| Generation engine | `backend/src/engine.js` | Multi-file planning + writing with continuation support |
| Job runner | `backend/src/jobs.js` | Background generation, zip packaging, Replit Object Storage upload |
| API server | `backend/src/server.js` | Express routes: catalog, checkout, generate-free, purchases, download, webhook, site briefs, image slots, preview |
| Order validation | `backend/src/orders.js` | Prompt/tier/type validation |
| Pricing | `backend/src/pricing.js` | Tiers, limits, prompt char limits |
| Packager | `backend/src/packager.js` | In-memory zip build (JSZip) |
| Database schema | `backend/schema.sql` | users, purchases, site_briefs, site_image_assets, analysis_usage (plain Postgres) |
| QA module | `backend/src/qa/index.js` | Playwright render + axe-core + banned text + vision critic |
| Studio route | `src/routes/_authenticated/studio.tsx` | Loads Forge workspace, sync state, account slot |
| Infrastructure | `backend/src/infra/db.js`, `infra/storage.js`, `infra/auth.js` | pg DB, Replit Object Storage, Replit Auth headers |

## Test Coverage

149 tests across 12 test files, 0 failures.

## Locked Design Decisions (Do Not Revisit Without Discussion)

1. **Spec-driven rendering**: All output derives from `site.spec.json` — no ad-hoc templates.
2. **Static HTML output**: Delivered zips contain plain HTML/CSS/JS, no build step required.
3. **No stock portraits**: Team sections use illustration or avoid faces; no hotlinking.
4. **Unsplash→Pexels fallback**: If Unsplash fails, try Pexels; both use API keys, no direct image URLs in HTML.
5. **Banned phrases**: lorem ipsum, click here, unlock, seamless, revolutionary, game changer, template placeholders (`{{ }}`, `[insert]`).
6. **Hero heading ≤ 9 words**: Enforced in builder.
7. **Free tier limit**: 5 analyses per day per user.
8. **Preview in sandboxed iframe**: Generated sites preview isolated from studio.
9. **Ownership enforced in code**: Every query filters by `req.user.id`; returns 404 for other users' rows. No RLS.
10. **No secrets in browser code**: API keys stay behind backend routes + environment variables.

## Remaining Items (Post-Phase 8)

- Stripe payments require a paid plan or user's own Stripe key
- `.env` must be populated with `DATABASE_URL`, `OPENROUTER_API_KEY`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` before running `backend/src/server.js`
- QA render gate (Phase 7) code is complete; actual rendering needs Chromium/Playwright installed (skipped gracefully when unavailable)
- Studio UI (Phase 9) route exists and loads the Forge workspace; Supabase/Lovable-integrated files (`forge-cloud.ts`, `forge-ai.server.ts`, `studio.tsx`) are Lovable-managed per AGENTS.md — do not edit by hand
- Live acceptance (Phase 10) not yet run (requires `.env` secrets + live server)

## Phase Status

| Phase | Status |
|-------|--------|
| 0–6 | Pass |
| 7 | Code complete (Chromium-graceful; rendered QA needs browser deps) |
| 8 | Implemented (149 tests pass) |
| 9 | Route exists; Supabase/Lovable-managed per AGENTS.md |
| 10 | Not run (requires `.env` secrets + live server) |
