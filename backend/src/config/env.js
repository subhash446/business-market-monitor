/**
 * Central environment loader (Document 6 §5 — full variable list).
 * Loads .env once; every other module reads config from here, never from
 * process.env directly, so there is a single source of truth.
 */
require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME || 'business_market_monitor',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // Production Hardening Phase A, finding D4: optional SSL, off by
    // default so local/dev setups are completely unaffected unless a
    // deployment explicitly opts in via env vars.
    sslEnabled: (process.env.DB_SSL_ENABLED || 'false').toLowerCase() === 'true',
    sslRejectUnauthorized: (process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true',
    sslCaPath: process.env.DB_SSL_CA_PATH || '',
  },

  jwt: {
    // No `|| ''` default for these two — Production Hardening Phase A,
    // finding D1: an empty-string default lets the server boot and sign
    // forgeable tokens if the env var is simply missing. `undefined` is the
    // honest value when unset; config/validateEnv.js (called at server
    // boot, not here) is what actually refuses to start in that case.
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '30m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
  },

  cors: {
    allowedOrigin: process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5000',
  },

  authRateLimit: {
    window: process.env.AUTH_RATE_LIMIT_WINDOW || '15m',
    maxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  },

  cron: {
    priceIngestion:  process.env.PRICE_INGESTION_CRON  || '0 5 * * *',
    newsIngestion:   process.env.NEWS_INGESTION_CRON   || '0 * * * *',
    alertEvaluation: process.env.ALERT_EVALUATION_CRON || '*/15 * * * *',
    // AI insights run after price ingestion (5 AM UTC) so fresh prices are
    // available. Default: 6 AM UTC daily.
    aiInsights: process.env.AI_INSIGHTS_CRON || '0 6 * * *',
  },

  govDataApiKey: process.env.GOV_DATA_API_KEY || '',

  // Password Reset (FR-AUTH-07). 60 minutes is a standard, widely-used
  // default for reset-link validity — a plain, stated implementation
  // constant (same category as e.g. bcrypt's SALT_ROUNDS or Dashboard's
  // RECENT_ITEMS_LIMIT), not an invented business threshold: Document 2
  // doesn't specify an exact duration, but token-expiry conventions for
  // this exact use case are well-established industry practice, unlike
  // the Dashboard's significant-change percentage, which had no such
  // convention and was correctly left unimplemented rather than guessed.
  passwordReset: {
    tokenExpiryMinutes: parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES, 10) || 60,
  },

  // Automatic price ingestion (Phase A).
  // Opt-in: disabled by default so existing deployments without provider
  // credentials continue to start cleanly with no provider errors.
  priceIngestion: {
    enabled: (process.env.PRICE_INGESTION_ENABLED || 'false').toLowerCase() === 'true',
    // Timeout (ms) for outbound HTTP calls to external price providers.
    // 15 s is generous for a JSON REST API over HTTPS; prevents the job
    // from hanging indefinitely if the provider is slow/unreachable.
    timeoutMs: parseInt(process.env.PRICE_PROVIDER_TIMEOUT_MS, 10) || 15000,
  },

  // EIA (U.S. Energy Information Administration) API v2 — Primary provider.
  // Register free: https://www.eia.gov/opendata/register.php
  // No `|| ''` default for apiKey — same reasoning as jwt.accessSecret:
  // validateEnv.js rejects a missing key only when ingestion is enabled,
  // so an empty/undefined value is the honest state for opt-out deployments.
  eia: {
    apiKey: process.env.EIA_API_KEY,
    baseUrl: process.env.EIA_API_BASE_URL || 'https://api.eia.gov/v2',
    // Convenience alias so the provider reads one field, not two.
    get timeoutMs() { return env.priceIngestion.timeoutMs; },
  },

  // Automatic news ingestion (Phase G).
  // Opt-in: disabled by default so existing deployments without a provider
  // key continue to start cleanly.
  newsIngestion: {
    enabled: (process.env.NEWS_INGESTION_ENABLED || 'false').toLowerCase() === 'true',
    // Timeout (ms) for outbound HTTP calls to the news provider.
    timeoutMs: parseInt(process.env.NEWS_PROVIDER_TIMEOUT_MS, 10) || 15000,
  },

  // GNews (gnews.io) API v4 — Primary news provider.
  // Register free: https://gnews.io (100 requests/day on free tier).
  // No `|| ''` default for apiKey — same opt-out reasoning as EIA above.
  gnews: {
    apiKey: process.env.GNEWS_API_KEY,
    baseUrl: process.env.GNEWS_API_BASE_URL || 'https://gnews.io/api/v4',
    get timeoutMs() { return env.newsIngestion.timeoutMs; },
  },

  // Automatic AI Market Intelligence insights (Phase H).
  // Opt-in: disabled by default. When enabled, requires GEMINI_API_KEY.
  // Free-tier limits are project-specific -- check your Google AI Studio
  // dashboard for exact RPM/TPM/RPD values (do NOT rely on hardcoded figures).
  aiInsights: {
    enabled:   (process.env.AI_INSIGHTS_ENABLED || 'false').toLowerCase() === 'true',
    // Timeout (ms) for Gemini API calls. LLM calls are slower than data APIs;
    // 30 s is a reasonable upper bound for a 1-2 KB prompt on Flash models.
    timeoutMs: parseInt(process.env.AI_INSIGHTS_TIMEOUT_MS, 10) || 30000,
  },

  // Google Gemini API -- Primary LLM provider for AI insights.
  // Register free (no credit card for AI Studio): https://aistudio.google.com/apikey
  // No `|| ''` default for apiKey -- same opt-out reasoning as EIA/GNews:
  // validateEnv.js rejects a missing key only when AI insights are enabled,
  // so undefined is the honest state for deployments that have not set the key.
  // To switch providers: replace gemini.provider.js and update this block.
  gemini: {
    apiKey:  process.env.GEMINI_API_KEY,
    model:   process.env.GEMINI_MODEL   || 'gemini-3.6-flash',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    // Convenience alias used by gemini.provider.js to read one field, not two.
    get timeoutMs() { return env.aiInsights.timeoutMs; },
  },
};

module.exports = env;