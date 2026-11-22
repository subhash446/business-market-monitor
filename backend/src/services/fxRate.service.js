'use strict';

/**
 * FX Rate Service (V3 Milestone 3 / Migration 033).
 *
 * Enforces Tech Lead Refinement 1:
 *   - Day-1 Cold-Start Safe FX Caching:
 *     If fx_rates has no cached row yet and NODE_ENV !== 'test' (and allowLazyFetch !== false),
 *     trigger a single deduplicated in-flight fetch to fxRate.provider.js, upsert into fx_rates,
 *     and return live rate immediately.
 *     Gracefully returns null on provider error without crashing the caller.
 *   - 100% network-isolated in test environments unless explicit mock is provided.
 *   - Computes ageDays and isStale (> 7 days).
 */

const fxRateRepository = require('../repositories/fxRate.repository');
const fxRateProvider = require('../providers/fxRate.provider');
const logger = require('../utils/logger');

const inFlightFetches = new Map();

/**
 * Calculate the calendar day difference between rateDate and now.
 *
 * @param {string} rateDateStr 'YYYY-MM-DD'
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
function calculateAgeDays(rateDateStr, now = new Date()) {
  if (!rateDateStr) return 0;
  const rateDate = new Date(`${rateDateStr}T00:00:00.000Z`);
  const nowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const diffMs = nowDate.getTime() - rateDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

/**
 * Fetch and store the latest daily FX rate from provider into DB.
 *
 * @param {string} [base='USD']
 * @param {string} [quote='INR']
 * @param {Object} [options={}]
 * @returns {Promise<Object>}
 */
async function fetchAndStoreLatestRate(base = 'USD', quote = 'INR', options = {}) {
  const normBase = String(base).trim().toUpperCase();
  const normQuote = String(quote).trim().toUpperCase();
  const provider = options.provider || fxRateProvider;

  const fetched = await provider.fetchLatestFxRate(normBase, normQuote, options);
  const fetchedAt = new Date();

  await fxRateRepository.upsertFxRate({
    baseCurrency: fetched.base,
    quoteCurrency: fetched.quote,
    rate: fetched.rate,
    rateDate: fetched.rateDate,
    source: fetched.source,
    fetchedAt,
  });

  const ageDays = calculateAgeDays(fetched.rateDate, fetchedAt);

  return {
    baseCurrency: fetched.base,
    quoteCurrency: fetched.quote,
    rate: fetched.rate,
    rateDate: fetched.rateDate,
    source: fetched.source,
    fetchedAt,
    ageDays,
    isStale: ageDays > 7,
  };
}

/**
 * Retrieve the latest exchange rate with cold-start fallback.
 *
 * @param {string} [base='USD']
 * @param {string} [quote='INR']
 * @param {Object} [options={}]
 * @param {boolean} [options.allowLazyFetch=true]
 * @param {Object} [options.provider]
 * @returns {Promise<Object|null>}
 */
async function getLatestRate(base = 'USD', quote = 'INR', options = {}) {
  const normBase = String(base).trim().toUpperCase();
  const normQuote = String(quote).trim().toUpperCase();

  // 1. Try DB cache first
  const cached = await fxRateRepository.getLatestRate(normBase, normQuote);

  if (cached) {
    const ageDays = calculateAgeDays(cached.rateDate);
    return {
      baseCurrency: cached.baseCurrency,
      quoteCurrency: cached.quoteCurrency,
      rate: cached.rate,
      rateDate: cached.rateDate,
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      ageDays,
      isStale: ageDays > 7,
    };
  }

  // 2. Day-1 Cold-Start Safe Fallback
  // If in test environment and no custom mock provider was passed, don't make real network calls
  const isTest = process.env.NODE_ENV === 'test';
  const hasCustomProvider = Boolean(options.provider);

  if ((isTest && !hasCustomProvider) || options.allowLazyFetch === false) {
    return null;
  }

  const fetchKey = `${normBase}_${normQuote}`;
  if (!inFlightFetches.has(fetchKey)) {
    const fetchPromise = (async () => {
      try {
        logger.info(`[fxRate-service] Cold-start fetching ${normBase}/${normQuote} rate...`);
        return await fetchAndStoreLatestRate(normBase, normQuote, options);
      } catch (err) {
        logger.warn(`[fxRate-service] Cold-start FX fetch failed for ${normBase}/${normQuote}: ${err.message}`);
        return null;
      } finally {
        inFlightFetches.delete(fetchKey);
      }
    })();

    inFlightFetches.set(fetchKey, fetchPromise);
  }

  return inFlightFetches.get(fetchKey);
}

module.exports = {
  calculateAgeDays,
  fetchAndStoreLatestRate,
  getLatestRate,
};
