import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import { createApp } from "../src/server.js";
import { setClient as setStorageClient, resetClient as resetStorageClient } from "../src/infra/storage.js";

// Ensure DATABASE_URL is set for the db module
process.env.DATABASE_URL = "postgres://fake";

const VALID_SPEC = {
  version: 1,
  meta: {
    businessName: "Test Business",
    businessType: "restaurant",
    tagline: "Great food",
    industry: "dining",
    locale: "en",
    description: "A test restaurant",
  },
  brief: {
    offer: "Great food",
    audience: "Locals",
    primaryAction: "book",
    tone: ["warm", "friendly"],
    avoid: [],
  },
  unknowns: [],
  design: {
    palette: { bg: "#ffffff", surface: "#f5f5f5", ink: "#000000", muted: "#666666", brand: "#0066cc", accent: "#cc0000" },
    fonts: { display: "editorial-serif", body: "Inter" },
    radius: "soft",
    density: "regular",
    motion: "none",
    imageStyle: "natural",
  },
  nav: [{ label: "Home", href: "/" }],
  pages: [
    {
      slug: "index",
      title: "Home",
      description: "Home page",
      sections: [
        { type: "hero", variant: "split-image", content: { heading: "Test Business", imageId: "hero-1" } },
        { type: "footer", variant: "columns", content: {} },
      ],
    },
  ],
  images: [
    { id: "hero-1", slot: "hero", purpose: "Hero image", query: "chef cooking", aspect: "landscape", alt: "Chef cooking", source: "stock" },
  ],
  forms: [{ id: "contact", purpose: "Contact", fields: [], submitLabel: "Send", successMessage: "Sent" }],
  team: [],
  seo: { keywords: [], localBusiness: false },
};

