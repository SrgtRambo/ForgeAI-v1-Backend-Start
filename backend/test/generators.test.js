import { test } from "node:test";
import assert from "node:assert/strict";
import { createSocialKit } from "../src/social-kit.js";
import { createWorkflow } from "../src/workflow.js";
import { createAppSpec } from "../src/app-generator.js";
import { createDefaultWorkbook, buildWorkbook, workbookToBuffer } from "../src/spreadsheet.js";
import { getTemplates, getTemplate } from "../src/templates.js";
import { getProjectTemplates, getProjectTemplate } from "../src/project-templates.js";

test("createSocialKit produces valid kit", () => {
  const kit = createSocialKit({ businessName: "TestCo", industry: "Tech", description: "A tech company" });
  assert.ok(kit.businessName === "TestCo");
  assert.ok(kit.posts.length >= 3);
  assert.ok(kit.contentCalendar.length === 7);
  assert.ok(kit.brandVoice);
});

test("createWorkflow produces valid workflow", () => {
  const wf = createWorkflow({ name: "Test Workflow", description: "A test" });
  assert.ok(wf.name === "Test Workflow");
  assert.ok(wf.steps.length >= 3);
  assert.ok(wf.triggers.length >= 1);
  assert.ok(wf.documentation);
});

test("createAppSpec produces valid app", () => {
  const app = createAppSpec({ name: "Test App", description: "A test app" });
  assert.ok(app.files["package.json"]);
  assert.ok(app.files["src/server.js"]);
  assert.ok(app.files["public/index.html"]);
  assert.ok(app.entities.length >= 1);
});

test("createDefaultWorkbook produces valid workbook spec", () => {
  const def = createDefaultWorkbook("TestBiz");
  assert.ok(def.sheets.length >= 3);
  assert.ok(def.sheets.some((s) => s.name === "Dashboard"));
  assert.ok(def.sheets.some((s) => s.name === "Data"));
});

test("buildWorkbook produces valid ExcelJS workbook", async () => {
  const def = createDefaultWorkbook("TestBiz");
  const wb = await buildWorkbook(def);
  assert.ok(wb);
  const buffer = await workbookToBuffer(wb);
  assert.ok(buffer.length > 0);
  assert.equal(buffer[0], 0x50); // ZIP magic
  assert.equal(buffer[1], 0x4B);
});

test("getTemplates returns templates", () => {
  const t = getTemplates();
  assert.ok(t.length >= 5);
  assert.ok(getTemplate("restaurant"));
  assert.ok(!getTemplate("nonexistent"));
});

test("getProjectTemplates returns templates", () => {
  const t = getProjectTemplates();
  assert.ok(t.length >= 5);
  assert.ok(getProjectTemplate("blank"));
  assert.ok(!getProjectTemplate("nonexistent"));
});
