// Forge AI backend: Replit-native.
// Auth via Replit headers; DB via plain Postgres; storage via Replit Object Storage.
import express from "express";
import Stripe from "stripe";
import multer from "multer";
import sharp from "sharp";
import { pathToFileURL } from "node:url";

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

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      payments: Boolean(stripe),
      freeGeneration: config.allowFreeGeneration,
      jobs: jobs.size,
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

  // ---------- Profile (replaces Supabase profiles table) ----------

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

  // ---------- Projects (replaces Supabase forge_projects table) ----------

  app.get(
    "/api/projects",
    requireUser,
    handle(async (req, res) => {
      await ensureUser(req.user.id, req.user.name, req.headers["x-replit-user-email"]);
      const rows = await db.query(
        `select id, name, stage, data, updated_at from projects where user_id = $1 order by updated_at desc`,
        [req.user.id],
      );
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