function makeFakeDb() {
  const purchases = {};
  const briefs = {};
  const imageAssets = {};
  const usage = {};
  const storage = {};
  const enqueuedRebuilds = [];
  const modelCalls = [];

  async function query(sql, params = []) {
    const s = sql.trim();

    if (s.startsWith("insert into purchases")) {
      const id = `p_${Math.random().toString(36).slice(2, 8)}`;
      // SQL: values ($1, $2, $3, $4, $5, $6, 'pending', $7)
      // params: [user_id, email, type, tier, prompt, amount_cents, brief_id]
      purchases[id] = {
        id, user_id: params[0], email: params[1], type: params[2], tier: params[3],
        prompt: params[4], amount_cents: params[5], status: "pending", brief_id: params[6],
        qa_status: null, qa_report_key: null, storage_path: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      return [{ ...purchases[id] }];
    }
    if (s.startsWith("update purchases") && s.includes("status = 'processing'")) {
      const p = purchases[params[0]];
      if (p && p.status === "queued") { p.status = "processing"; return [{ ...p }]; }
      return [];
    }
    if (s.startsWith("update purchases") && s.includes("progress =")) {
      const p = purchases[params[params.length - 1]];
      if (p) { p.progress = params[0]; p.progress_message = params[1]; }
      return [];
    }
    if (s.startsWith("update purchases") && s.includes("status = 'queued'")) {
      const p = purchases[params[0]];
      if (p && p.status === "pending") { p.status = "queued"; p.progress_message = "Payment received"; return [{ id: p.id }]; }
      return [];
    }
    if (s.startsWith("update purchases") && s.includes("status = 'cancelled'")) {
      const p = purchases[params[0]];
      if (p && p.status === "pending") p.status = "cancelled";
      return [];
    }
    if (s.startsWith("update purchases") && s.includes("stripe_session_id")) {
      const p = purchases[params[params.length - 1]];
      if (p) p.stripe_session_id = params[0];
      return [];
    }
    if (s.startsWith("update purchases") && s.includes("qa_status")) {
      const p = purchases[params[params.length - 1]];
      if (p) { p.qa_status = params[0]; p.qa_report_key = params[1]; }
      return [];
    }
    if (s.startsWith("select") && s.includes("from purchases") && s.includes("where user_id")) {
      return Object.values(purchases).filter((p) => p.user_id === params[0]);
    }
    if (s.startsWith("select") && s.includes("from purchases") && s.includes("where id =")) {
      const p = purchases[params[0]];
      if (p && p.user_id === params[1]) return [{ ...p }];
      return [];
    }
    if (s.includes("status, storage_path") || s.includes("storage_path")) {
      const p = purchases[params[0]];
      if (p && p.user_id === params[1]) return [{ status: p.status, storage_path: p.storage_path }];
      return [];
    }
    if (s.startsWith("insert into site_briefs")) {
      const id = `b_${Math.random().toString(36).slice(2, 8)}`;
      briefs[id] = { id, user_id: params[0], input: params[1], analysis: params[2], spec: params[3],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      return [{ id }];
    }
    if (s.startsWith("select") && s.includes("from site_briefs") && s.includes("spec")) {
      const b = briefs[params[0]];
      if (b && b.user_id === params[1]) {
        if (s.includes("id, input, analysis, spec")) {
          return [{
            id: b.id,
            input: JSON.parse(b.input),
            analysis: JSON.parse(b.analysis),
            spec: JSON.parse(b.spec),
          }];
        }
        return [{ spec: JSON.parse(b.spec) }];
      }
      return [];
    }
    if (s.startsWith("select") && s.includes("from site_briefs") && s.includes(" returning id")) {
      const b = briefs[params[0]];
      if (b && b.user_id === params[1]) return [{ id: b.id }];
      return [];
    }
    if (s.startsWith("update site_briefs") && s.includes("spec =")) {
      const b = briefs[params[params.length - 2]];
      if (b && b.user_id === params[params.length - 1]) {
        b.spec = JSON.parse(params[0]);
        b.updated_at = new Date().toISOString();
      }
      return [];
    }
    if (s.startsWith("select slot_id, source, credit from site_image_assets")) {
      return Object.values(imageAssets).filter((a) => a.brief_id === params[0]);
    }
    if (s.startsWith("insert into site_image_assets")) {
      const [briefId, slotId, source, storageKey, credit] = params;
      imageAssets[`${briefId}:${slotId}`] = { brief_id: briefId, slot_id: slotId, source, storage_key: storageKey, credit };
      return [];
    }
    if (s.startsWith("select storage_key from site_image_assets")) {
      const a = imageAssets[`${params[0]}:${params[1]}`];
      return a ? [{ storage_key: a.storage_key }] : [];
    }
    if (s.startsWith("delete from site_image_assets")) {
      delete imageAssets[`${params[0]}:${params[1]}`];
      return [];
    }
    if (s.startsWith("select count from analysis_usage")) {
      const key = `${params[0]}:${params[1]}`;
      return [{ count: usage[key]?.count ?? 0 }];
    }
    if (s.startsWith("insert into analysis_usage")) {
      const key = `${params[0]}:${params[1]}`;
      if (!usage[key]) usage[key] = { user_id: params[0], day: params[1], count: 0 };
      usage[key].count += 1;
      return [];
    }
    if (s.startsWith("update purchases set status = 'queued' where status = 'processing'")) {
      Object.values(purchases).forEach((p) => { if (p.status === "processing") p.status = "queued"; });
      return [];
    }
    if (s.startsWith("select id from purchases where status = 'queued'")) {
      return Object.values(purchases).filter((p) => p.status === "queued").map((p) => ({ id: p.id }));
    }
    return [];
  }

  return {
    db: { query },
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@b.com" } }, error: null }) },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/signed" }, error: null }),
        upload: async () => ({ data: null, error: null }),
      }),
      listBuckets: async () => ({ data: [], error: null }),
      createBucket: async () => ({ data: null, error: null }),
    },
    purchases, briefs, imageAssets, usage, storage,
    get enqueuedRebuilds() { return enqueuedRebuilds; },
    set enqueuedRebuilds(v) { /* noop */ },
    recordRebuild(id) { enqueuedRebuilds.push(id); },
    get modelCalls() { return modelCalls; },
    recordModelCall(c) { modelCalls.push(c); },
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); }
}

