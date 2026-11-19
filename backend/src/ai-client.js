// Multi-provider AI client with automatic fallback.
// Supports: OpenRouter, Groq, Kilo (free tier), and any OpenAI-compatible endpoint.
// Tries providers in order; falls back on rate limits (429), auth errors (401/403),
// and transient failures (5xx). Returns { content, finishReason } like OpenRouter.

const PROVIDERS = [
  {
    name: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    requiresKey: true,
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://forgeai.app",
      "X-Title": "Forge AI",
    }),
  },
  {
    name: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    requiresKey: true,
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
    }),
  },
  {
    name: "kilo",
    endpoint: "https://ai-gateway.kilo.ai/api/v1/chat/completions",
    keyEnv: "KILO_API_KEY",
    requiresKey: false,
    headers: (key) => key ? { Authorization: `Bearer ${key}` } : {},
    defaultModel: "kilo-auto/free",
  },
];

function buildProviders() {
  const providers = [];
  for (const p of PROVIDERS) {
    // Support multiple keys: comma-separated (GROQ_API_KEY=key1,key2,key3)
    // or numbered (GROQ_API_KEY_2, GROQ_API_KEY_3, etc.)
    const keys = [];
    const primary = process.env[p.keyEnv] || "";
    if (primary.trim()) {
      keys.push(...primary.split(",").map((k) => k.trim()).filter(Boolean));
    }
    // Check for numbered variants
    for (let i = 2; i <= 10; i++) {
      const extra = process.env[`${p.keyEnv}_${i}`];
      if (extra && extra.trim()) keys.push(extra.trim());
    }
    // Kilo doesn't require a key; always available as free fallback
    if (p.requiresKey && !keys.length) continue;
    if (!p.requiresKey) {
      providers.push({ ...p, key: keys[0] || "", name: p.name });
    } else {
      for (const key of keys) {
        providers.push({ ...p, key, name: `${p.name}` });
      }
    }
  }
  // Also support custom OpenAI-compatible endpoint
  const customEndpoint = process.env.AI_ENDPOINT;
  const customKey = process.env.AI_API_KEY;
  if (customEndpoint && customKey) {
    providers.push({
      name: "custom",
      endpoint: customEndpoint,
      key: customKey,
      requiresKey: true,
      headers: () => ({ Authorization: `Bearer ${customKey}` }),
    });
  }
  return providers;
}

function redactKey(text) {
  return String(text ?? "")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:gsk_|sk-or-v1-|sk-)[A-Za-z0-9_-]{8,}\b/gi, "[redacted key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function createMultiProviderChat({
  referer = "https://forgeai.app",
  title = "Forge AI",
  timeoutMs = 180_000,
  retries = 2,
} = {}) {
  const providers = buildProviders();
  if (!providers.length) {
    throw new Error(
      "No AI API key configured. Set OPENROUTER_API_KEY, GROQ_API_KEY, KILO_API_KEY, or AI_ENDPOINT+AI_API_KEY.",
    );
  }

  return async function chat({ model, messages, maxTokens, json = false, temperature = 0.4 }) {
    let lastError;
    for (const provider of providers) {
      const effectiveModel = model || provider.defaultModel || "kilo-auto/free";
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt) await sleep(Math.min(2000 * 2 ** (attempt - 1), 15_000));
        let response;
        try {
          response = await fetch(provider.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...provider.headers(provider.key),
            },
            body: JSON.stringify({
              model: effectiveModel,
              messages,
              max_tokens: maxTokens,
              temperature,
              ...((json && provider.name !== "kilo") ? { response_format: { type: "json_object" } } : {}),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          lastError = new ModelError(redactKey(`Could not reach ${provider.name}: ${error.message}`), 0);
          continue;
        }
        if (!response.ok) {
          const detail = (await response.text().catch(() => "")).slice(0, 300);
          lastError = new ModelError(
            redactKey(`${provider.name} returned ${response.status}: ${detail}`),
            response.status,
          );
          // Rate limit or auth error → try next provider
          if (response.status === 429 || response.status === 401 || response.status === 403) {
            break; // break retry loop, try next provider
          }
          if (RETRYABLE.has(response.status)) continue;
          throw lastError;
        }
        const data = await response.json();
        if (data?.error) {
          lastError = new ModelError(
            redactKey(`${provider.name} error: ${data.error.message ?? "unknown"}`),
            data.error.code ?? 502,
          );
          if (data.error.code === 429) break; // rate limit → next provider
          continue;
        }
        const choice = data?.choices?.[0];
        const content = choice?.message?.content;
        if (typeof content !== "string") {
          lastError = new ModelError(redactKey(`${provider.name} returned an empty reply.`), 502);
          continue;
        }
        return { content, finishReason: choice.finish_reason ?? "stop" };
      }
    }
    throw lastError || new ModelError("All AI providers failed.", 502);
  };
}

export function availableProviders() {
  const providers = buildProviders();
  return providers.map((p) => p.name);
}
