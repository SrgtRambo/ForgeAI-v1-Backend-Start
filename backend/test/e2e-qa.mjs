// End-to-end QA test: fixture → analysis → spec → build → Chromium QA.
import { readFileSync } from "node:fs";
import { buildSpecFromAnalysis } from "../src/site/build-spec-from-analysis.js";
import { buildSite } from "../src/site/build.js";
import { runQA } from "../src/qa/index.js";
import { validateSpec } from "../src/site/spec.js";

const FIXTURES = [
  "sushi-restaurant", "plumber", "family-law-firm", "dental-clinic",
  "boutique-clothing-shop", "b2b-saas", "wedding-photographer",
  "nonprofit-food-bank", "yoga-studio", "digital-agency",
];

async function main() {
  let allPassed = true;
  for (const name of FIXTURES) {
    const analysis = JSON.parse(readFileSync(`test/fixtures/${name}.json`, "utf8"));
    const spec = buildSpecFromAnalysis(analysis);
    const validation = validateSpec(spec);
    if (!validation.ok) {
      console.log(`FAIL ${name}: spec validation failed: ${validation.errors.join(", ")}`);
      allPassed = false;
      continue;
    }

    const { files } = await buildSite(spec, [], { baseUrl: "https://example.com" });
    const qa = await runQA({ files });

    const status = qa.passed ? "PASS" : qa.report.qaStatus === "skipped" ? "SKIP" : "REVIEW";
    console.log(`${status} ${name}: QA=${qa.report.qaStatus}, pages=${qa.report.pages.length}, errors=${qa.report.errors.length}`);

    if (qa.report.errors.length) {
      for (const e of qa.report.errors) console.log(`   ERROR: ${e}`);
      allPassed = false;
    }
    for (const page of qa.report.pages) {
      if (page.axeViolations.length) {
        console.log(`   AXE ${page.page}: ${page.axeViolations.join("; ")}`);
        allPassed = false;
      }
      if (page.bannedText.length) {
        console.log(`   BANNED ${page.page}: ${page.bannedText.join("; ")}`);
        allPassed = false;
      }
      if (page.overflow) {
        console.log(`   OVERFLOW ${page.page}`);
        allPassed = false;
      }
    }
  }
  console.log(allPassed ? "\nALL QA CHECKS PASSED" : "\nSOME QA CHECKS FAILED");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