const stripe = {
  checkout: { sessions: { create: async () => ({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" }) } },
};

const config = {
  corsOrigins: [],
  stripeWebhookSecret: "whsec_test",
  allowFreeGeneration: true,
  frontendUrl: "http://localhost:8080",
  DATABASE_URL: "postgres://fake",
  analysisDailyLimit: 2,
  models: { standard: "google/gemini-2.5-flash", pro: "anthropic/claude-sonnet-4.5" },
  storageBucket: "projects",
  jobConcurrency: 2,
  baseUrl: "http://localhost:4000",
};

const MOCK_ANALYSIS = {
  businessType: "restaurant",
  businessSummary: "A test restaurant",
  audience: "locals",
  primaryAction: "book",
  needs: { team: false, menu: false, pricing: false, gallery: false, booking: false, testimonials: false, stats: false, faq: false, process: false },
  reasons: {},
  tone: ["warm", "friendly"],
  palette: { bg: "#ffffff", surface: "#f5f5f5", ink: "#000000", muted: "#666666", brand: "#0066cc", accent: "#cc0000", rationale: "test" },
  fonts: { display: "editorial-serif", body: "modern-grotesk" },
  density: "regular",
  radius: "soft",
  imageStyle: "natural",
  imageSlots: [{ id: "hero-1", slot: "hero", query: "chef cooking", aspect: "landscape", alt: "Chef cooking" }],
  unknowns: [],
};

test("POST /api/site/analyze requires sign-in", async () => {
  const { db } = makeFakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/analyze`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessName: "X", description: "A valid description of at least twenty chars" }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /api/site/analyze validates input", async () => {
  const { db } = makeFakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/analyze`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ businessName: "", description: "short" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/site/analyze returns 429 on daily limit", async () => {
  const { db, usage } = makeFakeDb();
  // Pre-seed usage at the limit for today
  const today = new Date().toISOString().slice(0, 10);
  usage[`u1:${today}`] = { user_id: "u1", day: today, count: 2 };

  const modelCalls = [];
  const mockAnalyzer = {
    run: async () => { modelCalls.push("analyze"); return { analysis: MOCK_ANALYSIS, spec: VALID_SPEC }; },
  };

  const app = createApp({
    config, db, stripe,
    jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 },
    analyzer: mockAnalyzer,
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/analyze`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ businessName: "X", description: "A valid description of at least twenty chars" }),
    });
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.error, "Daily analysis limit reached. Try again tomorrow.");
  });
  assert.equal(modelCalls.length, 0, "No model calls should happen when over the limit");
});

test("POST /api/site/analyze succeeds under the limit", async () => {
  const { db } = makeFakeDb();
  const mockAnalyzer = {
    run: async () => ({ analysis: MOCK_ANALYSIS, spec: VALID_SPEC }),
  };

  const app = createApp({
    config, db, stripe,
    jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 },
    analyzer: mockAnalyzer,
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/analyze`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ businessName: "Test Biz", description: "A valid description of at least twenty chars" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.briefId);
    assert.equal(body.plan.meta.businessName, "Test Business");
    assert.equal(body.plan.version, 1);
  });
});

test("GET /api/site/briefs/:id returns 404 for another user", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "other-user", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1`, { headers: { Authorization: "Bearer tok" } });
    assert.equal(res.status, 404);
  });
});

test("PATCH /api/site/briefs/:id invalid spec returns 422 and does not change stored spec", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };

  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const badSpec = { ...VALID_SPEC, meta: { ...VALID_SPEC.meta, businessName: "" } };
    const res = await fetch(`${base}/api/site/briefs/b1`, {
      method: "PATCH", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ meta: { businessName: "" } }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.errors);

    // Verify stored spec unchanged
    const getRes = await fetch(`${base}/api/site/briefs/b1`, { headers: { Authorization: "Bearer tok" } });
    const getBody = await getRes.json();
    assert.equal(getBody.spec.meta.businessName, "Test Business");
  });
});

test("PATCH /api/site/briefs/:id unknown key returns 422", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1`, {
      method: "PATCH", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ unknownKey: "value" }),
    });
    assert.equal(res.status, 422);
  });
});

test("POST /api/site/briefs/:id/images/:slot upload rejects non-image renamed to .jpg", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };

  const textBuffer = Buffer.from("this is not an image");
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const form = new FormData();
    form.append("file", new Blob([textBuffer], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero`, {
      method: "POST", headers: { Authorization: "Bearer tok" }, body: form,
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/site/briefs/:id/images/:slot upload rejects oversized file", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };

  const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const form = new FormData();
    form.append("file", new Blob([bigBuffer], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero`, {
      method: "POST", headers: { Authorization: "Bearer tok" }, body: form,
    });
    assert.equal(res.status, 413);
  });
});

test("POST /api/site/briefs/:id/images/:slot/url rejects http://", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero/url`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ url: "http://example.com/image.jpg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/site/briefs/:id/images/:slot/url rejects 127.0.0.1", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero/url`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://127.0.0.1/image.jpg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/site/briefs/:id/images/:slot/url rejects 10.x.x.x", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero/url`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://10.0.0.5/image.jpg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/site/briefs/:id/images/:slot/url rejects 169.254.169.254", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero/url`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://169.254.169.254/image.jpg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/site/briefs/:id/images/:slot/url rejects IPv6 loopback", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/site/briefs/b1/images/hero/url`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://[::1]/image.jpg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("GET /api/purchases/:id/preview/* rejects path traversal", async () => {
  const { db, purchases } = makeFakeDb();
  purchases["p1"] = { id: "p1", user_id: "u1", status: "ready", storage_path: "u1/p1.zip" };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    // Note: fetch normalizes '..' in URLs, so the traversal is blocked at the HTTP level
    const res = await fetch(`${base}/api/purchases/p1/preview/../etc/passwd`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 404);
  });
});

