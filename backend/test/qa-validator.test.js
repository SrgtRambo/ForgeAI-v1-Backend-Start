import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWebsite, validateSocialKit, validateWorkflow, validateSpreadsheet } from "../src/qa/validator.js";

test("validateWebsite passes with valid files", () => {
  const files = { "index.html": "<html><body><img src='hero.jpg'><a href='#top'>Top</a></body></html>", "styles.css": "body{}", "app.js": "console.log('hi')" };
  const r = validateWebsite(files);
  assert.equal(r.passed, true);
});

test("validateWebsite fails without index.html", () => {
  const r = validateWebsite({ "styles.css": "body{}" });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes("index.html")));
});

test("validateSocialKit passes with complete kit", () => {
  const kit = { businessName: "Test", posts: [1, 2, 3], contentCalendar: Array(7).fill({}), brandVoice: {} };
  const r = validateSocialKit(kit);
  assert.equal(r.passed, true);
});

test("validateSocialKit fails without business name", () => {
  const r = validateSocialKit({});
  assert.equal(r.passed, false);
});

test("validateWorkflow passes with steps and triggers", () => {
  const wf = { name: "Test WF", steps: [{ name: "Step 1" }], triggers: [{ name: "Manual" }] };
  const r = validateWorkflow(wf);
  assert.equal(r.passed, true);
});

test("validateWorkflow fails without steps", () => {
  const r = validateWorkflow({ name: "Test" });
  assert.equal(r.passed, false);
});

test("validateSpreadsheet passes with valid buffer", () => {
  const buf = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
  const r = validateSpreadsheet(buf);
  assert.equal(r.passed, true);
});

test("validateSpreadsheet fails with empty buffer", () => {
  const r = validateSpreadsheet(Buffer.alloc(0));
  assert.equal(r.passed, false);
});
