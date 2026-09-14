/**
 * EIA (U.S. Energy Information Administration) API v2 provider.
 *
 * Responsibilities:
 *   - Knows the EIA API URL structure, series codes, and authentication
 *   - Knows the EIA JSON response shape and how to extract a price
 *   - Normalizes EIA data into a provider-agnostic MarketPrice object
 *   - Enforces a request timeout (AbortController, no new dependency)
 *   - Never logs or exposes the API key
 *
 * The rest of the application (ingestion service, job, tests) sees only
 * the normalized MarketPrice shape — no EIA-specific fields leak out.
 *
 * Provider boundary contract:
 *   fetchLatestPrices(symbols: string[]) → MarketPrice[]
 *
 *   MarketPrice = {
 *     symbol:     string   // matches commodityMapping SUPPORTED_SYMBOLS key
 *     price:      number   // positive, finite, USD per barrel
 *     recordedAt: string   // 'YYYY-MM-DD'
 *   }
 *
 *   On any failure the function throws a ProviderError (see below).
 *
 * EIA series codes used:
 *   WTI   → RWTC  (Cushing, OK WTI Spot Price FOB, Dollars per Barrel)
 *   BRENT → RBRTE (Europe Brent Spot Price FOB, Dollars per Barrel)
 *
 * Verified live 2026-09-13:
 *   GET /v2/petroleum/pri/spt/data/?api_key=DEMO_KEY
 *     &frequency=daily&data[0]=value
 *     &facets[series][]=RWTC&facets[series][]=RBRTE
 *     &sort[0][column]=period&sort[0][direction]=desc&length=2
 *   → { response: { data: [{ period: "2026-09-09", series: "RWTC", value: "..." }, ...] } }
 */

const env = require('../config/env');
const { SUPPORTED_SYMBOLS } = require('../config/commodityMapping');

// EIA series codes for each supported symbol.
// Only symbols explicitly mapped here will be fetched — others are ignored.
const EIA_SERIES = Object.freeze({
  [SUPPORTED_SYMBOLS.WTI]: 'RWTC',
  [SUPPORTED_SYMBOLS.BRENT]: 'RBRTE',
});

/**
 * Thrown when the EIA provider fails for any reason. Callers check
 * error.code to distinguish categories:
 *   'PROVIDER_TIMEOUT'   — request exceeded the configured timeout
 *   'PROVIDER_AUTH'      — 401/403 (bad or missing API key)
 *   'PROVIDER_HTTP'      — non-2xx response other than auth
 *   'PROVIDER_PARSE'     — response body is not valid JSON or wrong shape
 *   'PROVIDER_NO_DATA'   — API returned 200 but no data rows
 *   'PROVIDER_INVALID'   — a returned price is not a finite positive number
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
 * Fetch the latest available daily prices for the given commodity symbols
 * from the EIA API v2 in a single HTTP request.
 *
 * @param {string[]} symbols - Array of SUPPORTED_SYMBOLS values to fetch.
 *                             Symbols not mapped in EIA_SERIES are skipped.
 * @returns {Promise<MarketPrice[]>}
 * @throws {ProviderError}
 */
async function fetchLatestPrices(symbols) {
  const series = symbols
    .map((sym) => EIA_SERIES[sym])
    .filter(Boolean);

  if (series.length === 0) {
    throw new ProviderError(
      'PROVIDER_NO_DATA',
      'No EIA series codes found for the requested symbols'
    );
  }

  const url = buildUrl(series);
  const timeoutMs = env.eia.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ProviderError(
        'PROVIDER_TIMEOUT',
        `EIA request timed out after ${timeoutMs}ms`,
        err
      );
    }
    throw new ProviderError(
      'PROVIDER_HTTP',
      `EIA request failed: ${err.message}`,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(
      'PROVIDER_AUTH',
      `EIA authentication failed (HTTP ${response.status}) — check EIA_API_KEY`
    );
  }

  if (!response.ok) {
    throw new ProviderError(
      'PROVIDER_HTTP',
      `EIA returned HTTP ${response.status}`
    );
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new ProviderError('PROVIDER_PARSE', 'EIA response is not valid JSON', err);
  }

  return normalize(body, symbols);
}

/**
 * Build the EIA API v2 URL for the requested series codes.
 * The API key is placed in the URL as required by EIA's spec.
 * It is never logged — callers must not log the returned URL.
 */
function buildUrl(seriesCodes) {
  const base = `${env.eia.baseUrl}/petroleum/pri/spt/data/`;
  const params = new URLSearchParams();

  params.set('api_key', env.eia.apiKey);
  params.set('frequency', 'daily');
  params.append('data[0]', 'value');

  seriesCodes.forEach((code) => {
    params.append('facets[series][]', code);
  });

  params.append('sort[0][column]', 'period');
  params.append('sort[0][direction]', 'desc');

  // Fetch one row per series code — they arrive sorted desc so the first
  // row per series is always the latest available value.
  params.set('length', String(seriesCodes.length));

  return `${base}?${params.toString()}`;
}

/**
 * Normalize the raw EIA API v2 response into MarketPrice objects.
 *
 * EIA response shape (confirmed live):
 * {
 *   response: {
 *     data: [
 *       {
 *         period: "2026-09-09",      // YYYY-MM-DD
 *         series: "RWTC",            // series code
 *         value: "67.31",            // price as string (EIA v2.1.6+)
 *         ...other fields ignored
 *       },
 *       ...
 *     ]
 *   }
 * }
 *
 * @param {object} body - Raw EIA JSON response body
 * @param {string[]} requestedSymbols - Symbols originally requested
 * @returns {MarketPrice[]}
 */
function normalize(body, requestedSymbols) {
  const rows = body?.response?.data;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ProviderError(
      'PROVIDER_NO_DATA',
      'EIA returned no data rows'
    );
  }

  // Invert EIA_SERIES map: series code → symbol
  const seriesCodeToSymbol = Object.fromEntries(
    Object.entries(EIA_SERIES).map(([sym, code]) => [code, sym])
  );

  // Deduplicate: take only the first (latest) row per series code
  // (EIA returns rows desc by period; length=N means N total rows
  // across all series codes, not N rows per series).
  const seenSeries = new Set();
  const results = [];

  for (const row of rows) {
    const seriesCode = row?.series;
    if (!seriesCode || seenSeries.has(seriesCode)) continue;
    seenSeries.add(seriesCode);

    const symbol = seriesCodeToSymbol[seriesCode];
    if (!symbol) continue; // unknown series — ignore

    // EIA v2.1.6+ returns values as strings (may be "."-separated decimal)
    const rawValue = row?.value;
    const price = typeof rawValue === 'string' ? parseFloat(rawValue) : Number(rawValue);

    if (!Number.isFinite(price) || price <= 0) {
      throw new ProviderError(
        'PROVIDER_INVALID',
        `EIA returned invalid price for ${seriesCode}: ${JSON.stringify(rawValue)}`
      );
    }

    const recordedAt = row?.period;
    if (!isValidDate(recordedAt)) {
      throw new ProviderError(
        'PROVIDER_INVALID',
        `EIA returned invalid date for ${seriesCode}: ${JSON.stringify(recordedAt)}`
      );
    }

    results.push({ symbol, price, recordedAt });
  }

  if (results.length === 0) {
    throw new ProviderError(
      'PROVIDER_NO_DATA',
      `EIA returned no usable data for series: ${requestedSymbols.join(', ')}`
    );
  }

  return results;
}

/**
 * Returns true if value is a YYYY-MM-DD string.
 */
function isValidDate(value) {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

module.exports = { fetchLatestPrices, ProviderError };
