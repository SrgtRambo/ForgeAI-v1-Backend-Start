// Server-only Forge AI handler: proxies to the Forge AI backend.
// No Supabase dependency — auth is handled by Replit headers on the backend.

const BACKEND_URL = (process.env["VITE_BACKEND_URL"] || process.env["BACKEND_URL"] || "").replace(/\/$/, "");

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handleForgeStatus(request: Request) {
  if (!BACKEND_URL) return json(503, { error: "Backend not configured.", status: 503 });
  try {
    const res = await fetch(`${BACKEND_URL}/api/forge/chat`, {
      method: "GET",
      headers: { ...Object.fromEntries(request.headers) },
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch (err) {
    return json(502, { error: "Backend unavailable.", status: 502 });
  }
}

export async function handleForgeChat(request: Request) {
  if (!BACKEND_URL) return json(503, { error: "Backend not configured.", status: 503 });
  const body = await request.text();
  try {
    const res = await fetch(`${BACKEND_URL}/api/forge/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...Object.fromEntries(
          [...request.headers.entries()].filter(([k]) => k.toLowerCase() !== "host"),
        ),
      },
      body,
    });
    return new Response(res.body, { status: res.status, headers: res.headers });
  } catch (err) {
    return json(502, { error: "Backend unavailable.", status: 502 });
  }
}
