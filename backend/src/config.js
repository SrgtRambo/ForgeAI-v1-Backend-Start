// Reads and validates environment configuration once at startup.
import 'dotenv/config';

function read(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

export function loadConfig() {
  const port = Number(read('PORT', '4000'));
  const baseUrl = read('BASE_URL', `http://localhost:${port}`).replace(/\/$/, '');
  const config = {
    port,
    baseUrl,
    frontendUrl: read('FRONTEND_URL', baseUrl).replace(/\/$/, ''),
    corsOrigins: read('CORS_ORIGINS', 'http://localhost:8080')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    supabaseUrl: read('SUPABASE_URL'),
    supabaseServiceKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    openrouterKey: read('OPENROUTER_API_KEY'),
    stripeSecretKey: read('STRIPE_SECRET_KEY'),
    stripeWebhookSecret: read('STRIPE_WEBHOOK_SECRET'),
    storageBucket: read('STORAGE_BUCKET', 'projects'),
    jobConcurrency: Math.max(1, Number(read('JOB_CONCURRENCY', '2')) || 2),
    allowFreeGeneration: read('ALLOW_FREE_GENERATION', 'false') === 'true',
    models: {
      standard: read('MODEL_STANDARD', 'google/gemini-2.5-flash'),
      pro: read('MODEL_PRO', 'anthropic/claude-sonnet-4.5'),
    },
  };
  const missing = [
    ['SUPABASE_URL', config.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabaseServiceKey],
    ['OPENROUTER_API_KEY', config.openrouterKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  }
  config.paymentsEnabled = Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
  return config;
}
