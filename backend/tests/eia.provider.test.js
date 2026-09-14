/**
 * Tests for the EIA provider client (src/providers/eia.provider.js).
 *
 * All tests use mocked fetch() — no real API calls, no quota consumed.
 * The module's dependencies on env.js are mocked to inject predictable
 * test values without touching the real .env file.
 */

// Mock env.js so the provider can be required without a real .env
jest.mock('../src/config/env', () => ({
  eia: {
    apiKey: 'TEST_KEY',
    baseUrl: 'https://api.eia.gov/v2',
    timeoutMs: 5000,
  },
  priceIngestion: {
    enabled: true,
    timeoutMs: 5000,
  },
}));

const { fetchLatestPrices, ProviderError } = require('../src/providers/eia.provider');
const { SUPPORTED_SYMBOLS } = require('../src/config/commodityMapping');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal valid EIA v2 response body for the given series codes.
 */
function makeEiaResponse(entries) {
  return {
    response: {
      total: String(entries.length),
      dateFormat: 'YYYY-MM-DD',
      frequency: 'daily',
      data: entries,
    },
  };
}

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockFetchNetworkError(message = 'Network error') {
  global.fetch = jest.fn().mockRejectedValue(new Error(message));
}

function mockFetchTimeout() {
  global.fetch = jest.fn().mockImplementation((_url, opts) =>
    new Promise((_resolve, reject) => {
      // Simulate the AbortController firing immediately
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    })
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  if (global.fetch?.mockReset) global.fetch.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('eia.provider — fetchLatestPrices()', () => {

  // ── 1. Successful normalization ─────────────────────────────────────────────

  test('1. normalizes WTI response into MarketPrice', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: '67.31' },
    ]));

    const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      symbol: 'WTI',
      price: 67.31,
      recordedAt: '2026-09-09',
    });
  });

  test('2. normalizes Brent response into MarketPrice', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RBRTE', value: '71.45' },
    ]));

    const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.BRENT]);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      symbol: 'BRENT',
      price: 71.45,
      recordedAt: '2026-09-09',
    });
  });

  test('3. normalizes both WTI and BRENT in a single call', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC',  value: '67.31' },
      { period: '2026-09-09', series: 'RBRTE', value: '71.45' },
    ]));

    const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.WTI, SUPPORTED_SYMBOLS.BRENT]);

    expect(results).toHaveLength(2);
    const wti   = results.find((r) => r.symbol === 'WTI');
    const brent = results.find((r) => r.symbol === 'BRENT');
    expect(wti).toEqual({ symbol: 'WTI',   price: 67.31, recordedAt: '2026-09-09' });
    expect(brent).toEqual({ symbol: 'BRENT', price: 71.45, recordedAt: '2026-09-09' });
  });

  test('4. handles EIA string price values (v2.1.6+ behavior)', async () => {
    // EIA returns prices as strings since v2.1.6
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: '67.3100' },
    ]));

    const [result] = await fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]);
    expect(result.price).toBe(67.31);
    expect(typeof result.price).toBe('number');
  });

  // ── 2. Invalid / missing provider data ──────────────────────────────────────

  test('5. throws PROVIDER_INVALID for a zero price', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: '0' },
    ]));

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_INVALID' });
  });

  test('6. throws PROVIDER_INVALID for a negative price', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: '-5.00' },
    ]));

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_INVALID' });
  });

  test('7. throws PROVIDER_INVALID for a NaN price', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: 'n/a' },
    ]));

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_INVALID' });
  });

  test('8. throws PROVIDER_INVALID for a missing/null price', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: null },
    ]));

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_INVALID' });
  });

  test('9. throws PROVIDER_INVALID for a bad date format', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '09/09/2026', series: 'RWTC', value: '67.31' },
    ]));

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_INVALID' });
  });

  test('10. throws PROVIDER_NO_DATA for an empty data array', async () => {
    mockFetch(200, makeEiaResponse([]));

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_NO_DATA' });
  });

  test('11. throws PROVIDER_PARSE for non-JSON response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    });

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_PARSE' });
  });

  // ── 3. Provider timeout / error ─────────────────────────────────────────────

  test('12. throws PROVIDER_TIMEOUT when request times out', async () => {
    // Override timeout to 1ms so AbortController fires immediately
    jest.mock('../src/config/env', () => ({
      eia: { apiKey: 'TEST_KEY', baseUrl: 'https://api.eia.gov/v2', timeoutMs: 1 },
      priceIngestion: { enabled: true, timeoutMs: 1 },
    }));

    // Clear module cache and re-require with 1ms timeout
    jest.resetModules();
    const { fetchLatestPrices: fetchWithTimeout } = require('../src/providers/eia.provider');

    global.fetch = jest.fn().mockImplementation((_url, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener?.('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
        // Never resolves — simulates a hang until aborted
      })
    );

    await expect(fetchWithTimeout([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_TIMEOUT' });

    jest.resetModules();
  });

  test('13. throws PROVIDER_HTTP on 5xx server error', async () => {
    mockFetch(500, { error: 'Internal server error' });

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_HTTP' });
  });

  test('14. throws PROVIDER_AUTH on 401 unauthorized', async () => {
    mockFetch(401, { error: 'Unauthorized' });

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_AUTH' });
  });

  test('15. throws PROVIDER_AUTH on 403 forbidden', async () => {
    mockFetch(403, { error: 'Forbidden' });

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_AUTH' });
  });

  test('16. throws PROVIDER_HTTP on network error (fetch rejects)', async () => {
    mockFetchNetworkError('ECONNREFUSED');

    await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_HTTP' });
  });

  // ── 4. Symbol / mapping edge cases ─────────────────────────────────────────

  test('17. ignores unknown series codes in the response', async () => {
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC',   value: '67.31' },
      { period: '2026-09-09', series: 'UNKNOWN', value: '99.99' },
    ]));

    const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]);
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('WTI');
  });

  test('18. throws PROVIDER_NO_DATA when no symbols map to EIA series', async () => {
    await expect(fetchLatestPrices(['UNSUPPORTED_SYMBOL']))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_NO_DATA' });
  });

  test('19. takes only the first (latest) row per series when multiple returned', async () => {
    // EIA returns rows desc by period; we should take period 2026-09-09 not 2026-09-08
    mockFetch(200, makeEiaResponse([
      { period: '2026-09-09', series: 'RWTC', value: '67.31' },
      { period: '2026-09-08', series: 'RWTC', value: '66.00' },
    ]));

    const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.WTI]);
    expect(results).toHaveLength(1);
    expect(results[0].recordedAt).toBe('2026-09-09');
    expect(results[0].price).toBe(67.31);
  });
});
