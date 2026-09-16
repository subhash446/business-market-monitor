/**
 * Tests for aiInsights.job.js -- runInsights()
 *
 * Covers:
 *   1.  Disabled -- AI_INSIGHTS_ENABLED=false -> SKIPPED, no repo calls
 *   2.  Overlap guard -- concurrent second call returns SKIPPED/overlap
 *   3.  isRunning released after run -- subsequent call proceeds normally
 *   4.  No tracked materials -- SUCCESS with zero counts, no generateAndStore call
 *   5.  Happy path -- 2 materials generated, sync status written
 *   6.  One material returns status=skipped (insufficient evidence) -> counts correctly
 *   7.  One material returns status=error -> job status=FAILED, continues to next
 *   8.  materialRepository.findAllTracked throws -> job status=FAILED, resolved not thrown
 *   9.  priceRepository.findHistoryForMaterial throws -> material counted as error, continues
 *   10. newsRepository.listRecentByIndustry throws -> insight generated anyway (prices only)
 *   11. Sync status written at run-start (lastRunAt set) and run-end (lastStatus set)
 *   12. Sync status write failure is non-fatal -- run resolves normally
 *   13. material with null industry_id -- news fetch is skipped, insight generated with prices only
 *   14. PROVIDER_AUTH from generateAndStore propagated as error, job=FAILED
 *   15. start() registers cron with UTC timezone
 */

// ── Static mocks (before any require) ─────────────────────────────────────────

jest.mock('../src/config/env', () => ({
  aiInsights: { enabled: true, timeoutMs: 30000 },
  gemini:     { model: 'gemini-1.5-flash' },
  cron:       { aiInsights: '0 6 * * *' },
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));

jest.mock('../src/repositories/material.repository', () => ({
  findAllTracked: jest.fn(),
}));

jest.mock('../src/repositories/price.repository', () => ({
  findHistoryForMaterial: jest.fn(),
}));

jest.mock('../src/repositories/news.repository', () => ({
  listRecentByIndustry: jest.fn(),
}));

// ✅ NEW: Mock knowledgeBase.repository so importing it
// does not initialize the real DB connection.
jest.mock('../src/repositories/knowledgeBase.repository', () => ({
  getDependenciesForRawMaterial: jest.fn(),
}));

jest.mock('../src/repositories/syncStatus.repository', () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/aiInsight.service', () => ({
  generateAndStore: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));


// ── Test setup ────────────────────────────────────────────────────────────────

let runInsights;
let materialRepo;
let priceRepo;
let newsRepo;
let knowledgeBaseRepo;
let syncStatusRepo;
let aiInsightService;

