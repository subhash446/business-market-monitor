/**
 * Shared AI Insight Prompt Sanitization, Secret Redaction & Output Contract Validation (T-04).
 *
 * Centralizes contract-based defense-in-depth used by:
 *   - gemini.provider.js (provider response validation + safe error logging)
 *   - aiInsight.service.js (prompt context sanitization + pre-persistence gate)
 *   - aiInsights.job.js (secret-safe job error logging)
 */

'use strict';

const {
  OUTLOOK,
  INSIGHT_CONFIDENCE,
  ACTION_RECOMMENDATION,
  RECOMMENDATION_HORIZON,
} = require('../constants/enums');

const MAX_HEADLINE_CHARS = 500;
const MAX_BODY_FIELD_CHARS = 4000;
const MAX_RATIONALE_CHARS = 2000;
const MAX_ERROR_LOG_CHARS = 240;

const VALID_OUTLOOKS = new Set(Object.values(OUTLOOK));
const VALID_CONFIDENCES = new Set(Object.values(INSIGHT_CONFIDENCE));
const VALID_ACTIONS = new Set(Object.values(ACTION_RECOMMENDATION));
const VALID_HORIZONS = new Set(Object.values(RECOMMENDATION_HORIZON));

// Unsafe invisible / bidirectional / control formatting characters
// (includes ASCII control bytes, zero-width joiners/markers, Unicode line/para separators, BOM, bidi isolates/overrides)
const UNSAFE_CONTEXT_CHARS_RE = /[\x00-\x1f\x7f\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g;

// Output non-whitespace control chars and Unicode bidi override controls
const UNSAFE_OUTPUT_CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u202A-\u202E\u2066-\u2069]/;

// Contract-based active HTML / XSS / script injection patterns (avoids false positives on math like "< 100")
const UNSAFE_HTML_PATTERNS = [
  /<\s*\/?\s*(?:script|iframe|object|embed|style|meta|link|form)\b/i,
  /<\s*(?:svg|img|body|video|audio|a)\b[^>]*\bon[a-z]{2,}\s*=/i,
  /\b(?:javascript|vbscript)\s*:/i,
  /\bdata\s*:\s*text\/html\b/i,
  /\bon(?:load|error|click|mouseover|focus|blur|submit|change|input)\s*=\s*['"`]/i,
];

// Credential / key leakage patterns in model outputs or error messages
const OUTPUT_SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:GEMINI_API_KEY|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|DB_PASSWORD|RESEND_API_KEY|EIA_API_KEY|GNEWS_API_KEY|GOV_DATA_API_KEY)\s*[:=]\s*\S+/i,
  /mysql:\/\/[^\s@]+@/i,
];

/**
 * Strip ASCII controls and invisible/bidi Unicode controls while preserving
 * legitimate punctuation, quotes, braces, brackets, and business symbols.
 *
 * @param {*} raw
 * @returns {string}
 */
