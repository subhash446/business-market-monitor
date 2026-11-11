/**
 * Format helpers — dates, prices, numbers, strings
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/utils/format.js (Vanilla JS v1.0)
 * No changes — all functions are pure with no DOM or storage dependencies.
 *
 * Doc 3 §2 — js/utils/format.js
 * All price values display in monospace via CSS class .font-mono.
 */

/* ----------------------------------------------------------------
 * DATE / TIME
 * ---------------------------------------------------------------- */

/**
 * Format a date string or Date to a human-readable display.
 * Returns "—" for null/undefined.
 *
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function formatDate(value, options) {
  if (!value) return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, options ?? {
      year:  'numeric',
      month: 'short',
      day:   'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Format a date string with time.
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
export function formatDateTime(value) {
  if (!value) return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year:   'numeric',
      month:  'short',
      day:    'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Format a date to ISO date string (YYYY-MM-DD) for date inputs.
 * IMPORTANT: uses .toISOString().slice(0, 10) — preserves YYYY-MM-DD behavior.
 * Do NOT switch to toLocaleDateString — the backend expects YYYY-MM-DD exactly.
 * @param {Date|null} [date]
 * @returns {string}
 */
export function toIsoDateString(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/**
 * Format a date as a relative "time ago" string.
 * Falls back to formatDateTime for dates > 30 days old.
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
export function formatRelativeTime(value) {
  if (!value) return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '—';

    const now    = Date.now();
    const diffMs  = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60)  return 'Just now';
    if (diffMin < 60)  return `${diffMin}m ago`;
    if (diffHr  < 24)  return `${diffHr}h ago`;
    if (diffDay < 7)   return `${diffDay}d ago`;
    return formatDate(date);
  } catch {
    return '—';
  }
}

/* ----------------------------------------------------------------
 * NUMBERS & PRICES
 * ---------------------------------------------------------------- */

/**
 * Format a price number to a fixed decimal string.
 * Returns "No price recorded" for null/undefined.
 * Apply .font-mono CSS class to the element for proper display.
 *
 * @param {number|null|undefined} value
 * @param {number} [decimals=2]
 * @param {string} [unit=''] — optional unit suffix (e.g. "/ kg")
 * @returns {string}
 */
export function formatPrice(value, decimals = 2, unit = '') {
  if (value === null || value === undefined) return 'No price recorded';
  try {
    const num = parseFloat(value);
    if (isNaN(num)) return 'No price recorded';
    const formatted = num.toFixed(decimals);
    return unit ? `${formatted} ${unit}` : formatted;
  } catch {
    return 'No price recorded';
  }
}

/**
 * Format a number with locale-specific thousands separators.
 * @param {number|null|undefined} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '—';
  try {
    const num = parseFloat(value);
    if (isNaN(num)) return '—';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return '—';
  }
}

/* ----------------------------------------------------------------
 * ALERT RULE FORMATTING
 * ---------------------------------------------------------------- */

/**
 * Format an alert condition for display.
 * "PRICE_ABOVE" → "Price Above", "PRICE_BELOW" → "Price Below"
 *
 * @param {string} conditionType
 * @param {number|null} thresholdPrice
 * @returns {string}
 */
export function formatAlertCondition(conditionType, thresholdPrice, thresholdType = 'ABSOLUTE') {
  if (thresholdType === 'PERCENTAGE') {
    const isAbove = conditionType === 'PRICE_ABOVE';
    return isAbove
      ? `Price Increase ≥ ${formatNumber(thresholdPrice, 1)}%`
      : `Price Drop ≥ ${formatNumber(thresholdPrice, 1)}%`;
  }
  const label =
    conditionType === 'PRICE_ABOVE' ? 'Price Above' :
    conditionType === 'PRICE_BELOW' ? 'Price Below' :
    conditionType ?? 'Unknown';

  if (thresholdPrice !== null && thresholdPrice !== undefined) {
    return `${label} ${formatPrice(thresholdPrice)}`;
  }
  return label;
}

/* ----------------------------------------------------------------
 * STRING UTILITIES
 * ---------------------------------------------------------------- */

/**
 * Get user initials from an email address (1–2 letters, uppercase).
 * "user@example.com" → "U"
 * @param {string|null} email
 * @returns {string}
 */
export function getInitialsFromEmail(email) {
  if (!email) return '?';
  const local = email.split('@')[0] || '';
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (local.slice(0, 2) || '?').toUpperCase();
}

/**
 * Truncate a string to a maximum length, appending "…".
 * @param {string|null} str
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Capitalize the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a snake_case or SCREAMING_CASE string to Title Case.
 * "PRICE_ABOVE" → "Price Above"
 * @param {string} str
 * @returns {string}
 */
export function snakeToTitle(str) {
  if (!str) return '';
  return str
    .split('_')
    .map((word) => capitalize(word))
    .join(' ');
}

/* ----------------------------------------------------------------
 * CURRENCY, UNIT & SAFE URL HELPERS
 * ---------------------------------------------------------------- */

const USD_PROXY_SYMBOLS = new Set(['WTI', 'BRENT']);

/**
 * Resolve currency for a price display without blindly assuming USD for domestic
 * Indian Government (GOI) commodity feeds.
 *
 * @param {{
 *   currency?: string | null,
 *   sourceCurrency?: string | null,
 *   externalSymbol?: string | null,
 * }} params
 * @returns {string}
 */
export function resolveMaterialCurrency({ currency, sourceCurrency, externalSymbol } = {}) {
  if (typeof currency === 'string' && currency.trim()) {
    return currency.trim().toUpperCase();
  }
  if (typeof sourceCurrency === 'string' && sourceCurrency.trim()) {
    return sourceCurrency.trim().toUpperCase();
  }
  if (externalSymbol && USD_PROXY_SYMBOLS.has(String(externalSymbol).trim().toUpperCase())) {
    return 'USD';
  }
  return 'INR';
}

/**
 * Strip a leading currency prefix (e.g. "USD/bbl" -> "bbl", "INR/quintal" -> "quintal")
 * so currency + unit formatting does not duplicate the currency code.
 *
 * @param {string|null|undefined} unitLabel
 * @param {string|null|undefined} currency
 * @returns {string}
 */
export function stripCurrencyFromUnit(unitLabel, currency) {
  if (unitLabel === null || unitLabel === undefined) return '';
  const trimmed = String(unitLabel).trim();
  if (!trimmed) return '';

  const safeCurrency = typeof currency === 'string' && currency.trim()
    ? currency.trim().toUpperCase()
    : '';

  if (safeCurrency) {
    if (trimmed.toUpperCase() === safeCurrency) {
      return '';
    }
    const prefix = `${safeCurrency}/`;
    if (trimmed.toUpperCase().startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }

  return trimmed;
}

/**
 * Format currency + unit as a clean benchmark unit string (e.g. "USD/bbl" or "INR/kg").
 *
 * @param {string|null|undefined} currency
 * @param {string|null|undefined} unitLabel
 * @returns {string}
 */
export function formatUnitLabel(currency, unitLabel) {
  const safeCurrency = typeof currency === 'string' && currency.trim()
    ? currency.trim().toUpperCase()
    : 'INR';
  if (!unitLabel) return safeCurrency;
  const trimmed = String(unitLabel).trim();
  if (!trimmed) return safeCurrency;
  if (trimmed.toUpperCase().startsWith(`${safeCurrency}/`)) {
    return trimmed;
  }
  return `${safeCurrency}/${trimmed}`;
}

/**
 * Build currency, formatted numeric value, and de-duplicated unit suffix parts for display.
 *
 * @param {{
 *   price: number | string | null | undefined,
 *   currency?: string | null,
 *   unitLabel?: string | null,
 *   fallbackUnit?: string | null,
 *   sourceCurrency?: string | null,
 *   sourceUnitLabel?: string | null,
 *   externalSymbol?: string | null,
 *   decimals?: number,
 * }} params
 * @returns {{ currencyCode: string, formattedValue: string, unitSuffix: string, text: string }}
 */
export function formatPriceDisplay({
  price,
  currency,
  unitLabel,
  fallbackUnit,
  sourceCurrency,
  sourceUnitLabel,
  externalSymbol,
  decimals = 2,
} = {}) {
  const currencyCode = resolveMaterialCurrency({
    currency,
    sourceCurrency,
    externalSymbol,
  });
  const formattedValue = formatNumber(price, decimals);
  const rawUnit = unitLabel || sourceUnitLabel || fallbackUnit || '';
  const unitSuffix = stripCurrencyFromUnit(rawUnit, currencyCode);
  const text = `${currencyCode} ${formattedValue}${unitSuffix ? ` / ${unitSuffix}` : ''}`;

  return {
    currencyCode,
    formattedValue,
    unitSuffix,
    text,
  };
}

/**
 * Validate external evidence/source URLs strictly for http: or https: schemes.
 * Returns null for missing, malformed, or unsafe schemes (javascript:, data:, file:, etc.).
 *
 * @param {string|null|undefined} rawUrl
 * @returns {string|null}
 */
export function getSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}
