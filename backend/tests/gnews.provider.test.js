/**
 * Tests for the GNews provider client (src/providers/gnews.provider.js).
 *
 * All tests use mocked fetch() — no real API calls, no quota consumed.
 * Provider dependencies on env.js are mocked to inject predictable values.
 */

jest.mock('../src/config/env', () => ({
  gnews: {
    apiKey: 'TEST_KEY',
    baseUrl: 'https://gnews.io/api/v4',
    timeoutMs: 5000,
  },
  newsIngestion: {
    enabled: true,
    timeoutMs: 5000,
  },
}));

const { fetchArticlesByKeyword, ProviderError } = require('../src/providers/gnews.provider');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGNewsResponse(articles) {
  return { totalArticles: articles.length, articles };
}

function makeArticle(overrides = {}) {
  return {
    title:       'Crude oil price India rises sharply',
    description: 'Oil prices surged on Monday...',
    url:         'https://example.com/article/1',
    publishedAt: '2026-09-15T08:00:00Z',
    source:      { name: 'Reuters', url: 'https://reuters.com' },
    ...overrides,
  };
}

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  if (global.fetch?.mockReset) global.fetch.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('gnews.provider — fetchArticlesByKeyword()', () => {

  // ── 1. Successful normalization ──────────────────────────────────────────

  test('1. normalizes a GNews article into NewsArticle shape', async () => {
    mockFetch(200, makeGNewsResponse([makeArticle()]));

    const results = await fetchArticlesByKeyword('crude oil price India');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title:       'Crude oil price India rises sharply',
      url:         'https://example.com/article/1',
      sourceName:  'Reuters',
      publishedAt: '2026-09-15T08:00:00Z',
      summary:     'Oil prices surged on Monday...',
    });
  });

  test('2. normalizes multiple articles', async () => {
    mockFetch(200, makeGNewsResponse([
      makeArticle({ url: 'https://example.com/1' }),
      makeArticle({ url: 'https://example.com/2', title: 'Second article' }),
    ]));

    const results = await fetchArticlesByKeyword('crude oil');
    expect(results).toHaveLength(2);
    expect(results[1].title).toBe('Second article');
  });

  test('3. maps null description to null summary', async () => {
    mockFetch(200, makeGNewsResponse([
      makeArticle({ description: null }),
    ]));

    const [result] = await fetchArticlesByKeyword('crude oil');
    expect(result.summary).toBeNull();
  });

  test('4. maps missing source name to null', async () => {
    mockFetch(200, makeGNewsResponse([
      makeArticle({ source: { url: 'https://example.com' } }), // name absent
    ]));

    const [result] = await fetchArticlesByKeyword('crude oil');
    expect(result.sourceName).toBeNull();
  });

  test('5. skips articles with no URL', async () => {
    mockFetch(200, makeGNewsResponse([
      makeArticle({ url: '' }),
      makeArticle({ url: 'https://example.com/valid' }),
    ]));

    const results = await fetchArticlesByKeyword('crude oil');
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/valid');
  });

  test('6. returns empty array when API returns zero articles', async () => {
    mockFetch(200, makeGNewsResponse([]));

    const results = await fetchArticlesByKeyword('very obscure query xyz');
    expect(results).toEqual([]);
  });

  test('7. invalid publishedAt is mapped to null', async () => {
    mockFetch(200, makeGNewsResponse([
      makeArticle({ publishedAt: 'not-a-date' }),
    ]));

    const [result] = await fetchArticlesByKeyword('crude oil');
    expect(result.publishedAt).toBeNull();
  });

  // ── 2. HTTP error handling ────────────────────────────────────────────────

  test('8. throws PROVIDER_AUTH on 401', async () => {
    mockFetch(401, { errors: ['Unauthorized'] });

    await expect(fetchArticlesByKeyword('crude oil'))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_AUTH' });
  });

  test('9. throws PROVIDER_AUTH on 403', async () => {
    mockFetch(403, { errors: ['Forbidden'] });

    await expect(fetchArticlesByKeyword('crude oil'))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_AUTH' });
  });

  test('10. throws PROVIDER_HTTP on 500', async () => {
    mockFetch(500, { errors: ['Internal server error'] });

    await expect(fetchArticlesByKeyword('crude oil'))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_HTTP' });
  });

  test('11. throws PROVIDER_HTTP on network error (fetch rejects)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(fetchArticlesByKeyword('crude oil'))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_HTTP' });
  });

  test('12. throws PROVIDER_PARSE on non-JSON response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    });

    await expect(fetchArticlesByKeyword('crude oil'))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_PARSE' });
  });

  // ── 3. Timeout ────────────────────────────────────────────────────────────

  test('13. throws PROVIDER_TIMEOUT when request is aborted', async () => {
    jest.resetModules();
    jest.mock('../src/config/env', () => ({
      gnews: { apiKey: 'TEST_KEY', baseUrl: 'https://gnews.io/api/v4', timeoutMs: 1 },
      newsIngestion: { enabled: true, timeoutMs: 1 },
    }));

    const { fetchArticlesByKeyword: fetchWithTimeout } = require('../src/providers/gnews.provider');

    global.fetch = jest.fn().mockImplementation((_url, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener?.('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
        // Never resolves — simulates hang until aborted
      })
    );

    await expect(fetchWithTimeout('crude oil'))
      .rejects.toMatchObject({ name: 'ProviderError', code: 'PROVIDER_TIMEOUT' });

    jest.resetModules();
  });
});
