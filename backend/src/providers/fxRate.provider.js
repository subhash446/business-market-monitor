'use strict';

/**
 * FX Rate Provider (Frankfurter / European Central Bank API).
 * V3 Milestone 3 — Migration 033.
 *
 * Free, public, keyless API providing daily reference exchange rates
 * published by the European Central Bank (ECB).
 *
 * Endpoint:
 *   GET https://api.frankfurter.app/latest?from=USD&to=INR
 *
 * Sample Response:
 *   {
 *     "amount": 1.0,
 *     "base": "USD",
 *     "date": "2026-11-20",
 *     "rates": { "INR": 86.42 }
 *   }
 */

const env = require('../config/env');

class ProviderError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * Fetch latest daily FX rate for given base and quote currencies.
 *
 * @param {string} [base='USD']
 * @param {string} [quote='INR']
 * @param {Object} [options={}]
 * @param {number} [options.timeoutMs]
 * @param {string} [options.baseUrl]
 * @returns {Promise<{base: string, quote: string, rate: number, rateDate: string, source: string}>}
 */
async function fetchLatestFxRate(base = 'USD', quote = 'INR', options = {}) {
  const normBase = String(base).trim().toUpperCase();
  const normQuote = String(quote).trim().toUpperCase();
  const baseUrl = options.baseUrl || env.fx.baseUrl || 'https://api.frankfurter.app';
  const timeoutMs = options.timeoutMs || env.fx.timeoutMs || 10000;

  const url = `${baseUrl.replace(/\/+$/, '')}/latest?from=${encodeURIComponent(normBase)}&to=${encodeURIComponent(normQuote)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ProviderError('PROVIDER_TIMEOUT', `FX provider timed out after ${timeoutMs}ms`, err);
    }
    throw new ProviderError('PROVIDER_HTTP', `Network error contacting FX provider: ${err.message}`, err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ProviderError('PROVIDER_HTTP', `FX provider returned HTTP status ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch (parseErr) {
    throw new ProviderError('PROVIDER_PARSE', `Failed to parse FX provider JSON response: ${parseErr.message}`, parseErr);
  }

  if (!body || typeof body !== 'object' || !body.rates || typeof body.rates !== 'object') {
    throw new ProviderError('PROVIDER_PARSE', 'FX provider returned invalid or missing rates object');
  }

  const rawRate = body.rates[normQuote];
  const numRate = Number(rawRate);

  if (typeof rawRate !== 'number' || isNaN(numRate) || !isFinite(numRate)) {
    throw new ProviderError('PROVIDER_INVALID_RATE', `FX provider returned non-numeric rate for ${normQuote}`);
  }

  // Bounds validation: sanity guard against corrupted data (USD/INR historical/plausible band)
  if (numRate <= 10 || numRate >= 500) {
    throw new ProviderError('PROVIDER_INVALID_RATE', `FX rate ${numRate} out of expected bounds (10 < rate < 500)`);
  }

  const rateDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  return {
    base: normBase,
    quote: normQuote,
    rate: Number(numRate.toFixed(6)),
    rateDate,
    source: 'FRANKFURTER_ECB',
  };
}

module.exports = {
  fetchLatestFxRate,
  ProviderError,
};
