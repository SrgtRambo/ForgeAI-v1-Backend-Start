// Guards every AI-chosen file path before it is written into a zip.

const ALLOWED_EXTENSIONS = new Set([
  "html",
  "css",
  "js",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "csv",
  "svg",
  "gs",
  "yml",
  "yaml",
  "webmanifest",
]);
const BLOCKED_SEGMENTS = new Set(["node_modules", ".git", ".env", ".github", ".ssh"]);
export const MAX_FILE_BYTES = 200 * 1024;

/** Returns a clean relative path, or null when the path is unsafe or not allowed. */
export function sanitizePath(input) {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^\.\/+/, "");
  if (!raw || raw.length > 160) return null;
  if (raw.includes("\\") || raw.includes("\0") || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw))
    return null;
  const parts = raw.split("/");
  if (parts.length > 5) return null;
  for (const part of parts) {
    if (!part || part === "." || part === "..") return null;
    if (BLOCKED_SEGMENTS.has(part.toLowerCase()) || part.startsWith(".env")) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(part)) return null;
  }
  const ext = parts[parts.length - 1].split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) return null;
  return parts.join("/");
}
