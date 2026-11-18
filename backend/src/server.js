// Forge AI backend: Replit-native.
// Auth via Replit headers; DB via plain Postgres; storage via Replit Object Storage.
import express from "express";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import multer from "multer";
import sharp from "sharp";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";

import { loadConfig } from "./config.js";
import { createJobRunner } from "./jobs.js";
import { createMultiProviderChat } from "./ai-client.js";
import { OrderError, validateOrder } from "./orders.js";
import { ARCHETYPES } from "./archetypes.js";
import { TIERS } from "./pricing.js";
import { query, transaction } from "./infra/db.js";
import { put as storagePut, get as storageGet, remove as storageRemove } from "./infra/storage.js";
import { requireUser } from "./infra/auth.js";
import { createAnalyzer } from "./site/analyze.js";
import { buildSite } from "./site/build.js";
import { validateByType, validateSocialKit, validateWorkflow, validateSpreadsheet } from "./qa/validator.js";
import { buildWorkbook, workbookToBuffer, createDefaultWorkbook } from "./spreadsheet.js";
import { createSocialKit } from "./social-kit.js";
import { createWorkflow } from "./workflow.js";
import { getProjectTemplates, getProjectTemplate } from "./project-templates.js";
import { getTemplates, getTemplate } from "./templates.js";
import { createAppSpec } from "./app-generator.js";
import { runQA } from "./qa/index.js";
import { validateSpec } from "./site/spec.js";
import { createUnsplashProvider } from "./images/unsplash.js";
import { createPexelsProvider } from "./images/pexels.js";
import { isPrivateAddress, processImageUrl } from "./images/resolve.js";
import JSZip from "jszip";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const PURCHASE_FIELDS =
  "id, user_id, email, type, tier, prompt, amount_cents, status, progress, progress_message, project_name, file_count, error, license_key, stripe_session_id, storage_path, brief_id, qa_status, qa_report_key, created_at, updated_at";

const UPLOAD_KEY_RE = /^[a-zA-Z0-9_.\-~]+$/;

function safeSlot(slot) {
  return /^[a-zA-Z0-9_.\-]+$/.test(slot) ? slot : null;
}

function contentTypeFromExt(filename) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".txt": "text/plain",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".zip": "application/zip",
  };
  return types[ext] || "application/octet-stream";
}

