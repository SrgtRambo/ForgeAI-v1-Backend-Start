import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSite } from "../src/site/build.js";

const fixture = {
  meta: { businessName: "Acme Corp", tagline: "We build things", locale: "en" },
  design: {
    palette: { name: "indigo", primary: "#4F46E5", secondary: "#7C3AED", accent: "#F59E0B", bg: "#FFFFFF", ink: "#1F2937", muted: "#6B7280" },
    fonts: { display: "Inter", body: "Inter", googleFontsUrl: "" },
    radius: "medium", density: "comfortable", motion: "subtle", imageStyle: "photographic",
  },
  pages: [
    { slug: "index", title: "Home", description: "Welcome", sections: [
      { type: "hero", variant: "split-image", content: { heading: "Welcome to Acme", body: "We build things" } },
      { type: "feature", variant: "image-left", content: { heading: "Features", items: [{ title: "Fast", description: "Very fast" }, { title: "Reliable", description: "Always up" }] } },
      { type: "cta", variant: "band", content: { heading: "Ready?", body: "Contact us", button: "Contact" } },
      { type: "footer", variant: "columns", content: { copyright: "© 2026 Acme" } },
    ] },
    { slug: "about", title: "About", description: "About us", sections: [
      { type: "hero", variant: "split-image", content: { heading: "About Acme", body: "Our story" } },
      { type: "footer", variant: "columns", content: { copyright: "© 2026 Acme" } },
    ] },
  ],
  unknowns: [],
};

test("buildSite produces all required files", async () => {
  const { files } = await buildSite(fixture, []);
  assert.ok(files["index.html"]);
  assert.ok(files["about.html"]);
  assert.ok(files["css/site.css"]);
  assert.ok(files["js/app.js"]);
  assert.ok(files["README.md"]);
  assert.ok(files["robots.txt"]);
});

test("buildSite HTML has correct structure", async () => {
  const { files } = await buildSite(fixture, []);
  const html = files["index.html"];
  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes("<title>Home</title>"));
  assert.ok(html.includes("Welcome to Acme"));
  assert.ok(html.includes("Features"));
});

test("buildSite CSS has responsive rules", async () => {
  const { files } = await buildSite(fixture, []);
  const css = files["css/site.css"];
  assert.ok(css.includes("max-width: 768px"));
  assert.ok(css.includes("box-sizing: border-box"));
  assert.ok(css.includes("prefers-reduced-motion"));
});

test("buildSite JS has form handling", async () => {
  const { files } = await buildSite(fixture, []);
  const js = files["js/app.js"];
  assert.ok(js.includes("addEventListener"));
  assert.ok(js.includes("localStorage"));
});

test("buildSite README has no unknowns", async () => {
  const { files } = await buildSite(fixture, []);
  const readme = files["README.md"];
  assert.ok(readme.includes("All facts confirmed"));
});

test("buildSite sitemap when baseUrl provided", async () => {
  const { files } = await buildSite(fixture, [], { baseUrl: "https://example.com" });
  assert.ok(files["sitemap.xml"]);
  assert.ok(files["sitemap.xml"].includes("https://example.com"));
});

test("buildSite has no forbidden placeholders", async () => {
  const { files } = await buildSite(fixture, []);
  for (const [path, content] of Object.entries(files)) {
    assert.ok(!/\{\{[^}]+\}\}/.test(content), `${path} has {{}} placeholder`);
    assert.ok(!/lorem ipsum/i.test(content), `${path} has lorem ipsum`);
  }
});
