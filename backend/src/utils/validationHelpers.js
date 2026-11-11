/**
 * Shared Input Validation Helpers
 *
 * Centralizes strict numeric, currency, and URL validation helpers so validators
 * and services reject JS coercion hazards (booleans, arrays, empty strings) and
 * unsafe URL schemes uniformly.
 */

'use strict';

/**
 * Validate that a value is strictly a finite number or non-empty numeric string.
 * Rejects booleans (Number(true) === 1), arrays (Number([5]) === 5), null, objects,
 * empty/whitespace strings, NaN, and Infinity.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isStrictFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string') {
    if (value.trim() === '') return false;
    return Number.isFinite(Number(value));
  }
  return false;
}

/**
 * Validate that a value is a strict positive integer (> 0), without boolean/array coercion.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isStrictPositiveInteger(value) {
  if (!isStrictFiniteNumber(value)) return false;
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

/**
 * Validate a 3-letter ISO-style alphabetic currency code (case-insensitive before normalization).
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidCurrencyCode(value) {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim());
}

/**
 * Normalize a currency string to 3-letter uppercase, or return fallback if blank/missing.
 *
 * @param {*} value
 * @param {string} [fallback='INR']
 * @returns {string}
 */
function normalizeCurrencyCode(value, fallback = 'INR') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toUpperCase();
  }
  return fallback;
}

/**
 * Validate that a value is an HTTP or HTTPS URL string within length limits.
 * Blocks dangerous URI schemes such as javascript:, data:, file:, etc.
 *
 * @param {*} value
 * @param {number} [maxLength=500]
 * @returns {boolean}
 */
function isValidHttpUrl(value, maxLength = 500) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  isStrictFiniteNumber,
  isStrictPositiveInteger,
  isValidCurrencyCode,
  normalizeCurrencyCode,
  isValidHttpUrl,
};