beforeEach(() => {
  jest.resetModules();

  jest.mock('../src/config/env', () => ({
    aiInsights: { enabled: true, timeoutMs: 30000 },
    gemini:     { model: 'gemini-1.5-flash' },
    cron:       { aiInsights: '0 6 * * *' },
  }));

  jest.mock('node-cron', () => ({
    schedule: jest.fn(() => ({ stop: jest.fn() })),
  }));

  jest.mock('../src/repositories/material.repository', () => ({
    findAllTracked: jest.fn(),
  }));

  jest.mock('../src/repositories/price.repository', () => ({
    findHistoryForMaterial: jest.fn(),
  }));

  jest.mock('../src/repositories/news.repository', () => ({
    listRecentByIndustry: jest.fn(),
  }));

  // ✅ NEW: Mock KB repository inside resetModules setup too.
  jest.mock('../src/repositories/knowledgeBase.repository', () => ({
    getDependenciesForRawMaterial: jest.fn(),
  }));

  jest.mock('../src/repositories/syncStatus.repository', () => ({
    upsert: jest.fn().mockResolvedValue(undefined),
  }));

  jest.mock('../src/services/aiInsight.service', () => ({
    generateAndStore: jest.fn(),
  }));

  jest.mock('../src/utils/logger', () => ({
    info:  jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  }));

  ({ runInsights } = require('../src/jobs/aiInsights.job'));

  materialRepo     = require('../src/repositories/material.repository');
  priceRepo        = require('../src/repositories/price.repository');
  newsRepo         = require('../src/repositories/news.repository');
  newsRepo.listRecentByIndustry.mockResolvedValue([]);
  knowledgeBaseRepo = require('../src/repositories/knowledgeBase.repository');
  syncStatusRepo   = require('../src/repositories/syncStatus.repository');
  aiInsightService  = require('../src/services/aiInsight.service');

  // ✅ NEW: Default behavior for materials that have no dependencies.
  knowledgeBaseRepo.getDependenciesForRawMaterial.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeMaterial(id = 10, businessId = 5, industryId = 2) {
  return { id, business_id: businessId, name: 'WTI Crude Oil', industry_id: industryId };
}

function makePrices(count) {
  return Array.from({ length: count }, (_, i) => ({
    price: (70 + i * 0.5).toFixed(2),
    recorded_at: '2026-09-' + String(15 - i).padStart(2, '0'),
  }));
}

const GENERATED_RESULT = (materialId = 10) => ({
  status:     'generated',
  materialId,
  businessId: 5,
  insight:    { id: 1, outlook: 'BULLISH', confidence: 'HIGH' },
});

const SKIPPED_RESULT = (materialId = 10) => ({
  status:     'skipped',
  reason:     'insufficient_evidence',
  materialId,
  businessId: 5,
  priceCount: 1,
});

const ERROR_RESULT = (materialId = 10) => ({
  status:     'error',
  materialId,
  businessId: 5,
  error:      Object.assign(new Error('PROVIDER_TIMEOUT'), { code: 'PROVIDER_TIMEOUT' }),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('1. disabled -- SKIPPED immediately, no repo calls', async () => {
  jest.resetModules();
  jest.mock('../src/config/env', () => ({
    aiInsights: { enabled: false, timeoutMs: 30000 },
    gemini:     { model: 'gemini-1.5-flash' },
    cron:       { aiInsights: '0 6 * * *' },
  }));
  jest.mock('../src/repositories/material.repository', () => ({ findAllTracked: jest.fn() }));
  jest.mock('../src/repositories/price.repository',    () => ({ findHistoryForMaterial: jest.fn() }));
  jest.mock('../src/repositories/news.repository',     () => ({ listRecentByIndustry: jest.fn() }));
  jest.mock('../src/repositories/syncStatus.repository', () => ({ upsert: jest.fn() }));
  jest.mock('../src/services/aiInsight.service',       () => ({ generateAndStore: jest.fn() }));
  jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn() }));

  const { runInsights: runDisabled } = require('../src/jobs/aiInsights.job');
  const result = await runDisabled();

  expect(result.status).toBe('SKIPPED');
  expect(result.reason).toBe('disabled');
  const mat = require('../src/repositories/material.repository');
  expect(mat.findAllTracked).not.toHaveBeenCalled();
});

test('2. overlap guard -- second concurrent call returns SKIPPED/overlap', async () => {
  materialRepo.findAllTracked.mockResolvedValue([makeMaterial()]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(10));
  newsRepo.listRecentByIndustry.mockResolvedValue([]);

  // Block the service call so the first run stays in-progress
  let resolveFirst;
  aiInsightService.generateAndStore.mockReturnValueOnce(
    new Promise(resolve => { resolveFirst = resolve; })
  );

  const firstRun  = runInsights(); // starts and hangs
  const secondRun = runInsights(); // should see isRunning=true

  const secondResult = await secondRun;
  expect(secondResult.status).toBe('SKIPPED');
  expect(secondResult.reason).toBe('overlap');

  // Finish first run
  resolveFirst(GENERATED_RESULT());
  await firstRun;
});

test('3. isRunning released after run -- subsequent call proceeds', async () => {
  materialRepo.findAllTracked.mockResolvedValue([makeMaterial()]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(10));
  newsRepo.listRecentByIndustry.mockResolvedValue([]);
  aiInsightService.generateAndStore.mockResolvedValue(GENERATED_RESULT());

  await runInsights();

  // Second run should proceed, not be skipped
  materialRepo.findAllTracked.mockResolvedValue([]);
  const secondResult = await runInsights();
  expect(secondResult.status).toBe('SUCCESS');
});

test('4. no tracked materials -- SUCCESS with zero counts', async () => {
  materialRepo.findAllTracked.mockResolvedValue([]);

  const result = await runInsights();

  expect(result.status).toBe('SUCCESS');
  expect(result.generated).toBe(0);
  expect(result.skipped).toBe(0);
  expect(result.errors).toBe(0);
  expect(result.materials).toBe(0);
  expect(aiInsightService.generateAndStore).not.toHaveBeenCalled();
});

test('5. happy path -- 2 materials generated, sync status written twice', async () => {
  const mat1 = makeMaterial(10, 5, 2);
  const mat2 = makeMaterial(11, 5, 2);
  materialRepo.findAllTracked.mockResolvedValue([mat1, mat2]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(15));
  newsRepo.listRecentByIndustry.mockResolvedValue([
    { title: 'Oil headline', source_name: 'Reuters', published_at: '2026-09-15' },
  ]);
  aiInsightService.generateAndStore
    .mockResolvedValueOnce(GENERATED_RESULT(10))
    .mockResolvedValueOnce(GENERATED_RESULT(11));

  const result = await runInsights();

  expect(result.status).toBe('SUCCESS');
  expect(result.generated).toBe(2);
  expect(result.skipped).toBe(0);
  expect(result.errors).toBe(0);
  expect(result.materials).toBe(2);
  expect(aiInsightService.generateAndStore).toHaveBeenCalledTimes(2);
  // Sync status written twice: run-start + run-end
  expect(syncStatusRepo.upsert).toHaveBeenCalledTimes(2);
});

test('6. one material skipped (insufficient evidence) -- skipped count correct', async () => {
  materialRepo.findAllTracked.mockResolvedValue([makeMaterial(10), makeMaterial(11)]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(15));
  newsRepo.listRecentByIndustry.mockResolvedValue([]);
  aiInsightService.generateAndStore
    .mockResolvedValueOnce(SKIPPED_RESULT(10))
    .mockResolvedValueOnce(GENERATED_RESULT(11));

  const result = await runInsights();

  expect(result.status).toBe('SUCCESS');
  expect(result.generated).toBe(1);
  expect(result.skipped).toBe(1);
  expect(result.errors).toBe(0);
});

test('7. one material error -- job FAILED but continues to next material', async () => {
  materialRepo.findAllTracked.mockResolvedValue([makeMaterial(10), makeMaterial(11)]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(15));
  newsRepo.listRecentByIndustry.mockResolvedValue([]);
  aiInsightService.generateAndStore
    .mockResolvedValueOnce(ERROR_RESULT(10))
    .mockResolvedValueOnce(GENERATED_RESULT(11));

  const result = await runInsights();

  expect(result.status).toBe('FAILED');
  expect(result.errors).toBe(1);
  expect(result.generated).toBe(1);
  // Both materials were attempted
  expect(aiInsightService.generateAndStore).toHaveBeenCalledTimes(2);
});

test('8. findAllTracked throws -- FAILED, resolved not thrown', async () => {
  materialRepo.findAllTracked.mockRejectedValue(new Error('DB connection lost'));

  const result = await runInsights();

  expect(result.status).toBe('FAILED');
  expect(result.generated).toBe(0);
  expect(result.errors).toBe(0);
  expect(aiInsightService.generateAndStore).not.toHaveBeenCalled();
});

test('9. priceRepository throws for one material -- counted as error, continues', async () => {
  const mat1 = makeMaterial(10);
  const mat2 = makeMaterial(11);
  materialRepo.findAllTracked.mockResolvedValue([mat1, mat2]);

  priceRepo.findHistoryForMaterial
    .mockRejectedValueOnce(new Error('Price DB timeout'))  // mat1 fails
    .mockResolvedValueOnce(makePrices(10));                // mat2 succeeds

  newsRepo.listRecentByIndustry.mockResolvedValue([]);
  aiInsightService.generateAndStore.mockResolvedValue(GENERATED_RESULT(11));

  const result = await runInsights();

  expect(result.status).toBe('FAILED');
  expect(result.errors).toBe(1);   // mat1 counted as error
  expect(result.generated).toBe(1); // mat2 generated
  // generateAndStore called only once (for mat2)
  expect(aiInsightService.generateAndStore).toHaveBeenCalledTimes(1);
});

test('10. newsRepository throws -- insight generated anyway (prices only)', async () => {
  materialRepo.findAllTracked.mockResolvedValue([makeMaterial()]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(10));
  newsRepo.listRecentByIndustry.mockRejectedValue(new Error('News DB timeout'));
  aiInsightService.generateAndStore.mockResolvedValue(GENERATED_RESULT());

  const result = await runInsights();

  // Run succeeds -- news failure is non-fatal
  expect(result.status).toBe('SUCCESS');
  expect(result.generated).toBe(1);

  // generateAndStore was called with empty newsHeadlines
  const call = aiInsightService.generateAndStore.mock.calls[0][0];
  expect(call.newsHeadlines).toEqual([]);
});

test('11. sync status written at run-start (null status) and run-end (jobStatus)', async () => {
  materialRepo.findAllTracked.mockResolvedValue([]);

  await runInsights();

  const calls = syncStatusRepo.upsert.mock.calls;
  expect(calls).toHaveLength(2);

  // Run-start: lastStatus is null
  expect(calls[0][0]).toBe('AI_INSIGHTS');
  expect(calls[0][1].lastStatus).toBeNull();

  // Run-end: lastStatus is SUCCESS
  expect(calls[1][0]).toBe('AI_INSIGHTS');
  expect(calls[1][1].lastStatus).toBe('SUCCESS');
});

test('12. sync status write failure is non-fatal', async () => {
  materialRepo.findAllTracked.mockResolvedValue([]);
  syncStatusRepo.upsert.mockRejectedValue(new Error('Sync DB down'));

  const result = await runInsights();
  // Run still resolves normally
  expect(result.status).toBe('SUCCESS');
});

test('13. material with null industry_id -- news fetch skipped, insight generated', async () => {
  const mat = makeMaterial(10, 5, null); // null industry_id
  materialRepo.findAllTracked.mockResolvedValue([mat]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(10));
  aiInsightService.generateAndStore.mockResolvedValue(GENERATED_RESULT());

  const result = await runInsights();

  expect(newsRepo.listRecentByIndustry).not.toHaveBeenCalled();
  expect(result.generated).toBe(1);
});

test('14. PROVIDER_AUTH error from generateAndStore propagated as error, job=FAILED', async () => {
  materialRepo.findAllTracked.mockResolvedValue([makeMaterial()]);
  priceRepo.findHistoryForMaterial.mockResolvedValue(makePrices(10));
  newsRepo.listRecentByIndustry.mockResolvedValue([]);

  const provErr = Object.assign(new Error('check GEMINI_API_KEY'), {
    name: 'ProviderError',
    code: 'PROVIDER_AUTH',
  });
  aiInsightService.generateAndStore.mockResolvedValue({
    status:     'error',
    error:      provErr,
    materialId: 10,
    businessId: 5,
  });

  const result = await runInsights();

  expect(result.status).toBe('FAILED');
  expect(result.errors).toBe(1);
});

test('15. start() registers cron with correct expression and UTC timezone', () => {
  const nodeCron = require('node-cron');
  const { start } = require('../src/jobs/aiInsights.job');

  start();

  expect(nodeCron.schedule).toHaveBeenCalledWith(
    '0 6 * * *',
    expect.any(Function),
    expect.objectContaining({ timezone: 'UTC' })
  );
});
