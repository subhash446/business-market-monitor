/**
 * verify_single_insight.test.js
 *
 * Focused unit tests for backend/scripts/verify_single_insight.js.
 *
 * Covers:
 *   1. Ownership failure — findByIdForBusiness returns null → abort, no DB writes, exitCode=1
 *   2. Duplicate guard — insight already exists for today (UTC) → abort, no Gemini call
 *   3. Insufficient evidence — fewer than 3 price points → abort, no Gemini call, exitCode=0
 *   4. Successful single generation — produces one INSERT, logs sanitized status only
 *   5. Error path — generateAndStore returns status='error' → exitCode=1, no spurious writes
 *   6. Gemini/generateAndStore failure — verifies no prompt, no key, no raw data in logs
 *
 * All database interactions and Gemini calls are mocked. No real DB
 * connection is opened. No real Gemini API is called.
 */

'use strict';

// ── Mock all dependencies before any require of the script under test ──────────

// database/connection — pool must be mockable so pool.end() does not throw
jest.mock('../src/database/connection', () => ({
  pool: {
    execute: jest.fn().mockResolvedValue([[]]),
    end:     jest.fn().mockResolvedValue(undefined),
  },
}));

// Repositories
jest.mock('../src/repositories/material.repository', () => ({
  findByIdForBusiness: jest.fn(),
  findAllTracked:      jest.fn(),
}));

jest.mock('../src/repositories/price.repository', () => ({
  findHistoryForMaterial: jest.fn(),
}));

jest.mock('../src/repositories/news.repository', () => ({
  listRecentByIndustry: jest.fn(),
}));

jest.mock('../src/repositories/aiInsight.repository', () => ({
  findLatestByMaterial: jest.fn(),
}));

jest.mock('../src/repositories/knowledgeBase.repository', () => ({
  getDependenciesForRawMaterial: jest.fn(),
}));

// Utils
jest.mock('../src/utils/newsRelevance', () => ({
  filterRelevantNews: jest.fn(),
}));

// Service — generateAndStore must never invoke the real Gemini provider
jest.mock('../src/services/aiInsight.service', () => ({
  generateAndStore: jest.fn(),
}));

// ── Imports after mocks ────────────────────────────────────────────────────────

const materialRepository      = require('../src/repositories/material.repository');
const priceRepository         = require('../src/repositories/price.repository');
const newsRepository          = require('../src/repositories/news.repository');
const aiInsightRepository     = require('../src/repositories/aiInsight.repository');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');
const { filterRelevantNews }  = require('../src/utils/newsRelevance');
const { generateAndStore }    = require('../src/services/aiInsight.service');
const { pool }                = require('../src/database/connection');

// ── Test data fixtures ─────────────────────────────────────────────────────────

const MOCK_MATERIAL = {
  id:              1,
  business_id:     1,
  raw_material_id: 5,
  name:            'Bottle Caps',
  unit_abbreviation: 'kg',
  is_tracked:      true,
};

const MOCK_FULL_MATERIAL = {
  ...MOCK_MATERIAL,
  industry_id: 1,
};

const MOCK_PRICES_3 = [
  { price: '100.00', recorded_at: '2026-09-01 00:00:00' },
  { price: '102.00', recorded_at: '2026-09-10 00:00:00' },
  { price: '105.00', recorded_at: '2026-09-20 00:00:00' },
];

const MOCK_PRICES_2 = [
  { price: '100.00', recorded_at: '2026-09-01 00:00:00' },
  { price: '102.00', recorded_at: '2026-09-10 00:00:00' },
];

const MOCK_INSIGHT_ROW = {
  id:                          42,
  tracked_material_id:         1,
  business_id:                 1,
  headline:                    'Bottle Cap prices rose steadily.',
  what_happened:               'Prices increased from 100.00 to 105.00.',
  why_it_happened:             'Causal evidence not found in the available data.',
  business_impact:             'Costs may increase.',
  outlook:                     'BULLISH',
  confidence:                  'LOW',
  evidence_price_range:        '100.00-105.00',
  evidence_price_points_count: 3,
  evidence_news_count:         0,
  model_used:                  'gemini-3.6-flash',
  generated_at:                new Date(),
};