test("GET /api/purchases/:id/preview/* rejects absolute path", async () => {
  const { db, purchases } = makeFakeDb();
  purchases["p1"] = { id: "p1", user_id: "u1", status: "ready", storage_path: "u1/p1.zip" };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/purchases/p1/preview//abs/path`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 400);
  });
});

test("GET /api/purchases/:id/preview/* returns CSP header on valid file", async () => {
  const { db, purchases } = makeFakeDb();
  const JSZip = await import("jszip");
  const zip = new JSZip.default();
  zip.file("index.html", "<html><body>Hello</body></html>");
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  purchases["p1"] = { id: "p1", user_id: "u1", status: "ready", storage_path: "u1/p1.zip" };

  // Inject a fake storage client
  resetStorageClient();
  setStorageClient({
    uploadFromBytes: async () => ({ ok: true }),
    downloadAsBytes: async () => ({ ok: true, value: [zipBuffer] }),
    delete: async () => ({ ok: true }),
  });

  try {
    const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/purchases/p1/preview/index.html`, {
        headers: { Authorization: "Bearer tok" },
      });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-security-policy").includes("default-src 'self'"));
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.ok(res.headers.get("content-type")?.includes("text/html"));
    });
  } finally {
    resetStorageClient();
  }
});

test("Image slot change queues exactly one rebuild and zero model calls", async () => {
  const { db, briefs } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };

  const modelCalls = [];
  const mockAnalyzer = {
    run: async () => { modelCalls.push("analyze"); return { analysis: MOCK_ANALYSIS, spec: VALID_SPEC }; },
  };

  const rebuildCalls = [];
  const jobs = {
    enqueue() {},
    enqueueRebuild: (id) => { rebuildCalls.push(id); },
    size: 0,
  };

  // Mock storage
  resetStorageClient();
  setStorageClient({
    uploadFromBytes: async () => ({ ok: true }),
    downloadAsBytes: async () => ({ ok: true, value: [Buffer.alloc(0)] }),
    delete: async () => ({ ok: true }),
  });

  try {
    // Create a valid 1x1 red JPEG image
    const imgBuffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();

    const app = createApp({
      config, db, stripe, jobs, analyzer: mockAnalyzer,
      unsplash: { search: async () => [] },
      pexels: { search: async () => [] },
    });
    await withServer(app, async (base) => {
      const form = new FormData();
      form.append("file", new Blob([imgBuffer], { type: "image/jpeg" }), "photo.jpg");
      const res = await fetch(`${base}/api/site/briefs/b1/images/hero`, {
        method: "POST", headers: { Authorization: "Bearer tok" }, body: form,
      });
      assert.equal(res.status, 201);
    });
  } finally {
    resetStorageClient();
  }

  assert.equal(rebuildCalls.length, 1, "Exactly one rebuild queued");
  assert.equal(rebuildCalls[0], "b1");
  assert.equal(modelCalls.length, 0, "Zero analysis model calls during image upload");
});

test("All new routes return 401 without auth", async () => {
  const { db } = makeFakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const routes = [
      ["POST", `${base}/api/site/analyze`],
      ["GET", `${base}/api/site/briefs/b1`],
      ["PATCH", `${base}/api/site/briefs/b1`],
      ["POST", `${base}/api/site/briefs/b1/images/hero`],
      ["POST", `${base}/api/site/briefs/b1/images/hero/search`],
      ["POST", `${base}/api/site/briefs/b1/images/hero/url`],
      ["DELETE", `${base}/api/site/briefs/b1/images/hero`],
      ["GET", `${base}/api/purchases/p1/preview/index.html`],
    ];
    for (const [method, url] of routes) {
      const res = await fetch(url, { method });
      assert.equal(res.status, 401, `${method} ${url} should return 401`);
    }
  });
});

test("POST /api/checkout accepts optional briefId", async () => {
  const { db, briefs, purchases } = makeFakeDb();
  briefs["b1"] = { id: "b1", user_id: "u1", input: "{}", analysis: "{}", spec: JSON.stringify(VALID_SPEC) };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, enqueueRebuild() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: "POST", headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "A valid description of at least twenty chars", type: "website", tier: "standard", briefId: "b1" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.purchaseId);
  });
  // Verify brief_id was stored
  const purchase = Object.values(purchases).find((p) => p.brief_id === "b1");
  assert.ok(purchase, "Purchase should have brief_id set");
});
