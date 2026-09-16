/**
 * Tests for newsIngestion.job.js — runIngestion().
 *
 * Covers (Phase G requirements):
 *   1.  Disabled ingestion — SKIPPED, no provider call
 *   2.  No keywords configured — SUCCESS, provider not called
 *   3.  Successful run — articles inserted, sync status written
 *   4.  Provider failure — FAILED, no crash
 *   5.  PROVIDER_AUTH — logged at error level, FAILED
 *   6.  Provider timeout — FAILED, no crash
 *   7.  Overlap guard — concurrent second call returns SKIPPED/overlap
 *   8.  isRunning released after run — subsequent call proceeds normally
 *   9.  Sync status write failure is non-fatal — run resolves SUCCESS
 *   10. ingestArticle error marks run FAILED
 *   11. Duplicate articles — skipped, run remains SUCCESS
 *   12. Sync status written at run-start and run-end
 */

// ── Static mocks (must be declared before any require) ───────────────────────

jest.mock('../src/config/env', () => ({
  newsIngestion: {
    enabled: true,
    timeoutMs: 5000,
  },
  gnews: {
    apiKey: 'TEST_KEY',
    baseUrl: 'https://gnews.io/api/v4',
    timeoutMs: 5000,
  },
  cron: { newsIngestion: '0 * * * *' },
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock('../src/providers/gnews.provider', () => ({
  fetchArticlesByKeyword: jest.fn(),
  ProviderError: class ProviderError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'ProviderError';
      this.code = code;
    }
  },
}));

jest.mock('../src/repositories/news.repository', () => ({
  listKeywordsWithIndustry: jest.fn(),
}));

jest.mock('../src/services/newsIngestion.service', () => ({
  ingestArticle: jest.fn(),
}));

jest.mock('../src/repositories/syncStatus.repository', () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

// ── Test setup ────────────────────────────────────────────────────────────────

let runIngestion;

beforeEach(() => {
  jest.resetModules();

  jest.mock('../src/config/env', () => ({
    newsIngestion: { enabled: true, timeoutMs: 5000 },
    gnews: { apiKey: 'TEST_KEY', baseUrl: 'https://gnews.io/api/v4', timeoutMs: 5000 },
    cron:  { newsIngestion: '0 * * * *' },
  }));

  jest.mock('node-cron', () => ({
    schedule: jest.fn(() => ({ stop: jest.fn() })),
  }));

  jest.mock('../src/providers/gnews.provider', () => ({
    fetchArticlesByKeyword: jest.fn(),
    ProviderError: class ProviderError extends Error {
      constructor(code, message) {
        super(message);
        this.name = 'ProviderError';
        this.code = code;
      }
    },
  }));

  jest.mock('../src/repositories/news.repository', () => ({
    listKeywordsWithIndustry: jest.fn(),
  }));

  jest.mock('../src/services/newsIngestion.service', () => ({
    ingestArticle: jest.fn(),
  }));

  jest.mock('../src/repositories/syncStatus.repository', () => ({
    upsert: jest.fn().mockResolvedValue(undefined),
  }));

  jest.mock('../src/utils/logger', () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  }));

  ({ runIngestion } = require('../src/jobs/newsIngestion.job'));
});

afterEach(() => jest.clearAllMocks());

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeArticle(overrides = {}) {
  return {
    title:       'Test article',
    url:         'https://example.com/article/1',
    sourceName:  'Reuters',
    publishedAt: '2026-09-15T08:00:00Z',
    summary:     null,
    ...overrides,
  };
}

