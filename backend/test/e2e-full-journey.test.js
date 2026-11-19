import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "../src/site/build.js";
import { createAppSpec } from "../src/app-generator.js";
import { createDefaultWorkbook, buildWorkbook, workbookToBuffer } from "../src/spreadsheet.js";
import { createSocialKit } from "../src/social-kit.js";
import { createWorkflow } from "../src/workflow.js";

test("full journey: site build → app build → spreadsheet → social kit → workflow", async () => {
  // Site
  const siteSpec = {
    meta: { businessName: "TestBiz", tagline: "Test", locale: "en" },
    design: { palette: { primary: "#4F46E5", secondary: "#7C3AED", accent: "#F59E0B", bg: "#FFFFFF", ink: "#1F2937", muted: "#6B7280" }, fonts: { display: "Inter", body: "Inter", googleFontsUrl: "" }, radius: "medium", density: "comfortable", motion: "subtle", imageStyle: "photographic" },
    pages: [{ slug: "index", title: "Home", description: "Welcome", sections: [{ type: "hero", variant: "split-image", content: { heading: "Welcome", body: "Hello" } }] }],
    unknowns: [],
  };
  const { files: siteFiles } = await buildSite(siteSpec, []);
  assert.ok(siteFiles["index.html"]);
  assert.ok(siteFiles["css/site.css"]);

  // App
  const app = createAppSpec({ name: "Test App", description: "A test" });
  assert.ok(app.files["src/server.js"]);
  assert.ok(app.files["public/index.html"]);

  // Spreadsheet
  const wbSpec = createDefaultWorkbook("TestBiz");
  const wb = await buildWorkbook(wbSpec);
  const buf = await workbookToBuffer(wb);
  assert.ok(Buffer.isBuffer(buf));

  // Social kit
  const kit = createSocialKit({ businessName: "TestBiz", industry: "Tech", description: "A tech company" });
  assert.ok(kit.posts.length >= 3);

  // Workflow
  const wf = createWorkflow({ name: "Test Workflow", description: "A test" });
  assert.ok(wf.steps.length >= 3);
});
