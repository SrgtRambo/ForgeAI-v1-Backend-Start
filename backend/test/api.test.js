import { test } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/server.js";

function makeUser(id = "u1", email = "a@b.com") {
  return { id, email };
}

function fakeDb() {
  const purchases = {};
  const briefs = {};
  const imageAssets = {};
  const usage = {};
  const storage = {};
  const updates = [];

  async function query(sql, params = []) {
    const s = sql.trim();

    // purchases insert (checkout / generate-free)
    if (s.startsWith("insert into purchases")) {
      const id = `p_${Math.random().toString(36).slice(2, 8)}`;
      purchases[id] = {
        id,
        user_id: params[0],
        email: params[1],
        type: params[2],
        tier: params[3],
        prompt: params[4],
        amount_cents: params[5],
        status: params[6],
        brief_id: params[7],
        qa_status: null,
        qa_report_key: null,
        storage_path: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updates.push(purchases[id]);
      return [{ ...purchases[id] }];
    }

    // purchases update processing claim (jobs / webhook)
    if (s.startsWith("update purchases") && s.includes("status = 'processing'")) {
      const id = params[0];
      const p = purchases[id];
      if (p && p.status === "queued") {
        p.status = "processing";
        updates.push(p);
        return [{ ...p }];
      }
      return [];
    }

    // purchases progress update
    if (s.startsWith("update purchases") && s.includes("progress =")) {
      const id = params[params.length - 1];
      const p = purchases[id];
      if (p) {
        p.progress = params[0];
        p.progress_message = params[1];
        updates.push(p);
      }
      return [];
    }

    // webhook: mark queued returning id
    if (s.startsWith("update purchases") && s.includes("status = 'queued'")) {
      const id = params[0];
      const p = purchases[id];
      if (p && p.status === "pending") {
        p.status = "queued";
        p.progress_message = "Payment received";
        updates.push(p);
        return [{ id }];
      }
      return [];
    }

    // webhook: cancel
    if (s.startsWith("update purchases") && s.includes("status = 'cancelled'")) {
      const id = params[0];
      const p = purchases[id];
      if (p && p.status === "pending") {
        p.status = "cancelled";
        updates.push(p);
      }
      return [];
    }

    // update purchases set stripe_session_id
    if (s.startsWith("update purchases") && s.includes("stripe_session_id")) {
      const id = params[params.length - 1];
      const p = purchases[id];
      if (p) {
        p.stripe_session_id = params[0];
        updates.push(p);
      }
      return [];
    }

    // update purchases set qa_status
    if (s.startsWith("update purchases") && s.includes("qa_status")) {
      const id = params[params.length - 1];
      const p = purchases[id];
      if (p) {
        p.qa_status = params[0];
        p.qa_report_key = params[1];
        updates.push(p);
      }
      return [];
    }

    // select purchases where user_id
    if (s.startsWith("select") && s.includes("from purchases") && s.includes("where user_id")) {
      return Object.values(purchases).filter((p) => p.user_id === params[0]);
    }

    // select purchases where id and user_id
    if (s.startsWith("select") && s.includes("from purchases") && s.includes("where id =")) {
      const id = params[0];
      const p = purchases[id];
      if (p && p.user_id === params[1]) return [{ ...p }];
      return [];
    }

    // select status, storage_path
    if (s.includes("status, storage_path") || s.includes("storage_path")) {
      const id = params[0];
      const p = purchases[id];
      if (p && p.user_id === params[1]) return [{ status: p.status, storage_path: p.storage_path }];
      return [];
    }

    // site_briefs insert (analyze)
    if (s.startsWith("insert into site_briefs")) {
      const id = `b_${Math.random().toString(36).slice(2, 8)}`;
      briefs[id] = {
        id,
        user_id: params[0],
        input: params[1],
        analysis: params[2],
        spec: params[3],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return [{ id }];
    }

    // site_briefs select
    if (s.startsWith("select id, input, analysis, spec from site_briefs")) {
      const id = params[0];
      const b = briefs[id];
      if (b && b.user_id === params[1]) return [b];
      return [];
    }

    // site_briefs select spec
    if (s.startsWith("select spec from site_briefs")) {
      const id = params[0];
      const b = briefs[id];
      if (b && b.user_id === params[1]) return [{ spec: b.spec }];
      return [];
    }

    // site_briefs select id only
    if (s.startsWith("select id from site_briefs")) {
      const id = params[0];
      const b = briefs[id];
      if (b && b.user_id === params[1]) return [{ id }];
      return [];
    }

    // site_briefs update spec
    if (s.startsWith("update site_briefs") && s.includes("spec =")) {
      const id = params[params.length - 2];
      const b = briefs[id];
      if (b && b.user_id === params[params.length - 1]) {
        b.spec = JSON.parse(params[0]);
        b.updated_at = new Date().toISOString();
      }
      return [];
    }

    // site_image_assets select
    if (s.startsWith("select slot_id, source, credit from site_image_assets")) {
      return Object.values(imageAssets).filter((a) => a.brief_id === params[0]);
    }

    // site_image_assets upsert
    if (s.startsWith("insert into site_image_assets")) {
      const [briefId, slotId, source, storageKey, credit] = params;
      const key = `${briefId}:${slotId}`;
      imageAssets[key] = { brief_id: briefId, slot_id: slotId, source, storage_key: storageKey, credit };
      return [];
    }

    // site_image_assets select storage_key
    if (s.startsWith("select storage_key from site_image_assets")) {
      const [briefId, slotId] = params;
      const key = `${briefId}:${slotId}`;
      const a = imageAssets[key];
      return a ? [{ storage_key: a.storage_key }] : [];
    }

    // site_image_assets delete
    if (s.startsWith("delete from site_image_assets")) {
      const [briefId, slotId] = params;
      const key = `${briefId}:${slotId}`;
      delete imageAssets[key];
      return [];
    }

    // analysis_usage select
    if (s.startsWith("select count from analysis_usage")) {
      const [userId, day] = params;
      const key = `${userId}:${day}`;
      return [{ count: usage[key]?.count ?? 0 }];
    }

    // analysis_usage upsert
    if (s.startsWith("insert into analysis_usage")) {
      const [userId, day] = params;
      const key = `${userId}:${day}`;
      if (!usage[key]) usage[key] = { user_id: userId, day, count: 0 };
      usage[key].count += 1;
      return [];
    }

    // purchases processing recover
    if (s.startsWith("update purchases set status = 'queued' where status = 'processing'")) {
      Object.values(purchases).forEach((p) => {
        if (p.status === "processing") p.status = "queued";
      });
      return [];
    }

    // select purchases where status = 'queued'
    if (s.startsWith("select id from purchases where status = 'queued'")) {
      return Object.values(purchases).filter((p) => p.status === "queued").map((p) => ({ id: p.id }));
    }

    return [];
  }

  return {
    db: { query },
    auth: {
      getUser: async (token) => {
        if (!token) return { data: null, error: new Error("no token") };
        return { data: { user: makeUser() }, error: null };
      },
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/signed" }, error: null }),
        upload: async () => ({ data: null, error: null }),
      }),
      listBuckets: async () => ({ data: [], error: null }),
      createBucket: async () => ({ data: null, error: null }),
    },
    purchases,
    briefs,
    imageAssets,
    usage,
    storage,
    updates,
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

const stripe = {
  checkout: {
    sessions: { create: async () => ({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" }) },
  },
};

const config = {
  corsOrigins: [],
  stripeWebhookSecret: "whsec_test",
  allowFreeGeneration: true,
  frontendUrl: "http://localhost:8080",
  DATABASE_URL: "postgres://fake",
  analysisDailyLimit: 5,
  models: { standard: "google/gemini-2.5-flash", pro: "anthropic/claude-sonnet-4.5" },
  storageBucket: "projects",
  jobConcurrency: 2,
  baseUrl: "http://localhost:4000",
};

test("GET /api/catalog lists types and tiers without auth", async () => {
  const { db } = fakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/catalog`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.types.some((t) => t.id === "website"));
    assert.ok(body.tiers.some((t) => t.id === "standard"));
  });
});

test("POST /api/checkout requires sign-in", async () => {
  const { db } = fakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
  await withServer(app, async (base) => {
    assert.equal(
      (
        await fetch(`${base}/api/checkout`, {
          method: "POST",
          body: JSON.stringify({ prompt: "x".repeat(20), type: "website", tier: "standard" }),
          headers: { "content-type": "application/json" },
        })
      ).status,
      401,
    );
  });
});

test("POST /api/checkout rejects a short prompt", async () => {
  const { db } = fakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/checkout`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hi", type: "website", tier: "standard" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/generate-free queues a free job", async () => {
  const enqueued = [];
  const { db } = fakeDb();
  const app = createApp({
    config,
    db,
    stripe,
    jobs: { enqueue: (id) => enqueued.push(id), size: 0 },
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/generate-free`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "A plumbing site".repeat(2),
        type: "website",
        tier: "standard",
      }),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.ok(body.purchaseId);
  });
  assert.ok(enqueued.length >= 1);
});

test("GET /api/purchases requires sign-in", async () => {
  const { db } = fakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
  await withServer(app, async (base) => {
    assert.equal((await fetch(`${base}/api/purchases`)).status, 401);
  });
});

test("GET /api/purchases/:id/download returns 409 when not ready", async () => {
  const { db, purchases } = fakeDb();
  purchases["p1"] = { id: "p1", user_id: "u1", status: "processing", storage_path: null };
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/purchases/p1/download`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 409);
  });
});

test("GET /api/purchases/:id/download returns a signed URL when ready", async () => {
  const { db, purchases } = fakeDb();
  purchases["p1"] = { id: "p1", user_id: "u1", status: "ready", storage_path: "u1/p1.zip" };

  // Mock storage to return a zip buffer
  const { setClient: setStorageClient, resetClient: resetStorageClient } = await import("../src/infra/storage.js");
  const JSZip = await import("jszip");
  const zip = new JSZip.default();
  zip.file("index.html", "<html></html>");
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  resetStorageClient();
  setStorageClient({
    uploadFromBytes: async () => ({ ok: true }),
    downloadAsBytes: async () => ({ ok: true, value: [zipBuffer] }),
    delete: async () => ({ ok: true }),
  });

  try {
    const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/purchases/p1/download`, {
        headers: { Authorization: "Bearer tok" },
      });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type")?.includes("application/zip"));
      assert.ok(res.headers.get("content-disposition")?.includes("attachment"));
    });
  } finally {
    resetStorageClient();
  }
});
