// Auth abstraction for Forge AI.
// Production: Replit Auth via injected headers X-Replit-User-Id and X-Replit-User-Name.
// Tests: inject a test user via setTestUser() (disabled in production).

const REPL_USER_ID_HEADER = "x-replit-user-id";
const REPL_USER_NAME_HEADER = "x-replit-user-name";

// Header names used: X-Replit-User-Id and X-Replit-User-Name.
// These are the headers Replit injects for authenticated requests via Replit Auth.
// I could not confirm them from official Replit documentation at the time of implementation;
// they are the commonly documented headers for Replit Auth middleware.

let testUser = null;

export function setTestUser(user) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test user override is disabled in production.");
  }
  testUser = user;
}

export function clearTestUser() {
  testUser = null;
}

export function requireUser(req, res, next) {
  const isOnReplit = Boolean(process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT);

  // Test mode: NODE_ENV=test accepts any Bearer token as a default test user.
  if (process.env.NODE_ENV === "test") {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Sign in first." });
    req.user = { id: "u1", name: "Test User" };
    return next();
  }

  // In tests (not on Replit, not production), allow the injected test user.
  if (!isOnReplit && process.env.NODE_ENV !== "production" && testUser) {
    req.user = { id: testUser.id, name: testUser.name };
    return next();
  }

  // Production / Replit: require the injected headers.
  if (!isOnReplit) {
    return res.status(401).json({ error: "Sign in first." });
  }

  const userId = req.headers[REPL_USER_ID_HEADER];
  const userName = req.headers[REPL_USER_NAME_HEADER];

  if (!userId) {
    return res.status(401).json({ error: "Sign in first." });
  }

  req.user = { id: String(userId), name: String(userName || "") };
  next();
}

export { REPL_USER_ID_HEADER, REPL_USER_NAME_HEADER };
