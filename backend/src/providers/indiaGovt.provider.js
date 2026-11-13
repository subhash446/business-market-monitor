/**
 * Indian Government Open Data (data.gov.in / Agmarknet / MoAFW) price provider.
 *
 * Responsibilities:
 *   - Interfaces with the official Open Government Data Platform India (data.gov.in)
 *   - Queries authentic datasets:
 *       • Resource 9ef84268-d588-465a-a308-a864a43d0070:
 *         Current Daily Price of Various Commodities from Various Markets (Mandi)
 *         (Directorate of Marketing & Inspection, Ministry of Agriculture & Farmers Welfare)
 *   - Normalizes data into provider-agnostic MarketPrice objects
 *   - Preserves currency (INR), unit (INR/quintal), grade, and regional metadata
 *   - Enforces timeout via AbortController and sanitizes URLs so API keys are never leaked
 *
 * Supported symbols:
 *   WHEAT_GOI      → Commodity: 'Wheat'       (Unit: INR/quintal)
 *   SUGAR_GOI      → Commodity: 'Sugar'       (Unit: INR/quintal)
 *   EDIBLE_OIL_GOI → Commodity: 'Mustard Oil' (Unit: INR/quintal)
 */

'use strict';

const env = require('../config/env');
const { SUPPORTED_SYMBOLS, COMMODITY_METADATA } = require('../config/commodityMapping');
const { PRICE_SOURCE } = require('../constants/enums');

// Mapping of internal symbols to data.gov.in query parameters
const GOI_MAPPINGS = Object.freeze({
  [SUPPORTED_SYMBOLS.WHEAT_GOI]: {
    commodityQuery: 'Wheat',
    defaultGrade: 'FAQ (Fair Average Quality)',
    defaultRegion: 'National Mandi Average (India)',
  },
  [SUPPORTED_SYMBOLS.SUGAR_GOI]: {
    commodityQuery: 'Sugar',
    defaultGrade: 'Commercial Grade (M-30)',
    defaultRegion: 'National Mandi Average (India)',
  },
  [SUPPORTED_SYMBOLS.EDIBLE_OIL_GOI]: {
    commodityQuery: 'Mustard Oil',
    defaultGrade: 'Refined / Packed',
    defaultRegion: 'National Mandi Average (India)',
  },
});

/**
 * Thrown when the Indian Government provider fails.
 * Callers inspect error.code to categorize:
 *   'PROVIDER_TIMEOUT'   — request exceeded configured timeout
 *   'PROVIDER_AUTH'      — 401/403 or unconfigured GOV_DATA_API_KEY
 *   'PROVIDER_HTTP'      — non-2xx HTTP status code
 *   'PROVIDER_PARSE'     — response body is not valid JSON
 *   'PROVIDER_NO_DATA'   — 200 returned but no records found
 *   'PROVIDER_INVALID'   — returned price is NaN, negative, or non-finite
 */
class ProviderError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * Strips the api-key query parameter from a URL string for safe logging.
 *
 * @param {string} urlStr
 * @returns {string} Sanitized URL
 */
function sanitizeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.searchParams.has('api-key')) {
      parsed.searchParams.set('api-key', 'REDACTED');
    }
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Parses government date strings into standard ISO YYYY-MM-DD.
 *
 * Handles:
 *   - "DD/MM/YYYY" (standard Agmarknet arrival_date format, e.g. "09/11/2026")
 *   - "YYYY-MM-DD"
 *
 * @param {string} raw
 * @returns {string|null} YYYY-MM-DD or null if invalid
 */
function parseGoiDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // Match DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    return trimmed;
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Builds the data.gov.in API request URL for a specific commodity filter.
 *
 * @param {string} resourceId
 * @param {string} apiKey
 * @param {string} commodity
 * @returns {string}
 */
function buildUrl(resourceId, apiKey, commodity) {
  const baseUrl = (env.indiaGovt.baseUrl || 'https://api.data.gov.in').replace(/\/+$/, '');
  const params = new URLSearchParams({
    'api-key': apiKey,
    format: 'json',
    limit: '50',
    'filters[commodity]': commodity,
  });

  return `${baseUrl}/resource/${resourceId}?${params.toString()}`;
}

/**
 * Fetch the latest available daily prices for the requested Indian Government
 * commodity symbols from data.gov.in.
 *
 * @param {string[]} symbols - Array of SUPPORTED_SYMBOLS to fetch.
 * @returns {Promise<Array<object>>} Array of normalized MarketPrice objects.
 * @throws {ProviderError}
 */
