import { test } from "node:test";
import assert from "node:assert/strict";
import { createSandboxDir, isDockerAvailable } from "../src/sandbox.js";
import { rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

test("createSandboxDir creates files", () => {
  const dir = createSandboxDir("test-app-1", { "index.js": "console.log('hello')" });
  assert.ok(existsSync(dir));
  assert.ok(existsSync(path.join(dir, "index.js")));
  assert.equal(readFileSync(path.join(dir, "index.js"), "utf8"), "console.log('hello')");
  rmSync(dir, { recursive: true, force: true });
});

test("isDockerAvailable returns boolean", () => {
  const result = isDockerAvailable();
  assert.equal(typeof result, "boolean");
});
