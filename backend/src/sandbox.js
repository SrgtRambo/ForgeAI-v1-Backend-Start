// Sandboxed execution environment for generated applications.
// Generated apps run inside Docker containers with no network access,
// read-only filesystem, and resource limits. This module manages
// container lifecycle and provides a safe execution API.

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const SANDBOX_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB

/**
 * Check if Docker is available on the host.
 * @returns {boolean}
 */
export function isDockerAvailable() {
  try {
    execSync("docker --version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a sandbox directory for a generated app.
 * @param {string} appId - Unique identifier for the app
 * @param {object} files - Map of file paths to content
 * @returns {string} Path to the sandbox directory
 */
export function createSandboxDir(appId, files = {}) {
  const base = path.join(process.env.TMPDIR || "/tmp", "forge-sandbox");
  const dir = path.join(base, appId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }
  return dir;
}

/**
 * Execute a generated app inside a Docker sandbox.
 * @param {string} appId - Unique app identifier
 * @param {object} files - Map of file paths to content
 * @param {object} options - Execution options
 * @returns {Promise<{ ok: boolean, output: string, exitCode: number, error?: string }>}
 */
export async function executeInSandbox(appId, files, options = {}) {
  const {
    command = "node index.js",
    timeout = SANDBOX_TIMEOUT_MS,
    memoryLimit = "256m",
    cpuLimit = "0.5",
    network = false,
  } = options;

  const sandboxDir = createSandboxDir(appId, files);

  if (!isDockerAvailable()) {
    return {
      ok: false,
      output: "",
      exitCode: -1,
      error: "Docker is not available. Install Docker or run the app directly in a trusted environment.",
    };
  }

  return new Promise((resolve) => {
    const dockerArgs = [
      "run", "--rm",
      `--memory=${memoryLimit}`,
      `--cpus=${cpuLimit}`,
      "--read-only",
      "--tmpfs=/tmp:size=64m",
      "--security-opt=no-new-privileges",
      "--cap-drop=ALL",
      "-v", `${sandboxDir}:/app:ro`,
      "-w", "/app",
    ];
    if (!network) dockerArgs.push("--network=none");
    dockerArgs.push("node:20-alpine", "sh", "-c", command);

    const proc = spawn("docker", dockerArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, timeout);

    proc.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !killed,
        output: stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ""),
        exitCode: killed ? -1 : code,
        error: killed ? "Execution timed out" : undefined,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: "", exitCode: -1, error: err.message });
    });
  });
}

/**
 * Clean up a sandbox directory.
 * @param {string} appId
 */
export function cleanupSandbox(appId) {
  const dir = path.join(process.env.TMPDIR || "/tmp", "forge-sandbox", appId);
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

export default { isDockerAvailable, createSandboxDir, executeInSandbox, cleanupSandbox };