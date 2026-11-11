/**
 * Tests for the Indian Government price provider client (src/providers/indiaGovt.provider.js).
 *
 * All tests use mocked fetch() — no real outbound HTTP requests, no API key consumed.
 * Dependencies on env.js are mocked to inject predictable test configuration.
 */

'use strict';

jest.mock('../src/config/env', () => ({
  indiaGovt: {
    enabled: true,
    apiKey: 'TEST_GOV_KEY',
    baseUrl: 'https://api.data.gov.in',
    resourceIdMandi: '9ef84268-d588-465a-a308-a864a43d0070',
    timeoutMs: 5000,
  },
  priceIngestion: {
    enabled: true,
    timeoutMs: 5000,
  },
}));

const {
  fetchLatestPrices,
  ProviderError,
  parseGoiDate,
  sanitizeUrl,
  buildUrl,
} = require('../src/providers/indiaGovt.provider');
const { SUPPORTED_SYMBOLS } = require('../src/config/commodityMapping');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGoiMandiResponse(records = []) {
  return {
    status: 'ok',
    total: records.length,
    count: records.length,
    limit: '50',
    offset: '0',
    records,
  };
}

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockFetchTimeout() {
  global.fetch = jest.fn().mockImplementation(() => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  if (global.fetch?.mockReset) global.fetch.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('indiaGovt.provider', () => {

  describe('parseGoiDate()', () => {
    test('parses DD/MM/YYYY into YYYY-MM-DD', () => {
      expect(parseGoiDate('09/11/2026')).toBe('2026-11-09');
      expect(parseGoiDate('01/01/2026')).toBe('2026-01-01');
      expect(parseGoiDate('31/12/2025')).toBe('2025-12-31');
    });

    test('preserves YYYY-MM-DD directly', () => {
      expect(parseGoiDate('2026-11-09')).toBe('2026-11-09');
    });

    test('returns null for null, undefined, non-string, or garbage strings', () => {
      expect(parseGoiDate(null)).toBeNull();
      expect(parseGoiDate(undefined)).toBeNull();
      expect(parseGoiDate('')).toBeNull();
      expect(parseGoiDate('invalid-date')).toBeNull();
    });
  });

  describe('sanitizeUrl()', () => {
    test('redacts api-key parameter in URL query string', () => {
      const raw = 'https://api.data.gov.in/resource/123?api-key=SECRET123&format=json';
      const safe = sanitizeUrl(raw);
      expect(safe).not.toContain('SECRET123');
      expect(safe).toContain('api-key=REDACTED');
    });

    test('returns [invalid-url] when given malformed URL string', () => {
      expect(sanitizeUrl('not a url')).toBe('[invalid-url]');
    });
  });

  describe('buildUrl()', () => {
    test('constructs valid data.gov.in endpoint with commodity query and api-key', () => {
      const url = buildUrl('res-id-123', 'APIKEY_TEST', 'Wheat');
      expect(url).toContain('https://api.data.gov.in/resource/res-id-123');
      expect(url).toContain('api-key=APIKEY_TEST');
      expect(url).toContain('format=json');
      expect(url).toContain('filters%5Bcommodity%5D=Wheat');
    });
  });

  describe('fetchLatestPrices()', () => {

    test('successfully normalizes Wheat response and calculates average modal price for latest date', async () => {
      mockFetch(200, makeGoiMandiResponse([
        {
          state: 'Madhya Pradesh',
          district: 'Indore',
          market: 'Indore Mandi',
          commodity: 'Wheat',
          variety: 'Dara',
          arrival_date: '08/11/2026',
          min_price: '2400',
          max_price: '2600',
          modal_price: '2500',
        },
        {
          state: 'Punjab',
          district: 'Khanna',
          market: 'Khanna Mandi',
          commodity: 'Wheat',
          variety: 'Kalyan',
          arrival_date: '09/11/2026',
          min_price: '2550',
          max_price: '2650',
          modal_price: '2600',
        },
        {
          state: 'Haryana',
          district: 'Karnal',
          market: 'Karnal Mandi',
          commodity: 'Wheat',
          variety: 'Other',
          arrival_date: '09/11/2026',
          min_price: '2600',
          max_price: '2800',
          modal_price: '2700',
        },
      ]));

      const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]);

      expect(results).toHaveLength(1);
      const wheat = results[0];
      expect(wheat.symbol).toBe('WHEAT_GOI');
      // Latest date is 09/11/2026 -> 2026-11-09. Khanna (2600) + Karnal (2700) / 2 = 2650.00
      expect(wheat.recordedAt).toBe('2026-11-09');
      expect(wheat.price).toBe(2650);
      expect(wheat.currency).toBe('INR');
      expect(wheat.unitLabel).toBe('INR/quintal');
      expect(wheat.dataClass).toBe('MARKET_INDICATIVE');
      expect(wheat.region).toBe('National Mandi Average (India)');
      expect(wheat.grade).toBe('FAQ (Fair Average Quality)');
      expect(wheat.notes).toContain('2 reporting mandis');
    });

    test('falls back to (min_price + max_price)/2 if modal_price is missing or zero', async () => {
      mockFetch(200, makeGoiMandiResponse([
        {
          state: 'Maharashtra',
          district: 'Kolhapur',
          market: 'Kolhapur Mandi',
          commodity: 'Sugar',
          arrival_date: '09/11/2026',
          min_price: '3800',
          max_price: '4000',
          modal_price: '0', // missing / zero modal
        },
      ]));

      const results = await fetchLatestPrices([SUPPORTED_SYMBOLS.SUGAR_GOI]);

      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('SUGAR_GOI');
      expect(results[0].price).toBe(3900); // (3800+4000)/2
      expect(results[0].currency).toBe('INR');
      expect(results[0].unitLabel).toBe('INR/quintal');
    });

    test('normalizes multiple GOI symbols in sequence (Sugar and Edible Oil)', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation((url) => {
        callCount++;
        if (url.includes('Sugar')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => makeGoiMandiResponse([
              {
                arrival_date: '09/11/2026',
                min_price: '3700',
                max_price: '3900',
                modal_price: '3850',
              },
            ]),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => makeGoiMandiResponse([
            {
              arrival_date: '09/11/2026',
              min_price: '13500',
              max_price: '14500',
              modal_price: '14000',
            },
          ]),
        });
      });

      const results = await fetchLatestPrices([
        SUPPORTED_SYMBOLS.SUGAR_GOI,
        SUPPORTED_SYMBOLS.EDIBLE_OIL_GOI,
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('SUGAR_GOI');
      expect(results[0].price).toBe(3850);
      expect(results[1].symbol).toBe('EDIBLE_OIL_GOI');
      expect(results[1].price).toBe(14000);
      expect(callCount).toBe(2);
    });

    test('throws PROVIDER_AUTH if GOV_DATA_API_KEY is not configured', async () => {
      const originalEnv = require('../src/config/env');
      const savedKey = originalEnv.indiaGovt.apiKey;
      originalEnv.indiaGovt.apiKey = '';

      try {
        await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]))
          .rejects
          .toMatchObject({
            name: 'ProviderError',
            code: 'PROVIDER_AUTH',
            message: expect.stringContaining('GOV_DATA_API_KEY is not configured'),
          });
      } finally {
        originalEnv.indiaGovt.apiKey = savedKey;
      }
    });

    test('throws PROVIDER_AUTH on HTTP 401 response', async () => {
      mockFetch(401, { error: 'Unauthorized' });

      await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_AUTH',
          message: expect.stringContaining('401'),
        });
    });

    test('throws PROVIDER_HTTP on HTTP 500 server error', async () => {
      mockFetch(500, { error: 'Internal Server Error' });

      await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_HTTP',
          message: expect.stringContaining('500'),
        });
    });

    test('throws PROVIDER_PARSE when response body is not valid JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON at position 0')),
      });

      await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_PARSE',
        });
    });

    test('throws PROVIDER_TIMEOUT when request aborts due to timeout', async () => {
      mockFetchTimeout();

      await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_TIMEOUT',
        });
    });

    test('throws PROVIDER_NO_DATA when no records are returned for any requested symbol', async () => {
      mockFetch(200, makeGoiMandiResponse([]));

      await expect(fetchLatestPrices([SUPPORTED_SYMBOLS.WHEAT_GOI]))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_NO_DATA',
        });
    });

    test('throws PROVIDER_NO_DATA when empty or non-GOI symbols are passed', async () => {
      await expect(fetchLatestPrices([]))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_NO_DATA',
        });

      await expect(fetchLatestPrices(['UNKNOWN_SYMBOL']))
        .rejects
        .toMatchObject({
          name: 'ProviderError',
          code: 'PROVIDER_NO_DATA',
        });
    });

  });

});
