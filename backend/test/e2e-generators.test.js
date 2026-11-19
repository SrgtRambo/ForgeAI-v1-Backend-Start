import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppSpec } from "../src/app-generator.js";
import { createDefaultWorkbook, buildWorkbook, workbookToBuffer } from "../src/spreadsheet.js";
import { createSocialKit } from "../src/social-kit.js";
import { createWorkflow } from "../src/workflow.js";

test("app generator produces functional backend", () => {
  const app = createAppSpec({ name: "Test App", description: "A test", entities: [
    { name: "Task", fields: [{ name: "title", type: "text", required: true }, { name: "status", type: "select", options: ["Open", "Done"] }] },
  ] });
  assert.ok(app.files["src/server.js"].includes("app.listen"));
  assert.ok(app.files["src/server.js"].includes("CREATE TABLE"));
  assert.ok(app.files["src/server.js"].includes("/api/tasks"));
  assert.ok(app.files["public/index.html"].includes("fetch"));
  assert.ok(app.files["package.json"].includes("better-sqlite3"));
});

test("spreadsheet generator produces valid buffer", async () => {
  const spec = createDefaultWorkbook("TestBiz");
  const wb = await buildWorkbook(spec);
  const buf = await workbookToBuffer(wb);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 1000);
  assert.ok(spec.sheets.some(s => s.name === "Dashboard"));
});

test("social kit produces usable content", () => {
  const kit = createSocialKit({ businessName: "TestCo", industry: "Tech", description: "A tech company" });
  assert.ok(kit.posts.length >= 3);
  assert.ok(kit.contentCalendar.length === 7);
  assert.ok(kit.brandVoice);
  assert.ok(Object.keys(kit.hashtagSets).length >= 1);
});

test("workflow produces documented steps", () => {
  const wf = createWorkflow({ name: "Test Workflow", description: "A test" });
  assert.ok(wf.steps.length >= 3);
  assert.ok(wf.triggers.length >= 1);
  assert.ok(wf.documentation);
  assert.ok(wf.steps.every(s => s.name && s.description));
});