async function fetchLatestPrices(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new ProviderError('PROVIDER_NO_DATA', 'No symbols requested for India Govt provider');
  }

  // Filter only symbols handled by this provider
  const validSymbols = symbols.filter((sym) => Boolean(GOI_MAPPINGS[sym]));
  if (validSymbols.length === 0) {
    throw new ProviderError(
      'PROVIDER_NO_DATA',
      'None of the requested symbols are supported by the India Govt provider'
    );
  }

  const apiKey = env.indiaGovt.apiKey;
  if (!apiKey || String(apiKey).trim() === '') {
    throw new ProviderError(
      'PROVIDER_AUTH',
      'GOV_DATA_API_KEY is not configured. Set GOV_DATA_API_KEY in your environment.'
    );
  }

  const resourceId = env.indiaGovt.resourceIdMandi || '9ef84268-d588-465a-a308-a864a43d0070';
  const timeoutMs = env.indiaGovt.timeoutMs || 15000;
  const results = [];

  for (const symbol of validSymbols) {
    const mapping = GOI_MAPPINGS[symbol];
    const meta = COMMODITY_METADATA[symbol] || {};
    const rawUrl = buildUrl(resourceId, apiKey, mapping.commodityQuery);
    const safeUrl = sanitizeUrl(rawUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(rawUrl, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timer);
      if (fetchErr.name === 'AbortError') {
        throw new ProviderError(
          'PROVIDER_TIMEOUT',
          `data.gov.in request timed out after ${timeoutMs}ms for ${symbol}`,
          fetchErr
        );
      }
      throw new ProviderError(
        'PROVIDER_HTTP',
        `Network failure requesting data.gov.in for ${symbol}: ${fetchErr.message}`,
        fetchErr
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        'PROVIDER_AUTH',
        `data.gov.in returned HTTP ${response.status} — verify GOV_DATA_API_KEY`
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        'PROVIDER_HTTP',
        `data.gov.in returned non-2xx status ${response.status} for ${safeUrl}`
      );
    }

    let json;
    try {
      json = await response.json();
    } catch (parseErr) {
      throw new ProviderError(
        'PROVIDER_PARSE',
        `data.gov.in response for ${symbol} was not valid JSON`,
        parseErr
      );
    }

    const records = Array.isArray(json?.records) ? json.records : [];
    if (records.length === 0) {
      continue;
    }

    // Group records by arrival_date to locate the latest reporting date
    const parsedRecords = records
      .map((r) => {
        const modal = parseFloat(r.modal_price);
        const minP = parseFloat(r.min_price);
        const maxP = parseFloat(r.max_price);
        const p = !isNaN(modal) && modal > 0
          ? modal
          : (!isNaN(minP) && !isNaN(maxP) && minP > 0 && maxP > 0 ? (minP + maxP) / 2 : NaN);

        return {
          price: p,
          dateIso: parseGoiDate(r.arrival_date),
          market: r.market || r.district || 'Mandi',
          state: r.state || 'India',
        };
      })
      .filter((r) => Number.isFinite(r.price) && r.price > 0 && r.dateIso !== null);

    if (parsedRecords.length === 0) {
      continue;
    }

    // Find the latest recorded date
    parsedRecords.sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso));
    const latestDate = parsedRecords[0].dateIso;

    // Calculate the average modal price across mandis reporting on the latest date
    const latestDateRecords = parsedRecords.filter((r) => r.dateIso === latestDate);
    const avgPrice =
      latestDateRecords.reduce((sum, r) => sum + r.price, 0) / latestDateRecords.length;
    const roundedPrice = Math.round(avgPrice * 100) / 100;

    results.push({
      symbol,
      price: roundedPrice,
      recordedAt: latestDate,
      source: meta.priceSource || PRICE_SOURCE.GOVERNMENT_DATASET,
      currency: meta.currency || 'INR',
      unitLabel: meta.unitLabel || 'INR/quintal',
      dataClass: meta.dataClass || 'MARKET_INDICATIVE',
      providerName: meta.provider || 'Data.gov.in (Agmarknet / MoAFW)',
      sourceUrl: meta.sourceUrl || `https://data.gov.in/resource/${resourceId}`,
      region: mapping.defaultRegion,
      grade: mapping.defaultGrade,
      notes: `Average modal price across ${latestDateRecords.length} reporting mandis on ${latestDate}.`,
    });
  }

  if (results.length === 0) {
    throw new ProviderError(
      'PROVIDER_NO_DATA',
      'No price observations returned by data.gov.in for the requested symbols'
    );
  }

  return results;
}

module.exports = {
  fetchLatestPrices,
  ProviderError,
  parseGoiDate,   // exported for testing
  sanitizeUrl,    // exported for testing
  buildUrl,       // exported for testing
  GOI_MAPPINGS,   // exported for testing
};
