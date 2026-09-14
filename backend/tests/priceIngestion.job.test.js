/**
 * Tests for the price ingestion job (src/jobs/priceIngestion.job.js).
 *
 * Tests call the exported runIngestion() directly — no waiting for cron ticks.
 * All I/O dependencies are mocked; no DB pool is created, no EIA calls made.
 *
 * jest.resetModules() is called in beforeEach so the in-module isRunning flag
 * resets between tests (it is a module-level variable in the job).
 *
 * Jest rule: jest.mock() factory functions must not close over out-of-scope
 * variables (they are hoisted at parse time). Each mock is therefore a
 * self-contained static inline factory.
 */

// ─── Default mocks — applied to every test via beforeEach ────────────────────
// These are declared at module scope so Jest's hoisting works correctly.
// Each test that needs different behaviour re-requires after resetModules().

beforeEach(() => {
  jest.resetModules();

  // env: ingestion ENABLED (default for most tests)
  jest.mock('../src/config/env', () => ({
    priceIngestion: { enabled: true, timeoutMs: 5000 },
    cron: { priceIngestion: '0 5 * * *' },
    eia: { apiKey: 'TEST_KEY', baseUrl: 'https://api.eia.gov/v2', timeoutMs: 5000 },
  }));

  // Prevent database/connection from trying to create a real MySQL pool
  jest.mock('../src/database/connection', () => ({
    pool: { execute: jest.fn() },
    testConnection: jest.fn().mockResolvedValue(true),
  }));

  jest.mock('../src/providers/eia.provider', () => ({
    fetchLatestPrices: jest.fn(),
    ProviderError: class ProviderError extends Error {
      constructor(code, message) {
        super(message);
        this.name = 'ProviderError';
        this.code = code;
      }
    },
  }));

  jest.mock('../src/repositories/material.repository', () => ({
    findTrackedByExternalSymbol: jest.fn().mockResolvedValue([]),
  }));

  jest.mock('../src/repositories/syncStatus.repository', () => ({
    upsert: jest.fn().mockResolvedValue(undefined),
  }));

  jest.mock('../src/services/priceIngestion.service', () => ({
    ingestFromProvider: jest.fn().mockResolvedValue({
      status: 'inserted', trackedMaterialId: 1, businessId: 1,
    }),
  }));

  jest.mock('../src/utils/logger', () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  }));
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('priceIngestion.job — runIngestion()', () => {

  // ── 1. Disabled ingestion ────────────────────────────────────────────────────

  test('1. returns SKIPPED and does not call provider when PRICE_INGESTION_ENABLED=false', async () => {
    // Override env mock with ingestion disabled for this test only
    jest.resetModules();
    jest.mock('../src/config/env', () => ({
      priceIngestion: { enabled: false, timeoutMs: 5000 },
      cron: { priceIngestion: '0 5 * * *' },
      eia: { apiKey: 'TEST_KEY', baseUrl: 'https://api.eia.gov/v2', timeoutMs: 5000 },
    }));
    jest.mock('../src/database/connection', () => ({
      pool: { execute: jest.fn() },
      testConnection: jest.fn(),
    }));
    jest.mock('../src/providers/eia.provider', () => ({
      fetchLatestPrices: jest.fn(),
      ProviderError: class extends Error {},
    }));
    jest.mock('../src/repositories/material.repository', () => ({
      findTrackedByExternalSymbol: jest.fn(),
    }));
    jest.mock('../src/repositories/syncStatus.repository', () => ({
      upsert: jest.fn(),
    }));
    jest.mock('../src/services/priceIngestion.service', () => ({
      ingestFromProvider: jest.fn(),
    }));
    jest.mock('../src/utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn(),
    }));

    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const result = await runIngestion();

    expect(result).toMatchObject({ status: 'SKIPPED', reason: 'disabled' });
    // Provider must NOT have been called
    expect(require('../src/providers/eia.provider').fetchLatestPrices).not.toHaveBeenCalled();
  });

  // ── 2. Provider call ─────────────────────────────────────────────────────────

  test('2. fetches both WTI and BRENT symbols in a single provider call', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia = require('../src/providers/eia.provider');

    eia.fetchLatestPrices.mockResolvedValue([
      { symbol: 'WTI',   price: 67.31, recordedAt: '2026-09-09' },
      { symbol: 'BRENT', price: 71.45, recordedAt: '2026-09-09' },
    ]);

    await runIngestion();

    expect(eia.fetchLatestPrices).toHaveBeenCalledTimes(1);
    const symbols = eia.fetchLatestPrices.mock.calls[0][0];
    expect(symbols).toContain('WTI');
    expect(symbols).toContain('BRENT');
  });

  // ── 3. Material matching + service reuse ─────────────────────────────────────

  test('3. calls ingestFromProvider for each matched tracked material', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia     = require('../src/providers/eia.provider');
    const matRepo = require('../src/repositories/material.repository');
    const svc     = require('../src/services/priceIngestion.service');

    eia.fetchLatestPrices.mockResolvedValue([
      { symbol: 'WTI',   price: 67.31, recordedAt: '2026-09-09' },
      { symbol: 'BRENT', price: 71.45, recordedAt: '2026-09-09' },
    ]);
    // WTI → 2 materials, BRENT → 1 material
    matRepo.findTrackedByExternalSymbol.mockImplementation((symbol) => {
      if (symbol === 'WTI')   return Promise.resolve([{ id: 1, business_id: 10 }, { id: 2, business_id: 11 }]);
      if (symbol === 'BRENT') return Promise.resolve([{ id: 3, business_id: 10 }]);
      return Promise.resolve([]);
    });

    await runIngestion();

    expect(svc.ingestFromProvider).toHaveBeenCalledTimes(3);
  });

  test('4. existing priceIngestion.service.ingestFromProvider is reused — not reimplemented in the job', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia     = require('../src/providers/eia.provider');
    const matRepo = require('../src/repositories/material.repository');
    const svc     = require('../src/services/priceIngestion.service');

    eia.fetchLatestPrices.mockResolvedValue([
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-09' },
    ]);
    matRepo.findTrackedByExternalSymbol.mockResolvedValue([{ id: 5, business_id: 20 }]);

    await runIngestion();

    expect(svc.ingestFromProvider).toHaveBeenCalledWith(
      { id: 5, business_id: 20 },
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-09' }
    );
  });

  // ── 4. Sync status ───────────────────────────────────────────────────────────

  test('5. writes sync status at run start (lastStatus=null) and run end (lastStatus=SUCCESS)', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia      = require('../src/providers/eia.provider');
    const syncRepo = require('../src/repositories/syncStatus.repository');

    eia.fetchLatestPrices.mockResolvedValue([]);

    await runIngestion();

    expect(syncRepo.upsert).toHaveBeenCalledTimes(2);
    expect(syncRepo.upsert.mock.calls[0][1]).toMatchObject({ lastStatus: null });
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'SUCCESS' });
  });

  // ── 5. Duplicate handling ────────────────────────────────────────────────────

  test('6. skipped duplicates do not mark the run as FAILED', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia      = require('../src/providers/eia.provider');
    const matRepo  = require('../src/repositories/material.repository');
    const svc      = require('../src/services/priceIngestion.service');
    const syncRepo = require('../src/repositories/syncStatus.repository');

    eia.fetchLatestPrices.mockResolvedValue([
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-09' },
    ]);
    matRepo.findTrackedByExternalSymbol.mockResolvedValue([{ id: 1, business_id: 10 }]);
    svc.ingestFromProvider.mockResolvedValue({
      status: 'skipped', trackedMaterialId: 1, businessId: 10, reason: 'duplicate',
    });

    const result = await runIngestion();

    expect(result.status).toBe('SUCCESS');
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'SUCCESS' });
  });

  // ── 6. Provider errors ───────────────────────────────────────────────────────

  test('7. provider failure marks run as FAILED without throwing', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia      = require('../src/providers/eia.provider');
    const syncRepo = require('../src/repositories/syncStatus.repository');

    eia.fetchLatestPrices.mockRejectedValue(
      Object.assign(new Error('EIA timeout'), { name: 'ProviderError', code: 'PROVIDER_TIMEOUT' })
    );

    const result = await runIngestion();

    expect(result.status).toBe('FAILED');
    expect(result.error).toBeDefined();
    expect(syncRepo.upsert.mock.calls[1][1]).toMatchObject({ lastStatus: 'FAILED' });
  });

  test('8. unexpected provider crash does not propagate — run resolves as FAILED', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia = require('../src/providers/eia.provider');

    eia.fetchLatestPrices.mockRejectedValue(new Error('Unexpected crash'));

    await expect(runIngestion()).resolves.toMatchObject({ status: 'FAILED' });
  });

  // ── 7. No matched materials ──────────────────────────────────────────────────

  test('9. no tracked materials linked to any symbol → run succeeds, ingestFromProvider not called', async () => {
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia = require('../src/providers/eia.provider');
    const svc = require('../src/services/priceIngestion.service');

    eia.fetchLatestPrices.mockResolvedValue([
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-09' },
    ]);
    // findTrackedByExternalSymbol returns [] by default (from beforeEach mock)

    const result = await runIngestion();

    expect(result.status).toBe('SUCCESS');
    expect(svc.ingestFromProvider).not.toHaveBeenCalled();
  });

  // ── 8. Alert evaluation guarantee ───────────────────────────────────────────

  test('10. ingestFromProvider called exactly once per matched material (alert eval is service responsibility)', async () => {
    // ingestFromProvider wraps both priceRepository.create() and
    // alertEvaluationService.evaluateMaterial(). One call per material
    // guarantees alert evaluation fires exactly once per price — the service
    // unit tests cover the internal behaviour.
    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia     = require('../src/providers/eia.provider');
    const matRepo = require('../src/repositories/material.repository');
    const svc     = require('../src/services/priceIngestion.service');

    eia.fetchLatestPrices.mockResolvedValue([
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-09' },
    ]);
    matRepo.findTrackedByExternalSymbol.mockImplementation((symbol) =>
      symbol === 'WTI'
        ? Promise.resolve([{ id: 1, business_id: 10 }])
        : Promise.resolve([])
    );

    await runIngestion();

    expect(svc.ingestFromProvider).toHaveBeenCalledTimes(1);
    expect(svc.ingestFromProvider).toHaveBeenCalledWith(
      { id: 1, business_id: 10 },
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-09' }
    );
  });
});
