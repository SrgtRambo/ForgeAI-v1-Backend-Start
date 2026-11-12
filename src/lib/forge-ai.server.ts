// Server-only Forge AI handler: verifies the caller, enforces per-user limits, and calls Lovable AI.
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, jsonSchema, streamText } from "ai";

import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./ai-gateway/run-id";
import { FORGE_AI_LIMITS, ForgeRequestError, validateForgeChat } from "./forge-ai-rules";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";
const MAX_BODY_BYTES = 512 * 1024;

const baseHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: baseHeaders });
}

async function authenticate(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (token.split(".").length !== 3) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend configuration is missing.");
  const supabase = createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { supabase, userId: data.claims.sub };
}

function gatewayErrorMessage(status: number) {
  if (status === 402) return "Forge AI is out of AI credits for this workspace. Add credits, then try again.";
  if (status === 429) return "Forge AI is busy right now. Wait a minute and try again.";
  if (status === 403) return "Forge AI access is currently blocked for this workspace.";
  if (status >= 500) return "Forge AI had a temporary problem. Try again in a moment.";
  return "Forge AI could not process this request.";
}

export async function handleForgeStatus(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return json(401, { error: "Sign in to use Forge AI.", status: 401 });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await auth.supabase
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  return json(200, {
    ok: true,
    usedToday: count ?? 0,
    perDay: FORGE_AI_LIMITS.perDay,
    perMinute: FORGE_AI_LIMITS.perMinute,
  });
}

export async function handleForgeChat(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return json(401, { error: "Sign in to use Forge AI.", status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Request is too large.", status: 413 });
  let validated;
  try {
    validated = validateForgeChat(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ForgeRequestError) return json(error.status, { error: error.message, status: error.status });
    return json(400, { error: "Request body must be valid JSON.", status: 400 });
  }

  const { data: claim, error: claimError } = await auth.supabase.rpc("claim_ai_request", {
    _per_minute: FORGE_AI_LIMITS.perMinute,
    _per_day: FORGE_AI_LIMITS.perDay,
  });
  if (claimError) {
    console.error("[forge-ai] rate limit check failed", claimError.message);
    return json(500, { error: "Could not check your AI usage. Try again.", status: 500 });
  }
  const claimResult = claim as { allowed?: boolean; reason?: string } | null;
  if (!claimResult?.allowed) {
    const message =
      claimResult?.reason === "day"
        ? `You have reached the daily limit of ${FORGE_AI_LIMITS.perDay} Forge AI requests. Try again tomorrow.`
        : `Too many Forge AI requests. The limit is ${FORGE_AI_LIMITS.perMinute} per minute; wait a minute and try again.`;
    return json(429, { error: message, status: 429 });
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return json(500, { error: "Forge AI is not configured.", status: 500 });

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    ...(validated.instructions ? { instructions: validated.instructions } : {}),
    messages: validated.messages,
    output: Output.object({ schema: jsonSchema(validated.schema as never) }),
    maxOutputTokens: validated.maxOutputTokens,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  // Send whitespace heartbeats while the model works so long generations keep the connection open.
  // Leading whitespace is valid JSON, so the browser can still call response.json().
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(" ")), 5000);
      controller.enqueue(encoder.encode(" "));
      let finalPayload: unknown;
      try {
        const [text, finishReason] = await Promise.all([result.text, result.finishReason]);
        finalPayload = {
          message: { role: "assistant", content: text },
          done: true,
          done_reason: finishReason === "length" ? "length" : "stop",
        };
      } catch (error) {
        if (request.signal.aborted) {
          finalPayload = { error: "The request was cancelled.", status: 499 };
        } else {
          const status = APICallError.isInstance(error) ? (error.statusCode ?? 502) : 502;
          console.error("[forge-ai] generation failed", status, error instanceof Error ? error.message : error);
          finalPayload = { error: gatewayErrorMessage(status), status };
        }
      } finally {
        clearInterval(heartbeat);
      }
      try {
        controller.enqueue(encoder.encode(JSON.stringify(finalPayload)));
        controller.close();
      } catch {
        // Client already disconnected.
      }
    },
  });

  return withLovableAiGatewayRunIdHeader(
    new Response(body, { status: 200, headers: baseHeaders }),
    runIdFetch,
    undefined,
    { waitForUpstreamHeaders: false },
  );
}