// ── Helper: run the script in-process by re-requiring after mock setup ────────
//
// Because the script calls main() immediately when required, we use
// jest.isolateModules() per test so each test gets a fresh module with
// independently configured mocks. We also capture and suppress console
// output within each test to avoid polluting the Jest output.

function runScript() {
  // Re-require the script inside an isolated module scope. The script's
  // main() returns a Promise (via the .finally pool close), so we need to
  // wait for the module-level promise to settle. We do this by requiring
  // it and letting the event-loop drain with setImmediate (Jest flushes
  // micro-tasks between ticks).
  //
  // The script sets process.exitCode — we reset it before each test.
  return new Promise((resolve) => {
    jest.isolateModules(() => {
      require('../scripts/verify_single_insight');
      // setImmediate gives the script's .finally() a chance to run before
      // we inspect state.
      setImmediate(resolve);
    });
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('verify_single_insight.js', () => {
  let consoleSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = 0;

    // Silence console output during tests — we inspect spy calls instead.
    consoleSpy      = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default happy-path mocks (overridden per test as needed).
    materialRepository.findByIdForBusiness.mockResolvedValue(MOCK_MATERIAL);
    materialRepository.findAllTracked.mockResolvedValue([MOCK_FULL_MATERIAL]);
    priceRepository.findHistoryForMaterial.mockResolvedValue(MOCK_PRICES_3);
    newsRepository.listRecentByIndustry.mockResolvedValue([]);
    aiInsightRepository.findLatestByMaterial.mockResolvedValue(null);
    knowledgeBaseRepository.getDependenciesForRawMaterial.mockResolvedValue([]);
    filterRelevantNews.mockReturnValue([]);
    generateAndStore.mockResolvedValue({ status: 'generated', insight: MOCK_INSIGHT_ROW });
    pool.end.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleSpy.restore      ? consoleSpy.restore()      : consoleSpy.mockRestore();
    consoleErrorSpy.restore ? consoleErrorSpy.restore() : consoleErrorSpy.mockRestore();
  });

  // ── Test 1: Ownership failure ─────────────────────────────────────────────

  describe('ownership failure', () => {
    test('aborts without any writes when material not found for business', async () => {
      materialRepository.findByIdForBusiness.mockResolvedValue(null);

      await runScript();

      // No evidence fetch
      expect(priceRepository.findHistoryForMaterial).not.toHaveBeenCalled();
      expect(newsRepository.listRecentByIndustry).not.toHaveBeenCalled();
      expect(aiInsightRepository.findLatestByMaterial).not.toHaveBeenCalled();

      // No Gemini call, no DB write
      expect(generateAndStore).not.toHaveBeenCalled();

      // Exit code signals failure
      expect(process.exitCode).toBe(1);

      // Error logged (no key/prompt in message)
      const errorOutput = consoleErrorSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(errorOutput).toContain('ABORT');
      expect(errorOutput).not.toContain('GEMINI_API_KEY');
    });

    test('calls findByIdForBusiness with exactly businessId=1 and materialId=1', async () => {
      materialRepository.findByIdForBusiness.mockResolvedValue(null);

      await runScript();

      expect(materialRepository.findByIdForBusiness).toHaveBeenCalledWith(1, 1);
    });
  });

  // ── Test 2: Duplicate guard ───────────────────────────────────────────────

  describe('duplicate guard', () => {
    test('aborts without calling Gemini when insight exists for today UTC', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      aiInsightRepository.findLatestByMaterial.mockResolvedValue({
        id:           99,
        generated_at: new Date(todayStr + 'T08:00:00Z'),
        outlook:      'NEUTRAL',
        confidence:   'MEDIUM',
      });

      await runScript();

      // Gemini must not be called
      expect(generateAndStore).not.toHaveBeenCalled();

      // No price or news fetch needed after duplicate detection
      expect(priceRepository.findHistoryForMaterial).not.toHaveBeenCalled();

      // Exit code 0 — not an error, just already done
      expect(process.exitCode).toBe(0);

      // Log contains insightId and does NOT contain API key or prompt
      const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(allLogs).toContain('ABORT');
      expect(allLogs).toContain('99');
      expect(allLogs).not.toContain('GEMINI_API_KEY');
    });

    test('proceeds when existing insight is from a prior day', async () => {
      aiInsightRepository.findLatestByMaterial.mockResolvedValue({
        id:           77,
        generated_at: new Date('2026-01-01T00:00:00Z'), // clearly old
        outlook:      'NEUTRAL',
        confidence:   'LOW',
      });

      await runScript();

      // generateAndStore should have been called
      expect(generateAndStore).toHaveBeenCalledTimes(1);
    });

    test('calls findLatestByMaterial with materialId=1 and businessId=1', async () => {
      aiInsightRepository.findLatestByMaterial.mockResolvedValue(null);

      await runScript();

      expect(aiInsightRepository.findLatestByMaterial).toHaveBeenCalledWith(1, 1);
    });
  });

  // ── Test 3: Insufficient evidence ────────────────────────────────────────

  describe('insufficient price evidence', () => {
    test('exits cleanly with code 0 and no Gemini call when fewer than 3 price points', async () => {
      priceRepository.findHistoryForMaterial.mockResolvedValue(MOCK_PRICES_2);

      await runScript();

      expect(generateAndStore).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);

      const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(allLogs).toContain('Insufficient');
      expect(allLogs).toContain('2');
    });

    test('exits cleanly with code 0 when price array is empty', async () => {
      priceRepository.findHistoryForMaterial.mockResolvedValue([]);

      await runScript();

      expect(generateAndStore).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
    });

    test('passes genuine prices to generateAndStore — never empty when ≥3 found', async () => {
      await runScript();

      expect(generateAndStore).toHaveBeenCalledWith(
        expect.objectContaining({
          prices: MOCK_PRICES_3,
          trackedMaterialId: 1,
          businessId:        1,
          materialName:      'Bottle Caps',
        })
      );
    });
  });

  // ── Test 4: Successful single generation ─────────────────────────────────

  describe('successful generation', () => {
    test('calls generateAndStore exactly once on the happy path', async () => {
      await runScript();

      expect(generateAndStore).toHaveBeenCalledTimes(1);
    });

    test('logs insightId, outlook, confidence — never raw prompt or API key', async () => {
      await runScript();

      const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');

      // Sanitized fields present
      expect(allLogs).toContain('42');          // insightId
      expect(allLogs).toContain('BULLISH');      // outlook
      expect(allLogs).toContain('LOW');          // confidence

      // Sensitive data absent
      expect(allLogs).not.toContain('GEMINI_API_KEY');
      expect(allLogs).not.toContain('MATERIAL:'); // prompt header must never appear
      expect(allLogs).not.toContain('PRICE DATA');// prompt section must never appear
    });

    test('logs rollback command with correct insight id and scoping', async () => {
      await runScript();

      const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(allLogs).toContain('DELETE FROM ai_insights');
      expect(allLogs).toContain('id = 42 AND');
      expect(allLogs).toContain('tracked_material_id = 1 AND');
      expect(allLogs).toContain('business_id = 1 LIMIT 1');
      expect(allLogs).toContain('LIMIT 1');
    });

    test('exits with code 0 on successful generation', async () => {
      await runScript();

      expect(process.exitCode).toBe(0);
    });

    test('closes the database pool after successful run', async () => {
      await runScript();

      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    test('does not call syncStatusRepository — sync_statuses must not be written', async () => {
      // syncStatusRepository is not imported or mocked in the script.
      // Verify that generateAndStore was called WITHOUT the batch-job structure
      // (i.e., no syncStatus upsert call can have occurred — the pool.execute
      // mock captures all raw queries; none should match sync_statuses).
      await runScript();

      const allExecuteCalls = pool.execute.mock.calls.map(c => String(c[0]));
      const syncCalls = allExecuteCalls.filter(q => q.toLowerCase().includes('sync_statuses'));
      expect(syncCalls).toHaveLength(0);
    });
  });

  // ── Test 5: generateAndStore returns error ────────────────────────────────

  describe('generateAndStore error path', () => {
    test('logs sanitized error message and sets exitCode=1', async () => {
      generateAndStore.mockResolvedValue({
        status:    'error',
        error:     new Error('Gemini API rate limit exceeded'),
        materialId: 1,
        businessId: 1,
      });

      await runScript();

      expect(process.exitCode).toBe(1);

      const errorLogs = consoleErrorSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(errorLogs).toContain('ERROR');
      expect(errorLogs).toContain('Gemini API rate limit exceeded');

      // Must never expose key, URL, or prompt in error log
      expect(errorLogs).not.toContain('GEMINI_API_KEY');
      expect(errorLogs).not.toContain('PRICE DATA');
    });

    test('closes database pool even when generateAndStore errors', async () => {
      generateAndStore.mockResolvedValue({
        status: 'error',
        error:  new Error('timeout'),
        materialId: 1,
        businessId: 1,
      });

      await runScript();

      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    test('reports skipped status cleanly when generateAndStore says insufficient_evidence', async () => {
      // generateAndStore may return 'skipped' if prices was empty array despite
      // our pre-check (e.g. race condition or all-null price values).
      generateAndStore.mockResolvedValue({
        status:     'skipped',
        reason:     'insufficient_evidence',
        materialId: 1,
        businessId: 1,
        priceCount: 2,
      });

      await runScript();

      expect(process.exitCode).toBe(0);

      const allLogs = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(allLogs).toContain('SKIPPED');
      expect(allLogs).toContain('2');
    });
  });

  // ── Test 6: Security — no sensitive data leakage in any output path ───────

  describe('security — no sensitive data in logs', () => {
    const sensitivePatterns = [
      'GEMINI_API_KEY',
      'PRICE DATA',          // prompt section header
      'NEWS_HEADLINES_DATA', // prompt section header
      'OUTPUT REQUIREMENTS', // prompt section header
      'DO NOT predict',      // prompt instruction
      'generateInsight',     // internal provider call
    ];

    test.each(sensitivePatterns)(
      'pattern "%s" is never logged on the happy path',
      async (pattern) => {
        await runScript();

        const allOutput = [
          ...consoleSpy.mock.calls,
          ...consoleErrorSpy.mock.calls,
        ].map(c => c.join(' ')).join('\n');

        expect(allOutput).not.toContain(pattern);
      }
    );

    test('sensitive patterns absent even when ownership fails', async () => {
      materialRepository.findByIdForBusiness.mockResolvedValue(null);

      await runScript();

      const allOutput = [
        ...consoleSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].map(c => c.join(' ')).join('\n');

      for (const pattern of sensitivePatterns) {
        expect(allOutput).not.toContain(pattern);
      }
    });

    test('sensitive patterns absent when generateAndStore returns error', async () => {
      generateAndStore.mockResolvedValue({
        status: 'error',
        error:  new Error('provider error'),
        materialId: 1,
        businessId: 1,
      });

      await runScript();

      const allOutput = [
        ...consoleSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].map(c => c.join(' ')).join('\n');

      for (const pattern of sensitivePatterns) {
        expect(allOutput).not.toContain(pattern);
      }
    });
  });

  // ── Test 7: Pool is always closed ─────────────────────────────────────────

  describe('pool.end() on every exit path', () => {
    test('pool closed on ownership failure', async () => {
      materialRepository.findByIdForBusiness.mockResolvedValue(null);
      await runScript();
      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    test('pool closed on duplicate guard abort', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      aiInsightRepository.findLatestByMaterial.mockResolvedValue({
        id: 5, generated_at: new Date(todayStr + 'T00:00:00Z'), outlook: 'NEUTRAL', confidence: 'LOW',
      });
      await runScript();
      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    test('pool closed on insufficient evidence', async () => {
      priceRepository.findHistoryForMaterial.mockResolvedValue([]);
      await runScript();
      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    test('pool closed on generateAndStore error', async () => {
      generateAndStore.mockResolvedValue({ status: 'error', error: new Error('x'), materialId: 1, businessId: 1 });
      await runScript();
      expect(pool.end).toHaveBeenCalledTimes(1);
    });

    test('pool closed even when top-level await throws', async () => {
      // Simulate a fatal rejection (e.g. DB connection failure at ownership check).
      materialRepository.findByIdForBusiness.mockRejectedValue(new Error('ECONNREFUSED'));
      await runScript();
      expect(pool.end).toHaveBeenCalledTimes(1);
    });
  });
});
