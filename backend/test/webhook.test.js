import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

import { createApp } from "../src/server.js";

const SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy");

function fakeDb() {
  const purchases = {};
  const updates = [];

  async function query(sql, params = []) {
    const s = sql.trim();

    // Webhook: mark queued returning id
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

    // Webhook: cancel
    if (s.startsWith("update purchases") && s.includes("status = 'cancelled'")) {
      const id = params[0];
      const p = purchases[id];
      if (p && p.status === "pending") {
        p.status = "cancelled";
        updates.push(p);
      }
      return [];
    }

    // Purchases insert (checkout)
    if (s.startsWith("insert into purchases")) {
      const id = `p_${Math.random().toString(36).slice(2, 8)}`;
      purchases[id] = {
        id, user_id: params[0], email: params[1], type: params[2], tier: params[3],
        prompt: params[4], amount_cents: params[5], status: "pending",
        brief_id: params[6], qa_status: null, qa_report_key: null, storage_path: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      updates.push(purchases[id]);
      return [{ ...purchases[id] }];
    }

    // Update purchases set stripe_session_id
    if (s.startsWith("update purchases") && s.includes("stripe_session_id")) {
      const id = params[params.length - 1];
      const p = purchases[id];
      if (p) { p.stripe_session_id = params[0]; updates.push(p); }
      return [];
    }

    // Select purchase by id and user_id
    if (s.startsWith("select") && s.includes("from purchases") && s.includes("where id =")) {
      const p = purchases[params[0]];
      if (p && p.user_id === params[1]) return [{ ...p }];
      return [];
    }

    return [];
  }

  return {
    db: { query },
    auth: { getUser: async () => ({ data: null, error: new Error("no") }) },
    purchases,
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

function signedEvent(type, paymentStatus = "paid") {
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type,
    data: {
      object: { id: "cs_1", payment_status: paymentStatus, metadata: { purchase_id: "p1" } },
    },
  });
  return {
    payload,
    signature: stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }),
  };
}

const config = {
  corsOrigins: [],
  stripeWebhookSecret: SECRET,
  allowFreeGeneration: false,
  frontendUrl: "http://x",
  DATABASE_URL: "postgres://fake",
  analysisDailyLimit: 5,
  models: { standard: "google/gemini-2.5-flash", pro: "anthropic/claude-sonnet-4.5" },
  storageBucket: "projects",
  jobConcurrency: 2,
  baseUrl: "http://localhost:4000",
};

test("webhook rejects requests without a valid Stripe signature", async () => {
  const enqueued = [];
  const { db, purchases } = fakeDb();
  // Pre-seed a purchase for the webhook to find
  purchases["p1"] = { id: "p1", user_id: "u1", status: "pending" };
  const app = createApp({
    config,
    db,
    stripe,
    jobs: { enqueue: (id) => enqueued.push(id), size: 0 },
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=bad" },
      body: "{}",
    });
    assert.equal(res.status, 400);
  });
  assert.deepEqual(enqueued, []);
});

test("a paid checkout queues the job once and replies immediately", async () => {
  const enqueued = [];
  let firstDelivery = true;
  const { db, purchases } = fakeDb();
  purchases["p1"] = { id: "p1", user_id: "u1", status: "pending" };
  const app = createApp({
    config,
    db,
    stripe,
    jobs: { enqueue: (id) => enqueued.push(id), size: 0 },
  });
  await withServer(app, async (base) => {
    for (let i = 0; i < 2; i++) {
      const { payload, signature } = signedEvent("checkout.session.completed");
      const res = await fetch(`${base}/api/stripe/webhook`, {
        method: "POST",
        headers: { "content-type": "application/json", "stripe-signature": signature },
        body: payload,
      });
      assert.equal(res.status, 200);
    }
  });
  assert.deepEqual(enqueued, ["p1"]);
});

test("an unpaid checkout does not queue work", async () => {
  const enqueued = [];
  const { db, purchases } = fakeDb();
  purchases["p1"] = { id: "p1", user_id: "u1", status: "pending" };
  const app = createApp({
    config,
    db,
    stripe,
    jobs: { enqueue: (id) => enqueued.push(id), size: 0 },
  });
  await withServer(app, async (base) => {
    const { payload, signature } = signedEvent("checkout.session.completed", "unpaid");
    const res = await fetch(`${base}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    assert.equal(res.status, 200);
  });
  assert.deepEqual(enqueued, []);
});

test("purchase routes require sign-in", async () => {
  const { db } = fakeDb();
  const app = createApp({ config, db, stripe, jobs: { enqueue() {}, size: 0 } });
  await withServer(app, async (base) => {
    assert.equal((await fetch(`${base}/api/purchases`)).status, 401);
    assert.equal((await fetch(`${base}/api/purchases/p1/download`)).status, 401);
    assert.equal((await fetch(`${base}/api/checkout`, { method: "POST" })).status, 401);
  });
});
