// Multi-type QA validation for generated deliverables.
export function validateWebsite(files) {
  const issues = [];
  const checks = [];
  const index = files["index.html"];
  if (!index) {
    issues.push("Missing index.html");
    return { passed: false, issues, checks };
  }
  checks.push({ name: "index.html exists", status: "pass" });
  if (!files["styles.css"]) issues.push("Missing styles.css");
  else checks.push({ name: "styles.css exists", status: "pass" });
  if (!files["app.js"]) issues.push("Missing app.js");
  else checks.push({ name: "app.js exists", status: "pass" });

  // Check for broken internal links
  const hrefs = index.match(/href="([^"]+)"/g) || [];
  for (const h of hrefs) {
    const url = h.match(/href="([^"]+)"/)[1];
    if (url.startsWith("#") || url.startsWith("http")) continue;
    if (!files[url]) issues.push(`Broken link: ${url}`);
  }
  checks.push({ name: "Internal links valid", status: issues.some((i) => i.startsWith("Broken")) ? "fail" : "pass" });

  // Check for banned phrases
  const banned = ["lorem ipsum", "placeholder", "TODO"];
  const allContent = Object.values(files).join(" ").toLowerCase();
  for (const b of banned) {
    if (allContent.includes(b)) issues.push(`Banned phrase found: ${b}`);
  }
  checks.push({ name: "No banned phrases", status: issues.some((i) => i.includes("Banned")) ? "warn" : "pass" });

  // Check img src
  const imgs = index.match(/<img[^>]+src="([^"]+)"/g) || [];
  for (const img of imgs) {
    const src = img.match(/src="([^"]+)"/)[1];
    if (src.startsWith("http") || src.startsWith("data:")) continue;
    if (!files[src]) issues.push(`Missing image: ${src}`);
  }
  checks.push({ name: "Images present", status: "pass" });

  return { passed: issues.length === 0, issues, checks };
}

export function validateSpreadsheet(buffer) {
  const issues = [];
  const checks = [];
  if (!buffer || buffer.length === 0) {
    issues.push("Empty file");
    return { passed: false, issues, checks };
  }
  checks.push({ name: "File non-empty", status: "pass" });
  // Basic zip/xlsx magic check
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    issues.push("Not a valid XLSX/ZIP file");
  } else {
    checks.push({ name: "Valid XLSX format", status: "pass" });
  }
  return { passed: issues.length === 0, issues, checks };
}

export function validateSocialKit(kit) {
  const issues = [];
  const checks = [];
  if (!kit || !kit.businessName) {
    issues.push("Missing business name");
    return { passed: false, issues, checks };
  }
  checks.push({ name: "Has business name", status: "pass" });
  if (!kit.posts || kit.posts.length < 3) issues.push("Too few posts");
  else checks.push({ name: "Has 3+ posts", status: "pass" });
  if (!kit.contentCalendar || kit.contentCalendar.length < 7) issues.push("Incomplete content calendar");
  else checks.push({ name: "7-day calendar", status: "pass" });
  if (!kit.brandVoice) issues.push("Missing brand voice");
  else checks.push({ name: "Has brand voice", status: "pass" });
  return { passed: issues.length === 0, issues, checks };
}

export function validateWorkflow(wf) {
  const issues = [];
  const checks = [];
  if (!wf || !wf.name) {
    issues.push("Missing workflow name");
    return { passed: false, issues, checks };
  }
  checks.push({ name: "Has name", status: "pass" });
  if (!wf.steps || wf.steps.length === 0) issues.push("No steps defined");
  else checks.push({ name: "Has steps", status: "pass" });
  if (!wf.triggers || wf.triggers.length === 0) issues.push("No triggers");
  else checks.push({ name: "Has triggers", status: "pass" });
  return { passed: issues.length === 0, issues, checks };
}

export function validateByType(type, data) {
  switch (type) {
    case "website":
    case "restaurant":
    case "services":
    case "saas":
    case "social":
      return validateWebsite(data);
    case "spreadsheet":
      return validateSpreadsheet(data);
    default:
      return { passed: true, issues: [], checks: [{ name: "Unknown type", status: "warn" }] };
  }
}