const SAMPLE_KEYWORDS = [
  { id: 1, keyword: 'crude oil price India', industry_id: 1 },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('newsIngestion.job — runIngestion()', () => {

  test('1. disabled ingestion — SKIPPED, provider not called', async () => {
    jest.resetModules();
    jest.mock('../src/config/env', () => ({
      newsIngestion: { enabled: false, timeoutMs: 5000 },
      gnews: { apiKey: 'TEST_KEY', baseUrl: 'https://gnews.io/api/v4', timeoutMs: 5000 },
      cron:  { newsIngestion: '0 * * * *' },
    }));
    jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));
    jest.mock('../src/providers/gnews.provider', () => ({ fetchArticlesByKeyword: jest.fn(), ProviderError: class ProviderError extends Error {} }));
    jest.mock('../src/repositories/news.repository', () => ({ listKeywordsWithIndustry: jest.fn() }));
    jest.mock('../src/services/newsIngestion.service', () => ({ ingestArticle: jest.fn() }));
    jest.mock('../src/repositories/syncStatus.repository', () => ({ upsert: jest.fn().mockResolvedValue(undefined) }));
    jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn().mockResolvedValue(undefined) }));

    const { runIngestion: run } = require('../src/jobs/newsIngestion.job');
    const gnews   = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');

    const result = await run();
    expect(result).toMatchObject({ status: 'SKIPPED', reason: 'disabled' });
    expect(gnews.fetchArticlesByKeyword).not.toHaveBeenCalled();
    expect(newsRepo.listKeywordsWithIndustry).not.toHaveBeenCalled();
  });

  test('2. no keywords configured — SUCCESS, provider not called', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue([]);

    const result = await runIngestion();
    expect(result.status).toBe('SUCCESS');
    expect(gnews.fetchArticlesByKeyword).not.toHaveBeenCalled();
  });

  test('3. successful run — articles inserted, sync status written twice', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');
    const svc      = require('../src/services/newsIngestion.service');
    const syncRepo = require('../src/repositories/syncStatus.repository');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue(SAMPLE_KEYWORDS);
    gnews.fetchArticlesByKeyword.mockResolvedValue([makeArticle()]);
    svc.ingestArticle.mockResolvedValue({ status: 'inserted', newsItemId: 1 });

    const result = await runIngestion();

    expect(result.status).toBe('SUCCESS');
    expect(result.inserted).toBe(1);
    expect(svc.ingestArticle).toHaveBeenCalledTimes(1);
    // Sync status written at start (null) and end (SUCCESS)
    expect(syncRepo.upsert).toHaveBeenCalledTimes(2);
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'SUCCESS' });
  });

  test('4. provider failure — FAILED, does not throw', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');
    const syncRepo = require('../src/repositories/syncStatus.repository');
    const { ProviderError } = require('../src/providers/gnews.provider');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue(SAMPLE_KEYWORDS);
    gnews.fetchArticlesByKeyword.mockRejectedValue(
      new ProviderError('PROVIDER_HTTP', 'GNews returned HTTP 503')
    );

    const result = await expect(runIngestion()).resolves.toMatchObject({ status: 'FAILED' });
    void result;
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'FAILED' });
  });

  test('5. PROVIDER_AUTH — logged at error level, run marked FAILED', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');
    const logger   = require('../src/utils/logger');
    const { ProviderError } = require('../src/providers/gnews.provider');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue(SAMPLE_KEYWORDS);
    gnews.fetchArticlesByKeyword.mockRejectedValue(
      new ProviderError('PROVIDER_AUTH', 'GNews returned HTTP 401')
    );

    const result = await runIngestion();
    expect(result.status).toBe('FAILED');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Provider auth error')
    );
  });

  test('6. provider timeout — FAILED, does not throw', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');
    const { ProviderError } = require('../src/providers/gnews.provider');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue(SAMPLE_KEYWORDS);
    gnews.fetchArticlesByKeyword.mockRejectedValue(
      new ProviderError('PROVIDER_TIMEOUT', 'GNews request timed out after 15000ms')
    );

    await expect(runIngestion()).resolves.toMatchObject({ status: 'FAILED' });
  });

  test('7. concurrent second call while first is running — returns SKIPPED/overlap', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');

    let resolve1;
    newsRepo.listKeywordsWithIndustry.mockReturnValueOnce(
      new Promise((resolve) => { resolve1 = resolve; })
    );

    const first = runIngestion();
    await Promise.resolve();

    const second = await runIngestion();
    expect(second).toMatchObject({ status: 'SKIPPED', reason: 'overlap' });

    resolve1([]);
    await first;
    void gnews;
  });

  test('8. isRunning released after run — subsequent call proceeds normally', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue([]);
    const first = await runIngestion();
    expect(first.status).toBe('SUCCESS');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue([]);
    gnews.fetchArticlesByKeyword.mockResolvedValue([]);
    const second = await runIngestion();
    expect(second.status).toBe('SUCCESS');
    expect(second).not.toMatchObject({ reason: 'overlap' });
  });

  test('9. sync status write failure is non-fatal — run resolves SUCCESS', async () => {
    const newsRepo = require('../src/repositories/news.repository');
    const syncRepo = require('../src/repositories/syncStatus.repository');
    const logger   = require('../src/utils/logger');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue([]);
    syncRepo.upsert
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB gone'));

    const result = await runIngestion();
    expect(result.status).toBe('SUCCESS');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not write run-end'),
      expect.any(String)
    );
  });

  test('10. ingestArticle returning error marks run FAILED', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');
    const svc      = require('../src/services/newsIngestion.service');
    const syncRepo = require('../src/repositories/syncStatus.repository');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue(SAMPLE_KEYWORDS);
    gnews.fetchArticlesByKeyword.mockResolvedValue([makeArticle()]);
    svc.ingestArticle.mockResolvedValue({
      status: 'error', error: new Error('ER_LOCK_WAIT_TIMEOUT'),
    });

    const result = await runIngestion();
    expect(result.status).toBe('FAILED');
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'FAILED' });
  });

  test('11. duplicate articles — skipped, run remains SUCCESS', async () => {
    const gnews    = require('../src/providers/gnews.provider');
    const newsRepo = require('../src/repositories/news.repository');
    const svc      = require('../src/services/newsIngestion.service');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue(SAMPLE_KEYWORDS);
    gnews.fetchArticlesByKeyword.mockResolvedValue([makeArticle()]);
    svc.ingestArticle.mockResolvedValue({ status: 'skipped', reason: 'duplicate' });

    const result = await runIngestion();
    expect(result.status).toBe('SUCCESS');
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
  });

  test('12. sync status written at run-start (null lastStatus) and run-end', async () => {
    const newsRepo = require('../src/repositories/news.repository');
    const syncRepo = require('../src/repositories/syncStatus.repository');

    newsRepo.listKeywordsWithIndustry.mockResolvedValue([]);

    await runIngestion();

    expect(syncRepo.upsert).toHaveBeenCalledTimes(2);
    // Run-start: lastStatus not set (null)
    expect(syncRepo.upsert.mock.calls[0][1]).toMatchObject({ lastStatus: null });
    // Run-end: lastStatus = SUCCESS
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'SUCCESS' });
  });
});