function stripUnsafeControlChars(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(UNSAFE_CONTEXT_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize inline contextual strings (`materialName`, `source_name`, `currency`,
 * `unit_label`, `data_class`, `published_at`) for safe structured embedding.
 * Preserves harmless punctuation (e.g. quotes, parens, slashes, percent signs).
 *
 * @param {*} raw
 * @param {number} [maxLen=100]
 * @returns {string}
 */
function sanitizeInlineContext(raw, maxLen = 100) {
  return stripUnsafeControlChars(raw).slice(0, maxLen);
}

/**
 * Sanitize external news headline text for prompt inclusion.
 * Neutralizes structural delimiter characters and strips unsafe control/bidi chars.
 *
 * @param {*} raw
 * @param {number} [maxLen=200]
 * @returns {string}
 */
function sanitizeHeadlineText(raw, maxLen = 200) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/"/g, "'")
    .replace(/\\/g, ' ')
    .replace(/[{}[\]]/g, ' ')
    .replace(UNSAFE_CONTEXT_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Collect active runtime secrets (minimum length 6) for safe error/output redaction.
 *
 * @param {object} [envConfig]
 * @returns {string[]}
 */
function collectRuntimeSecrets(envConfig) {
  if (!envConfig || typeof envConfig !== 'object') return [];
  const candidates = [
    envConfig.gemini?.apiKey,
    envConfig.jwt?.accessSecret,
    envConfig.jwt?.refreshSecret,
    envConfig.db?.password,
    envConfig.resend?.apiKey,
    envConfig.eia?.apiKey,
    envConfig.gnews?.apiKey,
    envConfig.govDataApiKey,
  ];
  return candidates
    .filter((v) => typeof v === 'string' && v.trim().length >= 6)
    .map((v) => v.trim());
}

/**
 * Redact API keys, URL query `?key=` values, bearer tokens, passwords,
 * connection-string credentials, and known runtime secrets from text.
 *
 * @param {*} text
 * @param {string[]} [knownSecrets=[]]
 * @returns {string}
 */
function redactSecrets(text, knownSecrets = []) {
  let out = String(text === null || text === undefined ? '' : text);

  for (const secret of knownSecrets) {
    if (typeof secret === 'string' && secret.length >= 6) {
      out = out.split(secret).join('***');
    }
  }

  return out
    .replace(/([?&](?:key|api_key|apikey|token)=)([^&\s]+)/gi, '$1***')
    .replace(/\b(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, '$1***')
    .replace(/(mysql:\/\/)[^\s@]+@/gi, '$1***@')
    .replace(/\b(password|passwd|pwd|secret|api_key|apikey|access_token|refresh_token)\s*([:=])\s*(['"]?)([^\s,;'"`]+)\3/gi, '$1$2$3***$3')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '***');
}

/**
 * Produce a safe single-line diagnostic error message without secrets,
 * raw prompt echoes, or raw model responses.
 *
 * @param {Error|string|*} errOrMessage
 * @param {string[]} [knownSecrets=[]]
 * @param {number} [maxLen=MAX_ERROR_LOG_CHARS]
 * @returns {string}
 */
function sanitizeErrorMessage(errOrMessage, knownSecrets = [], maxLen = MAX_ERROR_LOG_CHARS) {
  const raw = errOrMessage && typeof errOrMessage === 'object' && 'message' in errOrMessage
    ? errOrMessage.message
    : errOrMessage;
  const cleaned = redactSecrets(raw, knownSecrets)
    .replace(UNSAFE_CONTEXT_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 3)}...`;
}

function createValidationError(message) {
  const err = new Error(message);
  err.validationCode = 'PROVIDER_INVALID';
  return err;
}

/**
 * Validate a parsed InsightResponse object against the frozen schema/contract.
 * Rejects invalid types, invalid ENUMs, missing/empty fields, excessive lengths,
 * unsafe HTML/XSS markup, control/bidi overrides, and leaked credentials.
 * Returns a clean object with strictly the 6 allowed fields.
 *
 * @param {*} obj
 * @param {{ knownSecrets?: string[] }} [options]
 * @returns {{
 *   headline: string,
 *   what_happened: string,
 *   why_it_happened: string,
 *   business_impact: string,
 *   outlook: string,
 *   confidence: string,
 * }}
 */
function validateInsightOutput(obj, { knownSecrets = [] } = {}) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw createValidationError('Gemini insight response is not an object');
  }

  const proto = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) {
    throw createValidationError('Gemini insight response is not a plain object');
  }

  const requiredStrings = ['headline', 'what_happened', 'why_it_happened', 'business_impact'];
  const sanitized = {};

  for (const field of requiredStrings) {
    const rawVal = obj[field];
    if (typeof rawVal !== 'string' || rawVal.trim() === '') {
      throw createValidationError('Gemini insight response missing or empty field: ' + field);
    }

    if (UNSAFE_OUTPUT_CONTROL_RE.test(rawVal)) {
      throw createValidationError(`Gemini insight field "${field}" contains disallowed control characters`);
    }

    const trimmed = rawVal.trim();
    if (field === 'headline' && (rawVal.length > MAX_HEADLINE_CHARS || trimmed.length > MAX_HEADLINE_CHARS)) {
      throw createValidationError(`Gemini insight headline exceeds ${MAX_HEADLINE_CHARS} characters (${rawVal.length})`);
    }
    if (field !== 'headline' && trimmed.length > MAX_BODY_FIELD_CHARS) {
      throw createValidationError(`Gemini insight field "${field}" exceeds ${MAX_BODY_FIELD_CHARS} characters (${trimmed.length})`);
    }

    for (const pattern of UNSAFE_HTML_PATTERNS) {
      if (pattern.test(trimmed)) {
        throw createValidationError(`Gemini insight field "${field}" contains unsafe markup or script content`);
      }
    }

    for (const secretPattern of OUTPUT_SECRET_PATTERNS) {
      if (secretPattern.test(trimmed)) {
        throw createValidationError(`Gemini insight field "${field}" contains prohibited credential/key pattern`);
      }
    }

    for (const secret of knownSecrets) {
      if (typeof secret === 'string' && secret.length >= 8 && trimmed.includes(secret)) {
        throw createValidationError(`Gemini insight field "${field}" leaked a runtime secret`);
      }
    }

    sanitized[field] = trimmed;
  }

  if (!VALID_OUTLOOKS.has(obj.outlook)) {
    throw createValidationError(`Gemini insight has invalid outlook value: "${sanitizeInlineContext(obj.outlook, 40)}"`);
  }

  if (!VALID_CONFIDENCES.has(obj.confidence)) {
    throw createValidationError(`Gemini insight has invalid confidence value: "${sanitizeInlineContext(obj.confidence, 40)}"`);
  }

  // V2-01C: Procurement Action Recommendations validation with backward-compatible defaults
  let action;
  if (obj.action_recommendation === undefined || obj.action_recommendation === null) {
    if (obj.outlook === OUTLOOK.BULLISH) {
      action = ACTION_RECOMMENDATION.ACCELERATE_PURCHASE;
    } else if (obj.outlook === OUTLOOK.BEARISH) {
      action = ACTION_RECOMMENDATION.DELAY_PURCHASE;
    } else if (obj.outlook === OUTLOOK.VOLATILE) {
      action = ACTION_RECOMMENDATION.MAINTAIN_BUFFER;
    } else {
      action = ACTION_RECOMMENDATION.MONITOR_ONLY;
    }
  } else {
    if (!VALID_ACTIONS.has(obj.action_recommendation)) {
      throw createValidationError(`Gemini insight has invalid action_recommendation value: "${sanitizeInlineContext(obj.action_recommendation, 40)}"`);
    }
    action = obj.action_recommendation;
  }

  let horizon;
  if (obj.recommendation_horizon === undefined || obj.recommendation_horizon === null) {
    horizon = RECOMMENDATION_HORIZON.SHORT_TERM;
  } else {
    if (!VALID_HORIZONS.has(obj.recommendation_horizon)) {
      throw createValidationError(`Gemini insight has invalid recommendation_horizon value: "${sanitizeInlineContext(obj.recommendation_horizon, 40)}"`);
    }
    horizon = obj.recommendation_horizon;
  }

  let rationale;
  if (obj.recommendation_rationale === undefined || obj.recommendation_rationale === null) {
    rationale = sanitized.business_impact.slice(0, MAX_RATIONALE_CHARS);
  } else {
    const rawRationale = obj.recommendation_rationale;
    if (typeof rawRationale !== 'string' || rawRationale.trim() === '') {
      throw createValidationError('Gemini insight response missing or empty field: recommendation_rationale');
    }
    if (UNSAFE_OUTPUT_CONTROL_RE.test(rawRationale)) {
      throw createValidationError('Gemini insight field "recommendation_rationale" contains disallowed control characters');
    }
    const trimmedRationale = rawRationale.trim();
    if (trimmedRationale.length > MAX_RATIONALE_CHARS) {
      throw createValidationError(`Gemini insight field "recommendation_rationale" exceeds ${MAX_RATIONALE_CHARS} characters (${trimmedRationale.length})`);
    }
    for (const pattern of UNSAFE_HTML_PATTERNS) {
      if (pattern.test(trimmedRationale)) {
        throw createValidationError('Gemini insight field "recommendation_rationale" contains unsafe markup or script content');
      }
    }
    for (const secretPattern of OUTPUT_SECRET_PATTERNS) {
      if (secretPattern.test(trimmedRationale)) {
        throw createValidationError('Gemini insight field "recommendation_rationale" contains prohibited credential/key pattern');
      }
    }
    for (const secret of knownSecrets) {
      if (typeof secret === 'string' && secret.length >= 8 && trimmedRationale.includes(secret)) {
        throw createValidationError('Gemini insight field "recommendation_rationale" leaked a runtime secret');
      }
    }
    rationale = trimmedRationale;
  }

  return {
    headline: sanitized.headline,
    what_happened: sanitized.what_happened,
    why_it_happened: sanitized.why_it_happened,
    business_impact: sanitized.business_impact,
    outlook: obj.outlook,
    confidence: obj.confidence,
    action_recommendation: action,
    recommendation_rationale: rationale,
    recommendation_horizon: horizon,
  };
}

module.exports = {
  MAX_HEADLINE_CHARS,
  MAX_BODY_FIELD_CHARS,
  MAX_RATIONALE_CHARS,
  MAX_ERROR_LOG_CHARS,
  VALID_OUTLOOKS,
  VALID_CONFIDENCES,
  VALID_ACTIONS,
  VALID_HORIZONS,
  stripUnsafeControlChars,
  sanitizeInlineContext,
  sanitizeHeadlineText,
  collectRuntimeSecrets,
  redactSecrets,
  sanitizeErrorMessage,
  validateInsightOutput,
};