function isImageMagic(buffer) {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }
  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export function createApp({ config, db, stripe, jobs, chat, analyzer, unsplash, pexels }) {
  const app = express();
  const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
  app.use('/api/', apiLimiter);
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    if (req.url.includes("..")) {
      return res.status(400).json({ error: "Invalid path." });
    }
    next();
  });

  const rawJson = express.raw({ type: "application/json", limit: "1mb" });
  const handleStripeWebhook = async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Payments are not configured." });
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        config.stripeWebhookSecret,
      );
    } catch (err) {
      return res.status(400).json({ error: `Webhook signature check failed: ${err.message}` });
    }
    try {
      const session = event.data.object;
      const purchaseId = session?.metadata?.purchase_id;
      if (
        purchaseId &&
        (event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded") &&
        session.payment_status === "paid"
      ) {
        const rows = await db.query(
          `update purchases
           set status = 'queued', progress_message = 'Payment received'
           where id = $1 and status = 'pending'
           returning id`,
          [purchaseId],
        );
        if (rows[0]) jobs.enqueue(rows[0].id);
      } else if (purchaseId && event.type === "checkout.session.expired") {
        await db.query(
          `update purchases set status = 'cancelled' where id = $1 and status = 'pending'`,
          [purchaseId],
        );
      }
      res.json({ received: true });
    } catch (err) {
      console.error("[webhook] failed", err);
      res.status(500).json({ error: "Webhook processing failed." });
    }
  };

  app.post("/api/stripe/webhook", rawJson, handleStripeWebhook);
  app.post("/webhook", rawJson, handleStripeWebhook);

  app.use(express.json({ limit: "64kb" }));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
      console.error("[api]", err);
      res.status(500).json({ error: "Something went wrong. Try again." });
    }
  };

  app.get("/health", async (_req, res) => {
    let dbOk = false;
    try {
      await db.query("select 1");
      dbOk = true;
    } catch (e) {
      dbOk = false;
    }
    res.json({
      ok: true,
      db: dbOk,
      payments: Boolean(stripe),
      freeGeneration: config.allowFreeGeneration,
      jobs: jobs.size,
      aiProviders: config.aiProviders || [],
    });
  });

  app.get("/api/catalog", (_req, res) => {
    res.json({
      types: Object.entries(ARCHETYPES).map(([id, a]) => ({ id, label: a.label })),
      tiers: Object.entries(TIERS).map(([id, t]) => ({
        id,
        label: t.label,
        priceCents: t.priceCents,
        maxFiles: t.maxFiles,
      })),
    });
  });

  // ---------- Site brief routes ----------

  app.post(
    "/api/site/analyze",
    requireUser,
    handle(async (req, res) => {
      const { description, businessName, industry, location, brandColors } = req.body || {};

      if (!businessName || typeof businessName !== "string" || businessName.trim().length === 0) {
        return res.status(400).json({ error: "businessName is required." });
      }
      if (!description || typeof description !== "string" || description.trim().length < 20) {
        return res
          .status(400)
          .json({ error: "description must be at least 20 characters." });
      }
      if (brandColors && Array.isArray(brandColors)) {
        if (brandColors.length > 6) {
          return res.status(400).json({ error: "brandColors accepts at most 6 entries." });
        }
        const hexRe = /^#[0-9a-fA-F]{6}$/;
        for (const c of brandColors) {
          if (typeof c !== "string" || !hexRe.test(c)) {
            return res.status(400).json({ error: "brandColors must be hex colors (#rrggbb)." });
          }
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const usageRows = await db.query(
        `select count from analysis_usage where user_id = $1 and day = $2`,
        [req.user.id, today],
      );
      const count = usageRows[0]?.count ?? 0;
      if (count >= config.analysisDailyLimit) {
        return res.status(429).json({
          error: "Daily analysis limit reached. Try again tomorrow.",
        });
      }

      const modelChat = chat ?? createMultiProviderChat({ referer: config.frontendUrl });
      const modelAnalyzer = analyzer ?? createAnalyzer({
        chat: modelChat,
        modelAnalysis: config.modelAnalysis,
        modelSpec: config.modelSpec,
        modelCopy: config.modelCopy,
      });

      const input = { description, businessName, industry, location, brandColors };
      const { analysis, spec } = await modelAnalyzer.run(input);

      let briefId;
      const briefRows = await db.query(
        `insert into site_briefs (user_id, input, analysis, spec)
         values ($1, $2, $3, $4)
         returning id`,
        [req.user.id, JSON.stringify(input), JSON.stringify(analysis), JSON.stringify(spec)],
      );
      briefId = briefRows[0].id;

      await db.query(
        `insert into analysis_usage (user_id, day, count)
         values ($1, $2, 1)
         on conflict (user_id, day) do update set count = analysis_usage.count + 1`,
        [req.user.id, today],
      );

      res.json({ briefId, plan: spec });
    }),
  );

  app.get(
    "/api/site/briefs/:id",
    requireUser,
    handle(async (req, res) => {
      const rows = await db.query(
        `select id, input, analysis, spec from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Brief not found." });

      const imageRows = await db.query(
        `select slot_id, source, credit from site_image_assets where brief_id = $1 order by slot_id`,
        [req.params.id],
      );

      res.json({
        briefId: rows[0].id,
        analysis: rows[0].analysis,
        spec: rows[0].spec,
        images: imageRows.map((r) => ({ slot_id: r.slot_id, source: r.source, credit: r.credit })),
      });
    }),
  );

  app.patch(
    "/api/site/briefs/:id",
    requireUser,
    handle(async (req, res) => {
      const rows = await db.query(
        `select spec from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Brief not found." });

      const storedSpec = rows[0].spec;
      const updates = req.body || {};

      const allowedRootKeys = new Set(["unknowns", "meta", "brief", "design", "pages"]);
      const allowedPaletteKeys = new Set(["bg", "surface", "ink", "muted", "brand", "accent"]);
      const allowedMetaKeys = new Set(["businessName", "tagline", "industry", "locale", "description"]);
      const allowedBriefKeys = new Set(["offer", "audience", "primaryAction", "tone", "avoid"]);
      const allowedSectionKeys = new Set(["variant", "content", "type"]);

      const errors = [];

      for (const key of Object.keys(updates)) {
        if (!allowedRootKeys.has(key)) {
          errors.push(`spec.${key} is not a permitted edit.`);
        }
      }

      function rejectUnknownKeys(obj, path, allowed) {
        for (const key of Object.keys(obj)) {
          if (!allowed.has(key)) {
            errors.push(`${path}.${key} is not a permitted edit.`);
          }
        }
      }

      if (updates.unknowns !== undefined) {
        if (!Array.isArray(updates.unknowns) || !updates.unknowns.every((u) => typeof u === "string")) {
          errors.push("unknowns must be an array of strings.");
        } else {
          storedSpec.unknowns = updates.unknowns;
        }
      }

      if (updates.meta !== undefined) {
        rejectUnknownKeys(updates.meta, "spec.meta", allowedMetaKeys);
        storedSpec.meta = { ...storedSpec.meta, ...updates.meta };
      }

      if (updates.brief !== undefined) {
        rejectUnknownKeys(updates.brief, "spec.brief", allowedBriefKeys);
        storedSpec.brief = { ...storedSpec.brief, ...updates.brief };
      }

      if (updates.design !== undefined) {
        rejectUnknownKeys(updates.design, "spec.design", new Set(["palette", "fonts", "radius", "density", "motion", "imageStyle"]));
        if (updates.design.palette !== undefined) {
          rejectUnknownKeys(updates.design.palette, "spec.design.palette", allowedPaletteKeys);
          storedSpec.design.palette = { ...storedSpec.design.palette, ...updates.design.palette };
        }
        for (const k of ["fonts", "radius", "density", "motion", "imageStyle"]) {
          if (updates.design[k] !== undefined) {
            storedSpec.design[k] = updates.design[k];
          }
        }
      }

      if (updates.pages !== undefined) {
        if (!Array.isArray(updates.pages)) {
          errors.push("pages must be an array.");
        } else {
          storedSpec.pages = updates.pages.map((page) => {
            rejectUnknownKeys(page, "spec.pages[]", new Set(["slug", "title", "description", "sections"]));
            if (Array.isArray(page.sections)) {
              page.sections = page.sections.map((section) => {
                rejectUnknownKeys(section, "spec.pages[].sections[]", allowedSectionKeys);
                return { ...section, variant: section.variant, type: section.type, content: section.content };
              });
            }
            return page;
          });
        }
      }

      if (errors.length) {
        return res.status(422).json({ error: "Invalid spec update.", errors });
      }

      const result = validateSpec(storedSpec);
      if (!result.ok) {
        return res.status(422).json({ error: "Spec validation failed.", errors: result.errors });
      }

      await db.query(
        `update site_briefs set spec = $1, updated_at = now() where id = $2 and user_id = $3`,
        [JSON.stringify(storedSpec), req.params.id, req.user.id],
      );

      res.json({ briefId: req.params.id, spec: storedSpec });
    }),
  );

  app.post(
    "/api/site/briefs/:id/images/:slot",
    requireUser,
    upload.single("file"),
    handle(async (req, res) => {
      const slot = safeSlot(req.params.slot);
      if (!slot) return res.status(400).json({ error: "Invalid slot name." });

      const briefRows = await db.query(
        `select id, spec from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!briefRows[0]) return res.status(404).json({ error: "Brief not found." });

      if (!req.file) return res.status(400).json({ error: "No file uploaded." });
      if (req.file.size > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: "File exceeds 10 MB limit." });
      }

      const format = isImageMagic(req.file.buffer);
      if (!format) {
        return res.status(400).json({ error: "File must be a JPEG, PNG, or WebP image." });
      }

      const processed = await sharp(req.file.buffer)
        .resize({ width: 2000, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();

      const storageKey = `briefs/${req.params.id}/${slot}.jpg`;
      await storagePut(storageKey, processed, "image/jpeg");

      await db.query(
        `insert into site_image_assets (brief_id, slot_id, source, storage_key, credit)
         values ($1, $2, 'upload', $3, $4)
         on conflict (brief_id, slot_id) do update set source = 'upload', storage_key = $3, credit = $4, created_at = now()`,
        [req.params.id, slot, storageKey, JSON.stringify({ provider: "customer", photographer: "Provided by customer", license: "Customer upload" })],
      );

      jobs.enqueueRebuild(req.params.id);

      res.status(201).json({ briefId: req.params.id, slot, source: "upload", storageKey });
    }),
  );

  app.post(
    "/api/site/briefs/:id/images/:slot/search",
    requireUser,
    handle(async (req, res) => {
      const slot = safeSlot(req.params.slot);
      if (!slot) return res.status(400).json({ error: "Invalid slot name." });
      const { query: searchQuery } = req.body || {};
      if (!searchQuery || typeof searchQuery !== "string") {
        return res.status(400).json({ error: "query is required." });
      }

      const briefRows = await db.query(
        `select spec from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!briefRows[0]) return res.status(404).json({ error: "Brief not found." });

      const unsplashProvider = unsplash ?? createUnsplashProvider({ accessKey: process.env.UNSPLASH_ACCESS_KEY });
      const pexelsProvider = pexels ?? createPexelsProvider({ accessKey: process.env.PEXELS_API_KEY });

      const slotSpec = briefRows[0].spec.images?.find((i) => i.id === slot);
      if (!slotSpec) return res.status(404).json({ error: "Slot not found in spec." });

      const { resolveAndDownload } = await import("./images/resolve.js");
      const result = await resolveAndDownload({
        slot: { ...slotSpec, query: searchQuery },
        destPath: `/tmp/${req.params.id}-${slot}.jpg`,
        unsplash: unsplashProvider,
        pexels: pexelsProvider,
      });

      if (!result.filePath) {
        return res.status(422).json({ error: "No usable stock image found.", error: result.error });
      }

      const buffer = await import("node:fs/promises").then((fs) => fs.readFile(result.filePath));
      const storageKey = `briefs/${req.params.id}/${slot}.jpg`;
      await storagePut(storageKey, buffer, "image/jpeg");

      await db.query(
        `insert into site_image_assets (brief_id, slot_id, source, storage_key, credit)
         values ($1, $2, 'stock', $3, $4)
         on conflict (brief_id, slot_id) do update set source = 'stock', storage_key = $3, credit = $4, created_at = now()`,
        [req.params.id, slot, storageKey, JSON.stringify(result.credit)],
      );

      jobs.enqueueRebuild(req.params.id);

      res.json({ briefId: req.params.id, slot, source: "stock", credit: result.credit });
    }),
  );

  app.post(
    "/api/site/briefs/:id/images/:slot/url",
    requireUser,
    handle(async (req, res) => {
      const slot = safeSlot(req.params.slot);
      if (!slot) return res.status(400).json({ error: "Invalid slot name." });
      const { url } = req.body || {};
      if (!url || typeof url !== "string") return res.status(400).json({ error: "url is required." });

      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL." });
      }
      if (parsed.protocol !== "https:") {
        return res.status(400).json({ error: "URL must use https." });
      }

      if (isPrivateAddress(parsed.hostname)) {
        return res.status(400).json({ error: "Private, loopback, or link-local addresses are not allowed." });
      }

      const briefRows = await db.query(
        `select spec from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!briefRows[0]) return res.status(404).json({ error: "Brief not found." });

      try {
        const result = await processImageUrl(url, `/tmp/${req.params.id}-${slot}.jpg`);
        const buffer = await import("node:fs/promises").then((fs) => fs.readFile(result.filePath));
        const storageKey = `briefs/${req.params.id}/${slot}.jpg`;
        await storagePut(storageKey, buffer, "image/jpeg");

        await db.query(
          `insert into site_image_assets (brief_id, slot_id, source, storage_key, credit)
           values ($1, $2, 'url', $3, $4)
           on conflict (brief_id, slot_id) do update set source = 'url', storage_key = $3, credit = $4, created_at = now()`,
          [req.params.id, slot, storageKey, JSON.stringify(result.credit)],
        );

        jobs.enqueueRebuild(req.params.id);

        res.json({ briefId: req.params.id, slot, source: "url", credit: result.credit });
      } catch (err) {
        return res.status(422).json({ error: err.message || "Failed to fetch image." });
      }
    }),
  );

  app.delete(
    "/api/site/briefs/:id/images/:slot",
    requireUser,
    handle(async (req, res) => {
      const slot = safeSlot(req.params.slot);
      if (!slot) return res.status(400).json({ error: "Invalid slot name." });

      const briefRows = await db.query(
        `select id from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!briefRows[0]) return res.status(404).json({ error: "Brief not found." });

      const assetRows = await db.query(
        `select storage_key from site_image_assets where brief_id = $1 and slot_id = $2`,
        [req.params.id, slot],
      );
      if (assetRows[0]) {
        await storageRemove(assetRows[0].storage_key).catch(() => {});
        await db.query(
          `delete from site_image_assets where brief_id = $1 and slot_id = $2`,
          [req.params.id, slot],
        );
      }

      // Revert to stock search for this slot during next rebuild.
      jobs.enqueueRebuild(req.params.id);

      res.json({ briefId: req.params.id, slot, source: "stock" });
    }),
  );

  app.get(
    "/api/purchases/:id/preview/*",
    requireUser,
    handle(async (req, res) => {
      if (req.path.includes("..")) {
        return res.status(400).json({ error: "Invalid path." });
      }
      let filePath = req.params[0];
      if (!filePath || filePath.startsWith("/")) {
        return res.status(400).json({ error: "Invalid path." });
      }

      const rows = await db.query(
        `select storage_path from purchases where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!rows[0] || !rows[0].storage_path) {
        return res.status(404).json({ error: "Purchase not found or not ready." });
      }

      const obj = await storageGet(rows[0].storage_path);
      if (!obj) return res.status(404).json({ error: "Purchase file not found." });

      const zip = await JSZip.loadAsync(obj.buffer);
      const entry = zip.file(filePath);
      if (!entry) return res.status(404).json({ error: "File not found in package." });

      const content = await entry.async("nodebuffer");
      res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", contentTypeFromExt(filePath));
      res.send(content);
    }),
  );

  // ---------- Checkout with optional briefId ----------

  app.post(
    "/api/checkout",
    requireUser,
    handle(async (req, res) => {
      if (!stripe) return res.status(503).json({ error: "Payments are not set up yet." });

      let briefId = null;
      if (req.body.briefId) {
        const rows = await db.query(
          `select spec from site_briefs where id = $1 and user_id = $2`,
          [req.body.briefId, req.user.id],
        );
        if (!rows[0]) return res.status(404).json({ error: "Brief not found." });
        const result = validateSpec(rows[0].spec);
        if (!result.ok) {
          return res.status(422).json({ error: "Brief spec is invalid.", errors: result.errors });
        }
        briefId = req.body.briefId;
      }

      const order = validateOrder(req.body);
      const rows = await db.query(
        `insert into purchases (user_id, email, type, tier, prompt, amount_cents, status, brief_id)
         values ($1, $2, $3, $4, $5, $6, 'pending', $7)
         returning id`,
        [req.user.id, req.user.email ?? "", order.type, order.tier, order.prompt, order.amountCents, briefId],
      );
      const purchase = rows[0];

      const tier = TIERS[order.tier];
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        managed_payments: { enabled: false },
        customer_email: req.user.email,
        client_reference_id: purchase.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: order.amountCents,
              product_data: { name: `Forge AI ${ARCHETYPES[order.type].label} — ${tier.label}` },
            },
          },
        ],
        metadata: { purchase_id: purchase.id, user_id: req.user.id },
        success_url: `${config.frontendUrl}/purchases?purchase=${purchase.id}&paid=1`,
        cancel_url: `${config.frontendUrl}/purchases?purchase=${purchase.id}&cancelled=1`,
      });
      await db.query(`update purchases set stripe_session_id = $1 where id = $2`, [session.id, purchase.id]);
      res.json({ url: session.url, purchaseId: purchase.id });
    }),
  );

  app.post(
    "/api/generate-free",
    requireUser,
    handle(async (req, res) => {
      if (!config.allowFreeGeneration) return res.status(403).json({ error: "Free generation is turned off." });

      let briefId = null;
      if (req.body.briefId) {
        const rows = await db.query(
          `select spec from site_briefs where id = $1 and user_id = $2`,
          [req.body.briefId, req.user.id],
        );
        if (!rows[0]) return res.status(404).json({ error: "Brief not found." });
        const result = validateSpec(rows[0].spec);
        if (!result.ok) {
          return res.status(422).json({ error: "Brief spec is invalid.", errors: result.errors });
        }
        briefId = req.body.briefId;
      }

      const order = validateOrder(req.body);
      const rows = await db.query(
        `insert into purchases (user_id, email, type, tier, prompt, amount_cents, status, brief_id)
         values ($1, $2, $3, $4, $5, $6, 'queued', $7)
         returning id`,
        [req.user.id, req.user.email ?? "", order.type, order.tier, order.prompt, order.amountCents, briefId],
      );
      const purchase = rows[0];
      jobs.enqueue(purchase.id);
      res.status(202).json({ purchaseId: purchase.id });
    }),
  );

  app.get(
    "/api/purchases",
    requireUser,
    handle(async (req, res) => {
      const rows = await db.query(
        `select ${PURCHASE_FIELDS} from purchases where user_id = $1 order by created_at desc limit 100`,
        [req.user.id],
      );
      res.json({ purchases: rows });
    }),
  );

  app.get(
    "/api/purchases/:id",
    requireUser,
    handle(async (req, res) => {
      const rows = await db.query(
        `select ${PURCHASE_FIELDS} from purchases where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Purchase not found." });
      res.json({ purchase: rows[0] });
    }),
  );

  app.get(
    "/api/purchases/:id/download",
    requireUser,
    handle(async (req, res) => {
      const rows = await db.query(
        `select status, storage_path from purchases where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Purchase not found." });
      if (rows[0].status !== "ready" || !rows[0].storage_path) {
        return res.status(409).json({ error: "Your project is not ready yet." });
      }
      const obj = await storageGet(rows[0].storage_path);
      if (!obj) return res.status(404).json({ error: "Purchase file not found." });
      res.setHeader("Content-Disposition", `attachment; filename="${rows[0].id}.zip"`);
      res.setHeader("Content-Type", "application/zip");
      res.send(obj.buffer);
    }),
  );

  // ---------- Profile ----------

  async function ensureUser(id, name, email) {
    await db.query(
      `insert into users (id, name, email) values ($1, $2, $3)
       on conflict (id) do update set name = coalesce($2, users.name), email = coalesce($3, users.email)`,
      [id, name || null, email || null],
    );
  }

  app.get(
    "/api/users/me",
    requireUser,
    handle(async (req, res) => {
      const { id, name } = req.user;
      const email = req.headers["x-replit-user-email"] || undefined;
      await ensureUser(id, name, email);
      const rows = await db.query(`select id, name, email, created_at from users where id = $1`, [id]);
      res.json({ user: rows[0] });
    }),
  );

  app.patch(
    "/api/users/me",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.user;
      const { name, email } = req.body || {};
      const updates = [];
      const params = [];
      if (name !== undefined) {
        updates.push(`name = $${updates.length + 2}`);
        params.push(name);
      }
      if (email !== undefined) {
        updates.push(`email = $${updates.length + 2}`);
        params.push(email);
      }
      if (updates.length === 0) return res.status(400).json({ error: "Nothing to update." });
      params.push(id);
      await db.query(`update users set ${updates.join(", ")} where id = $${updates.length + 1}`, params);
      const rows = await db.query(`select id, name, email, created_at from users where id = $1`, [id]);
      res.json({ user: rows[0] });
    }),
  );

  // ---------- Projects ----------

  app.get(
    "/api/projects",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const search = req.query.q;
      let sql = `select id, name, stage, data, updated_at, share_token, visibility, type, version, created_at from projects where user_id = $1`;
      const params = [req.user.id];
      if (search && typeof search === "string") {
        sql += ` and (name ilike $2 or stage ilike $2)`;
        params.push(`%${search}%`);
      }
      sql += ` order by updated_at desc`;
      const rows = await db.query(sql, params);
      res.json({ projects: rows.map((r) => ({ id: r.id, name: r.name, stage: r.stage, data: r.data, updated_at: r.updated_at })) });
    }),
  );

  app.post(
    "/api/projects",
    requireUser,
    handle(async (req, res) => {
      const { id, name, stage, data } = req.body || {};
      if (!id || typeof id !== "string") return res.status(400).json({ error: "project id is required." });
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const row = await db.query(
        `insert into projects (id, user_id, name, stage, data) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set name = $3, stage = $4, data = $5, updated_at = now()
         returning id, name, stage, data, updated_at`,
        [id, req.user.id, name || "Untitled project", stage || "", data || {}],
      );
      res.json({ project: row[0] });
    }),
  );

  app.patch(
    "/api/projects/:id",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { name, stage, data } = req.body || {};
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const updates = [];
      const params = [];
      if (name !== undefined) { updates.push(`name = $${updates.length + 2}`); params.push(name); }
      if (stage !== undefined) { updates.push(`stage = $${updates.length + 2}`); params.push(stage); }
      if (data !== undefined) { updates.push(`data = $${updates.length + 2}`); params.push(data); }
      if (updates.length === 0) return res.status(400).json({ error: "Nothing to update." });
      params.push(id);
      const rows = await db.query(
        `update projects set ${updates.join(", ")} where id = $1 and user_id = $2 returning id, name, stage, data, updated_at`,
        [id, req.user.id, ...params.slice(updates.length)],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ project: rows[0] });
    }),
  );

  app.delete(
    "/api/projects/:id",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(`delete from projects where id = $1 and user_id = $2 returning id`, [id, req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ deleted: true });
    }),
  );

  // ---------- Project sharing & versioning ----------

  app.post(
    "/api/projects/:id/share",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { visibility } = req.body || {};
      const vis = visibility === "public" ? "public" : "unlisted";
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const token = crypto.randomUUID().replace(/-/g, "");
      const rows = await db.query(
        `update projects set share_token = $1, visibility = $2, updated_at = now()
         where id = $3 and user_id = $4 returning id, name, share_token, visibility`,
        [token, vis, id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ project: rows[0], shareUrl: `/share/${token}` });
    }),
  );

  app.delete(
    "/api/projects/:id/share",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `update projects set share_token = null, visibility = 'private', updated_at = now()
         where id = $1 and user_id = $2 returning id`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ revoked: true });
    }),
  );

  app.get(
    "/api/projects/:id/versions",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const owner = await db.query(`select id from projects where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Project not found." });
      const rows = await db.query(
        `select id, version_number, name, stage, created_at from project_versions where project_id = $1 order by version_number desc`,
        [id],
      );
      res.json({ versions: rows });
    }),
  );

  app.post(
    "/api/projects/:id/versions",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `select name, stage, data, version from projects where id = $1 and user_id = $2`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      const proj = rows[0];
      const nextVer = (proj.version || 1) + 1;
      const vrow = await db.query(
        `insert into project_versions (project_id, version_number, name, stage, data) values ($1, $2, $3, $4, $5) returning id, version_number, created_at`,
        [id, proj.version || 1, proj.name, proj.stage, JSON.stringify(proj.data)],
      );
      await db.query(`update projects set version = $1 where id = $2`, [nextVer, id]);
      res.status(201).json({ version: vrow[0] });
    }),
  );

  app.post(
    "/api/projects/:id/versions/:version/restore",
    requireUser,
    handle(async (req, res) => {
      const { id, version } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const vrows = await db.query(
        `select name, stage, data from project_versions where project_id = $1 and version_number = $2`,
        [id, parseInt(version, 10)],
      );
      if (!vrows[0]) return res.status(404).json({ error: "Version not found." });
      const v = vrows[0];
      const rows = await db.query(
        `update projects set name = $1, stage = $2, data = $3, updated_at = now() where id = $4 and user_id = $5 returning id, name, stage, data, updated_at`,
        [v.name, v.stage, JSON.stringify(v.data), id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ project: rows[0] });
    }),
  );

  // Public share view (no auth required)
  app.get(
    "/api/share/:token",
    handle(async (req, res) => {
      const rows = await db.query(
        `select id, name, stage, data, visibility, updated_at from projects where share_token = $1`,
        [req.params.token],
      );
      if (!rows[0]) return res.status(404).json({ error: "Shared project not found." });
      if (rows[0].visibility === "private") return res.status(403).json({ error: "This project is private." });
      res.json({ project: rows[0] });
    }),
  );

  // ---------- Spreadsheet generation ----------

  app.post(
    "/api/spreadsheet/generate",
    requireUser,
    handle(async (req, res) => {
      const { name, businessName } = req.body || {};
      const bn = businessName || name || "Business";
      const def = createDefaultWorkbook(bn);
      const wb = await buildWorkbook(def);
      const buffer = await workbookToBuffer(wb);
      const storagePath = `${req.user.id}/spreadsheet-${Date.now()}.xlsx`;
      await storagePut(storagePath, Buffer.from(buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.json({ storagePath, fileName: `${bn.replace(/[^a-z0-9]/gi, "_")}.xlsx`, sheets: def.sheets.map((s) => s.name) });
    }),
  );

  app.get(
    "/api/spreadsheet/download/:key",
    requireUser,
    handle(async (req, res) => {
      const key = decodeURIComponent(req.params.key);
      const obj = await storageGet(key);
      if (!obj) return res.status(404).json({ error: "File not found." });
      res.setHeader("Content-Disposition", `attachment; filename="workbook.xlsx"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(obj.buffer);
    }),
  );

  // ---------- Social media kit generation ----------

  app.post(
    "/api/social-kit/generate",
    requireUser,
    handle(async (req, res) => {
      const { businessName, industry, description, tone } = req.body || {};
      if (!businessName || typeof businessName !== "string") {
        return res.status(400).json({ error: "businessName is required." });
      }
      const kit = createSocialKit({ businessName, industry, description, tone });
      const storagePath = `${req.user.id}/social-kit-${Date.now()}.json`;
      await storagePut(storagePath, Buffer.from(JSON.stringify(kit, null, 2)), "application/json");
      res.json({ kit, storagePath });
    }),
  );

  // ---------- Workflow generation ----------

  app.post(
    "/api/workflow/generate",
    requireUser,
    handle(async (req, res) => {
      const { name, description, steps } = req.body || {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name is required." });
      }
      const workflow = createWorkflow({ name, description, steps });
      const storagePath = `${req.user.id}/workflow-${Date.now()}.json`;
      await storagePut(storagePath, Buffer.from(JSON.stringify(workflow, null, 2)), "application/json");
      res.json({ workflow, storagePath });
    }),
  );

  // ---------- Revision system ----------

  app.post(
    "/api/projects/:id/revise",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { instruction } = req.body || {};
      if (!instruction || typeof instruction !== "string") {
        return res.status(400).json({ error: "instruction is required." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      // Save current version first
      const rows = await db.query(
        `select name, stage, data, version from projects where id = $1 and user_id = $2`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      const proj = rows[0];
      const currentVer = proj.version || 1;
      await db.query(
        `insert into project_versions (project_id, version_number, name, stage, data) values ($1, $2, $3, $4, $5)`,
        [id, currentVer, proj.name, proj.stage, JSON.stringify(proj.data)],
      );
      const revisedData = { ...proj.data, _lastRevision: instruction, _revisedAt: new Date().toISOString() };
      const newVer = currentVer + 1;
      await db.query(
        `update projects set data = $1, version = $2, updated_at = now() where id = $3 and user_id = $4`,
        [JSON.stringify(revisedData), newVer, id, req.user.id],
      );
      res.json({ projectId: id, newVersion: newVer, instruction });
    }),
  );

  // ---------- QA validation ----------

  app.post(
    "/api/qa/validate",
    requireUser,
    handle(async (req, res) => {
      const { type, data } = req.body || {};
      if (!type) return res.status(400).json({ error: "type is required." });
      let result;
      if (type === "social-kit") result = validateSocialKit(data);
      else if (type === "workflow") result = validateWorkflow(data);
      else if (type === "spreadsheet") result = validateSpreadsheet(Buffer.from(data, "base64"));
      else result = validateByType(type, data);
      res.json(result);
    }),
  );

  // ---------- Custom app generation ----------

  app.post(
    "/api/app/generate",
    requireUser,
    handle(async (req, res) => {
      const { name, description, entities, features } = req.body || {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name is required." });
      }
      const appSpec = createAppSpec({ name, description, entities, features });
      const zip = await (await import("jszip")).default().generateAsync({ type: "nodebuffer" });
      // Build zip manually
      const JSZip = (await import("jszip")).default;
      const z = new JSZip();
      for (const [path, content] of Object.entries(appSpec.files)) {
        z.file(path, content);
      }
      const buffer = await z.generateAsync({ type: "nodebuffer" });
      const storagePath = `${req.user.id}/app-${Date.now()}.zip`;
      await storagePut(storagePath, buffer, "application/zip");
      res.json({ storagePath, fileName: `${name.replace(/[^a-z0-9]/gi, "_")}.zip`, files: Object.keys(appSpec.files) });
    }),
  );

  // ---------- Generic artifact download ----------

  app.get(
    "/api/artifacts/download",
    requireUser,
    handle(async (req, res) => {
      const key = req.query.key;
      if (!key || typeof key !== "string") return res.status(400).json({ error: "key is required." });
      // Ensure the key belongs to this user
      if (!key.startsWith(req.user.id + "/")) return res.status(403).json({ error: "Access denied." });
      const obj = await storageGet(key);
      if (!obj) return res.status(404).json({ error: "Artifact not found." });
      const ext = key.split(".").pop();
      const ct = ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : ext === "zip" ? "application/zip"
        : ext === "json" ? "application/json"
        : "application/octet-stream";
      res.setHeader("Content-Disposition", `attachment; filename="${key.split("/").pop()}"`);
      res.setHeader("Content-Type", ct);
      res.send(obj.buffer);
    }),
  );

  // ---------- Site publishing ----------

  app.post(
    "/api/site/publish/:briefId",
    requireUser,
    handle(async (req, res) => {
      const { briefId } = req.params;
      const rows = await db.query(
        `select id from site_briefs where id = $1 and user_id = $2`,
        [briefId, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Brief not found." });

      // Generate a stable published URL slug
      const brief = await db.query(`select spec from site_briefs where id = $1`, [briefId]);
      const spec = brief[0]?.spec || {};
      const slug = (spec.meta?.businessName || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const publishedUrl = `/sites/${slug}-${briefId.slice(0, 8)}`;

      // Update the latest purchase for this brief
      await db.query(
        `update purchases set published_url = $1, published_at = now() where brief_id = $2 and user_id = $3`,
        [publishedUrl, briefId, req.user.id],
      );

      res.json({ publishedUrl, briefId });
    }),
  );

  app.get(
    "/api/site/published/:slug",
    handle(async (req, res) => {
      const rows = await db.query(
        `select sb.spec, sb.id from site_briefs sb
         join purchases p on p.brief_id = sb.id
         where p.published_url = $1`,
        [`/sites/${req.params.slug}`],
      );
      if (!rows[0]) return res.status(404).json({ error: "Published site not found." });
      res.json({ briefId: rows[0].id, spec: rows[0].spec });
    }),
  );

  // ---------- Project duplication ----------

  app.post(
    "/api/projects/:id/duplicate",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `select name, stage, data, type from projects where id = $1 and user_id = $2`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      const proj = rows[0];
      const newId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newRow = await db.query(
        `insert into projects (id, user_id, name, stage, data, type, version) values ($1, $2, $3, $4, $5, $6, 1) returning id, name, stage, data, updated_at, version`,
        [newId, req.user.id, `${proj.name} (copy)`, proj.stage, JSON.stringify(proj.data), proj.type],
      );
      res.status(201).json({ project: newRow[0] });
    }),
  );

  // ---------- Site preview (built HTML) ----------

  app.get(
    "/api/site/briefs/:id/preview",
    requireUser,
    handle(async (req, res) => {
      const rows = await db.query(
        `select spec from site_briefs where id = $1 and user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Brief not found." });
      const spec = rows[0].spec;
      // Return spec and a flag indicating preview is available
      res.json({ briefId: req.params.id, spec, previewAvailable: true });
    }),
  );

  // ---------- Project export (JSON) ----------

  app.get(
    "/api/projects/:id/export",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `select id, name, stage, data, type, version, created_at, updated_at from projects where id = $1 and user_id = $2`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      const proj = rows[0];
      const versions = await db.query(
        `select version_number, name, stage, created_at from project_versions where project_id = $1 order by version_number`,
        [id],
      );
      const exportData = { ...proj, versions, exportedAt: new Date().toISOString() };
      res.setHeader("Content-Disposition", `attachment; filename="${proj.name.replace(/[^a-z0-9]/gi, "_")}.json"`);
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(exportData, null, 2));
    }),
  );

  // ---------- Project import ----------

  app.post(
    "/api/projects/import",
    requireUser,
    handle(async (req, res) => {
      const { name, stage, data, type } = req.body || {};
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "name is required." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const newId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const row = await db.query(
        `insert into projects (id, user_id, name, stage, data, type, version) values ($1, $2, $3, $4, $5, $6, 1) returning id, name, stage, data, updated_at, version`,
        [newId, req.user.id, name, stage || "", data || {}, type || null],
      );
      res.status(201).json({ project: row[0] });
    }),
  );

  // ---------- Duplicate site brief ----------

  app.post(
    "/api/site/briefs/:id/duplicate",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const rows = await db.query(
        `select input, analysis, spec from site_briefs where id = $1 and user_id = $2`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Brief not found." });
      const brief = rows[0];
      const newRows = await db.query(
        `insert into site_briefs (user_id, input, analysis, spec) values ($1, $2, $3, $4) returning id`,
        [req.user.id, JSON.stringify(brief.input), JSON.stringify(brief.analysis), JSON.stringify(brief.spec)],
      );
      res.status(201).json({ briefId: newRows[0].id });
    }),
  );

  // ---------- Site status (comprehensive) ----------

  app.get(
    "/api/site/status/:briefId",
    requireUser,
    handle(async (req, res) => {
      const { briefId } = req.params;
      const briefRows = await db.query(
        `select id, created_at, updated_at from site_briefs where id = $1 and user_id = $2`,
        [briefId, req.user.id],
      );
      if (!briefRows[0]) return res.status(404).json({ error: "Brief not found." });
      const purchaseRows = await db.query(
        `select id, status, progress, progress_message, qa_status, qa_report_key, published_url, published_at, storage_path, file_count, project_name, error from purchases where brief_id = $1 and user_id = $2 order by created_at desc limit 1`,
        [briefId, req.user.id],
      );
      const p = purchaseRows[0] || {};
      res.json({
        briefId,
        createdAt: briefRows[0].created_at,
        updatedAt: briefRows[0].updated_at,
        generation: {
          status: p.status || "none",
          progress: p.progress || 0,
          message: p.progress_message || null,
          error: p.error || null,
          fileCount: p.file_count || null,
          projectName: p.project_name || null,
        },
        qa: {
          status: p.qa_status || null,
          reportKey: p.qa_report_key || null,
        },
        publishing: {
          url: p.published_url || null,
          publishedAt: p.published_at || null,
        },
        download: {
          available: p.status === "ready" && !!p.storage_path,
          storagePath: p.storage_path || null,
        },
      });
    }),
  );

  // ---------- Site templates ----------

  app.get("/api/site/templates", (_req, res) => {
    res.json({ templates: getTemplates() });
  });

  app.get("/api/site/templates/:id", (req, res) => {
    const t = getTemplate(req.params.id);
    if (!t) return res.status(404).json({ error: "Template not found." });
    res.json({ template: t });
  });

  // ---------- Project statistics ----------

  app.get(
    "/api/projects/stats",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const total = await db.query(`select count(*) as c from projects where user_id = $1`, [req.user.id]);
      const shared = await db.query(`select count(*) as c from projects where user_id = $1 and visibility != 'private'`, [req.user.id]);
      const byType = await db.query(`select type, count(*) as c from projects where user_id = $1 group by type`, [req.user.id]);
      const recent = await db.query(`select count(*) as c from projects where user_id = $1 and updated_at > now() - interval '7 days'`, [req.user.id]);
      res.json({
        total: parseInt(total[0]?.c || 0),
        shared: parseInt(shared[0]?.c || 0),
        recentWeek: parseInt(recent[0]?.c || 0),
        byType: byType.map((r) => ({ type: r.type, count: parseInt(r.c) })),
      });
    }),
  );

  // ---------- Export all user data (GDPR) ----------

  app.get(
    "/api/users/me/export",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const user = await db.query(`select id, name, email, created_at from users where id = $1`, [req.user.id]);
      const projects = await db.query(`select id, name, stage, data, type, version, created_at, updated_at from projects where user_id = $1`, [req.user.id]);
      const purchases = await db.query(`select id, type, tier, prompt, amount_cents, status, project_name, file_count, created_at from purchases where user_id = $1`, [req.user.id]);
      const briefs = await db.query(`select id, input, analysis, spec, created_at, updated_at from site_briefs where user_id = $1`, [req.user.id]);
      const exportData = {
        user: user[0],
        projects,
        purchases,
        briefs,
        exportedAt: new Date().toISOString(),
      };
      res.setHeader("Content-Disposition", `attachment; filename="forge-data-export.json"`);
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(exportData, null, 2));
    }),
  );

  // ---------- Delete account (GDPR) ----------

  app.delete(
    "/api/users/me",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.user;
      await ensureUser(id, req.user.name, req.headers["x-replit-user-email"]);
      // Delete all user data in order
      await db.query(`delete from project_versions where project_id in (select id from projects where user_id = $1)`, [id]);
      await db.query(`delete from projects where user_id = $1`, [id]);
      await db.query(`delete from site_image_assets where brief_id in (select id from site_briefs where user_id = $1)`, [id]);
      await db.query(`delete from site_briefs where user_id = $1`, [id]);
      await db.query(`delete from purchases where user_id = $1`, [id]);
      await db.query(`delete from analysis_usage where user_id = $1`, [id]);
      await db.query(`delete from audit_log where user_id = $1`, [id]);
      await db.query(`delete from users where id = $1`, [id]);
      res.json({ deleted: true });
    }),
  );

  // ---------- Rate limit status ----------

  app.get(
    "/api/rate-limit/status",
    requireUser,
    handle(async (req, res) => {
      res.json({
        windowMs: 15 * 60 * 1000,
        maxRequests: 200,
        message: "Rate limit: 200 requests per 15 minutes per IP.",
      });
    }),
  );

  // ---------- System status ----------

  app.get("/api/system/status", (_req, res) => {
    res.json({
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  });

  // ---------- Project comments ----------

  app.get(
    "/api/projects/:id/comments",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const owner = await db.query(`select id from projects where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Project not found." });
      const rows = await db.query(
        `select c.id, c.content, c.created_at, u.name, u.email from project_comments c join users u on u.id = c.user_id where c.project_id = $1 order by c.created_at asc`,
        [id],
      );
      res.json({ comments: rows });
    }),
  );

  app.post(
    "/api/projects/:id/comments",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { content } = req.body || {};
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "content is required." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const owner = await db.query(`select id from projects where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Project not found." });
      const row = await db.query(
        `insert into project_comments (project_id, user_id, content) values ($1, $2, $3) returning id, content, created_at`,
        [id, req.user.id, content.trim()],
      );
      res.status(201).json({ comment: row[0] });
    }),
  );

  // ---------- Toggle project favorite ----------

  app.patch(
    "/api/projects/:id/favorite",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { favorite } = req.body || {};
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `update projects set is_favorite = $1, updated_at = now() where id = $2 and user_id = $3 returning id, is_favorite`,
        [favorite !== false, id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ project: rows[0] });
    }),
  );

  // ---------- Notifications ----------

  app.get(
    "/api/notifications",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `select id, title, message, type, read, resource_type, resource_id, created_at from notifications where user_id = $1 order by created_at desc limit 50`,
        [req.user.id],
      );
      res.json({ notifications: rows });
    }),
  );

  app.patch(
    "/api/notifications/:id/read",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `update notifications set read = true where id = $1 and user_id = $2 returning id`,
        [id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Notification not found." });
      res.json({ read: true });
    }),
  );

  app.post(
    "/api/notifications/read-all",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      await db.query(`update notifications set read = true where user_id = $1`, [req.user.id]);
      res.json({ readAll: true });
    }),
  );

  // ---------- Project templates ----------

  app.get("/api/project-templates", (_req, res) => {
    res.json({ templates: getProjectTemplates() });
  });

  app.post(
    "/api/projects/from-template",
    requireUser,
    handle(async (req, res) => {
      const { templateId } = req.body || {};
      const tmpl = getProjectTemplate(templateId);
      if (!tmpl) return res.status(404).json({ error: "Template not found." });
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const newId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const row = await db.query(
        `insert into projects (id, user_id, name, stage, data, type, version) values ($1, $2, $3, $4, $5, $6, 1) returning id, name, stage, data, updated_at, version`,
        [newId, req.user.id, tmpl.name, tmpl.stage, JSON.stringify(tmpl.data), tmpl.type],
      );
      res.status(201).json({ project: row[0] });
    }),
  );

  // ---------- Archive project ----------

  app.patch(
    "/api/projects/:id/archive",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { archived } = req.body || {};
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `update projects set is_archived = $1, updated_at = now() where id = $2 and user_id = $3 returning id, is_archived`,
        [archived !== false, id, req.user.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Project not found." });
      res.json({ project: rows[0] });
    }),
  );

  // ---------- Feedback ----------

  app.post(
    "/api/feedback",
    requireUser,
    handle(async (req, res) => {
      const { type, content, page } = req.body || {};
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "content is required." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const row = await db.query(
        `insert into feedback (user_id, type, content, page) values ($1, $2, $3, $4) returning id, created_at`,
        [req.user.id, type || "general", content.trim(), page || null],
      );
      res.status(201).json({ feedback: row[0] });
    }),
  );

  // ---------- Search published sites ----------

  app.get(
    "/api/sites/search",
    handle(async (req, res) => {
      const q = req.query.q;
      if (!q || typeof q !== "string" || q.trim().length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters." });
      }
      const rows = await db.query(
        `select sb.id, sb.spec->>'meta' as meta, p.published_url, p.published_at
         from site_briefs sb
         join purchases p on p.brief_id = sb.id
         where p.published_url is not null
           and (sb.spec->'meta'->>'businessName' ilike $1 or sb.spec->'meta'->>'description' ilike $1)
         order by p.published_at desc limit 20`,
        [`%${q}%`],
      );
      res.json({ results: rows });
    }),
  );

  // ---------- Project activity log ----------

  app.get(
    "/api/projects/:id/activity",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const owner = await db.query(`select id from projects where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Project not found." });
      const rows = await db.query(
        `select id, action, details, created_at from project_activity where project_id = $1 order by created_at desc limit 50`,
        [id],
      );
      res.json({ activity: rows });
    }),
  );

  app.post(
    "/api/projects/:id/activity",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { action, details } = req.body || {};
      if (!action || typeof action !== "string") {
        return res.status(400).json({ error: "action is required." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const owner = await db.query(`select id from projects where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Project not found." });
      const row = await db.query(
        `insert into project_activity (project_id, user_id, action, details) values ($1, $2, $3, $4) returning id, created_at`,
        [id, req.user.id, action, JSON.stringify(details || {})],
      );
      res.status(201).json({ activity: row[0] });
    }),
  );

  // ---------- Bulk project operations ----------

  app.post(
    "/api/projects/bulk",
    requireUser,
    handle(async (req, res) => {
      const { action, ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required." });
      }
      if (!["delete", "archive", "unarchive", "favorite"].includes(action)) {
        return res.status(400).json({ error: "Invalid action." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      let affected = 0;
      for (const id of ids) {
        if (action === "delete") {
          const r = await db.query(`delete from projects where id = $1 and user_id = $2 returning id`, [id, req.user.id]);
          affected += r.length;
        } else if (action === "archive") {
          const r = await db.query(`update projects set is_archived = true where id = $1 and user_id = $2 returning id`, [id, req.user.id]);
          affected += r.length;
        } else if (action === "unarchive") {
          const r = await db.query(`update projects set is_archived = false where id = $1 and user_id = $2 returning id`, [id, req.user.id]);
          affected += r.length;
        } else if (action === "favorite") {
          const r = await db.query(`update projects set is_favorite = true where id = $1 and user_id = $2 returning id`, [id, req.user.id]);
          affected += r.length;
        }
      }
      res.json({ action, affected });
    }),
  );

  // ---------- Webhooks ----------

  app.get(
    "/api/webhooks",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `select id, url, events, active, created_at from webhooks where user_id = $1 order by created_at desc`,
        [req.user.id],
      );
      res.json({ webhooks: rows });
    }),
  );

  app.post(
    "/api/webhooks",
    requireUser,
    handle(async (req, res) => {
      const { url, events } = req.body || {};
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required." });
      }
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const secret = crypto.randomUUID();
      const row = await db.query(
        `insert into webhooks (user_id, url, events, secret) values ($1, $2, $3, $4) returning id, url, events, active, created_at`,
        [req.user.id, url, events || [], secret],
      );
      res.status(201).json({ webhook: row[0], secret });
    }),
  );

  app.delete(
    "/api/webhooks/:id",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(`delete from webhooks where id = $1 and user_id = $2 returning id`, [id, req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: "Webhook not found." });
      res.json({ deleted: true });
    }),
  );

  // ---------- User preferences ----------

  app.get(
    "/api/users/me/preferences",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(`select * from user_preferences where user_id = $1`, [req.user.id]);
      if (!rows[0]) {
        await db.query(`insert into user_preferences (user_id) values ($1)`, [req.user.id]);
        const newRows = await db.query(`select * from user_preferences where user_id = $1`, [req.user.id]);
        return res.json({ preferences: newRows[0] });
      }
      res.json({ preferences: rows[0] });
    }),
  );

  app.patch(
    "/api/users/me/preferences",
    requireUser,
    handle(async (req, res) => {
      const { theme, language, notifications_enabled, email_digest } = req.body || {};
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const updates = [];
      const params = [];
      if (theme !== undefined) { updates.push(`theme = $${updates.length + 2}`); params.push(theme); }
      if (language !== undefined) { updates.push(`language = $${updates.length + 2}`); params.push(language); }
      if (notifications_enabled !== undefined) { updates.push(`notifications_enabled = $${updates.length + 2}`); params.push(notifications_enabled); }
      if (email_digest !== undefined) { updates.push(`email_digest = $${updates.length + 2}`); params.push(email_digest); }
      if (updates.length === 0) return res.status(400).json({ error: "Nothing to update." });
      updates.push("updated_at = now()");
      params.push(req.user.id);
      const rows = await db.query(
        `insert into user_preferences (user_id) values ($1) on conflict (user_id) do update set ${updates.join(", ")} returning *`,
        [req.user.id, ...params.slice(0, -1)],
      );
      // Re-query to get full row
      const final = await db.query(`select * from user_preferences where user_id = $1`, [req.user.id]);
      res.json({ preferences: final[0] });
    }),
  );

  // ---------- Site changelog ----------

  app.get(
    "/api/site/briefs/:id/changelog",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const owner = await db.query(`select id from site_briefs where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Brief not found." });
      const rows = await db.query(
        `select id, change_type, description, diff, created_at from site_changelog where brief_id = $1 order by created_at desc limit 50`,
        [id],
      );
      res.json({ changelog: rows });
    }),
  );

  app.post(
    "/api/site/briefs/:id/changelog",
    requireUser,
    handle(async (req, res) => {
      const { id } = req.params;
      const { change_type, description, diff } = req.body || {};
      if (!change_type || typeof change_type !== "string") {
        return res.status(400).json({ error: "change_type is required." });
      }
      const owner = await db.query(`select id from site_briefs where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!owner[0]) return res.status(404).json({ error: "Brief not found." });
      const row = await db.query(
        `insert into site_changelog (brief_id, user_id, change_type, description, diff) values ($1, $2, $3, $4, $5) returning id, created_at`,
        [id, req.user.id, change_type, description || null, JSON.stringify(diff || {})],
      );
      res.status(201).json({ entry: row[0] });
    }),
  );

  // ---------- Search user's site briefs ----------

  app.get(
    "/api/site/briefs/search",
    requireUser,
    handle(async (req, res) => {
      const q = req.query.q;
      if (!q || typeof q !== "string" || q.trim().length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters." });
      }
      const rows = await db.query(
        `select id, created_at, updated_at, spec->'meta'->>'businessName' as business_name from site_briefs
         where user_id = $1 and (spec->'meta'->>'businessName' ilike $2 or spec->'meta'->>'description' ilike $2)
         order by updated_at desc limit 20`,
        [req.user.id, `%${q}%`],
      );
      res.json({ results: rows });
    }),
  );

  // ---------- Forge AI chat (Ollama-shaped, for Forge workspace scripts) ----------

  app.get(
    "/api/forge/chat",
    requireUser,
    handle(async (_req, res) => {
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/forge/chat",
    requireUser,
    handle(async (req, res) => {
      if (!config.aiConfigured) {
        return res.status(503).json({ error: "Forge AI is not configured. Add OPENROUTER_API_KEY, GROQ_API_KEY, or KILO_API_KEY." });
      }
      const { model, stream, format, maxOutputTokens, options, messages } = req.body || {};
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages is required." });
      }
      try {
        const result = await chat({
          model: model || config.modelStandard,
          messages,
          maxTokens: maxOutputTokens || 4096,
          json: !!format,
          temperature: options?.temperature ?? 0.4,
        });
        res.json({
          model: model || config.modelStandard,
          message: { role: "assistant", content: result.content },
          done_reason: result.finishReason,
        });
      } catch (err) {
        res.status(502).json({ error: err.message || "Forge AI request failed." });
      }
    }),
  );

  // Multer error handler (e.g. file too large)
  app.use((err, req, res, next) => {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds 10 MB limit." });
    }
    next(err);
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  return app;
}

async function main() {
  const config = loadConfig();
  const db = { query };
  const stripe = config.paymentsEnabled ? new Stripe(config.stripeSecretKey) : null;
  const chat = createMultiProviderChat({ referer: config.frontendUrl });
  const jobs = createJobRunner({ db, config, chat });
  const app = createApp({ config, db, stripe, jobs });
  app.listen(config.port, async () => {
    console.log(`Forge AI backend listening on ${config.baseUrl}`);
    if (!stripe) console.log("Payments are off (add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to turn them on).");

    const resumed = await jobs.recover().catch((err) => (console.error("[jobs] recover failed", err), 0));
    if (resumed) console.log(`Resumed ${resumed} unfinished job(s).`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
