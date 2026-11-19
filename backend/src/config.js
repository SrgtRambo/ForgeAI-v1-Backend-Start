// Reads and validates environment configuration once at startup.
import "dotenv/config";

function read(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

export function loadConfig() {
  const port = Number(read("PORT", "4000"));
  const baseUrl = read("BASE_URL", `http://localhost:${port}`).replace(/\/$/, "");
  const config = {
    port,
    baseUrl,
    frontendUrl: read("FRONTEND_URL", baseUrl).replace(/\/$/, ""),
    corsOrigins: read("CORS_ORIGINS", "http://localhost:8080")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    stripeSecretKey: read("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),
    storageBucket: read("STORAGE_BUCKET", "projects"),
    jobConcurrency: Math.max(1, Number(read("JOB_CONCURRENCY", "2")) || 2),
    allowFreeGeneration: read("ALLOW_FREE_GENERATION", "false") === "true",
    analysisDailyLimit: Math.max(1, Number(read("ANALYSIS_DAILY_LIMIT", "5")) || 5),
    models: {
      standard: read("MODEL_STANDARD", "google/gemini-2.5-flash"),
      pro: read("MODEL_PRO", "anthropic/claude-sonnet-4.5"),
    },
    openrouterKey: read("OPENROUTER_API_KEY"),
    modelStandard: read("MODEL_STANDARD", "google/gemini-2.5-flash"),
    modelPro: read("MODEL_PRO", "anthropic/claude-sonnet-4.5"),
    modelAnalysis: read("MODEL_ANALYSIS", read("MODEL_STANDARD", "google/gemini-2.5-flash")),
    modelSpec: read("MODEL_SPEC", read("MODEL_STANDARD", "google/gemini-2.5-flash")),
    modelCopy: read("MODEL_COPY", read("MODEL_STANDARD", "google/gemini-2.5-flash")),
    modelCritic: read("MODEL_CRITIC", ""),
  };
  config.paymentsEnabled = Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
  config.aiConfigured = Boolean(
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.KILO_API_KEY ||
    (process.env.AI_ENDPOINT && process.env.AI_API_KEY)
  );
  config.aiProviders = [];
  if (process.env.OPENROUTER_API_KEY) config.aiProviders.push("openrouter");
  if (process.env.GROQ_API_KEY) config.aiProviders.push("groq");
  if (process.env.KILO_API_KEY) config.aiProviders.push("kilo");
  if (process.env.AI_ENDPOINT && process.env.AI_API_KEY) config.aiProviders.push("custom");
  return config;
}
