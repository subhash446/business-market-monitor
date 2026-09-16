/**
 * Unit tests for aiInsight.repository.js (Phase H)
 *
 * All DB calls are mocked via jest.mock('../src/database/connection').
 * No real DB connections are made.
 *
 * Covers:
 *   create()
 *     - executes INSERT with all 12 columns in correct order
 *     - SELECT-backs the newly inserted row by insertId
 *     - passes null for optional evidence_price_range when omitted
 *     - returns null when SELECT-back finds no row (race condition)
 *     - uses default 0 for evidence counts when omitted
 *
 *   findLatestByMaterial()
 *     - returns the first row from execute (latest insight)
 *     - returns null when no rows found
 *     - query uses both tracked_material_id AND business_id (ownership check)
 *
 *   findLatestByBusiness()
 *     - returns array of rows
 *     - returns empty array when no insights exist
 *     - inlines limit safely (default 3)
 *     - accepts custom limit
 *
 *   listByMaterial()
 *     - returns rows for matching material + business
 *     - returns empty array when no rows
 *     - inlines limit and offset as numbers
 *
 *   countByMaterial()
 *     - returns the total count as a number
 *     - returns 0 when no rows
 */

jest.mock('../src/database/connection', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../src/database/connection');

// Re-require the module after mock is in place
let repo;
beforeEach(() => {
  jest.resetModules();
  jest.mock('../src/database/connection', () => ({
    pool: { execute: jest.fn() },
  }));
  repo = require('../src/repositories/aiInsight.repository');
});

afterEach(() => jest.clearAllMocks());

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeInsightRow(overrides = {}) {
  return {
    id:                          1,
    tracked_material_id:         10,
    business_id:                 5,
    headline:                    'WTI prices rose 4% this week.',
    what_happened:               'WTI spot price increased from 71.2 to 74.1.',
    why_it_happened:             'Supply disruptions reported in key regions.',
    business_impact:             'Raw material costs may rise 3-5% near term.',
    outlook:                     'BULLISH',
    confidence:                  'MEDIUM',
    evidence_price_range:        '71.2-74.1',
    evidence_price_points_count: 14,
    evidence_news_count:         4,
    model_used:                  'gemini-1.5-flash',
    generated_at:                new Date('2026-09-15T06:00:00Z'),
    ...overrides,
  };
}

function makeCreateInput(overrides = {}) {
  return {
    trackedMaterialId:         10,
    businessId:                5,
    headline:                  'WTI prices rose 4% this week.',
    whatHappened:              'WTI spot price increased from 71.2 to 74.1.',
    whyItHappened:             'Supply disruptions reported in key regions.',
    businessImpact:            'Raw material costs may rise 3-5% near term.',
    outlook:                   'BULLISH',
    confidence:                'MEDIUM',
    evidencePriceRange:        '71.2-74.1',
    evidencePricePointsCount:  14,
    evidenceNewsCount:         4,
    modelUsed:                 'gemini-1.5-flash',
    ...overrides,
  };
}

// ── create() ──────────────────────────────────────────────────────────────────

describe('create()', () => {
  test('executes INSERT then SELECT-back and returns the row', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    const insertedRow = makeInsightRow();

    // First call = INSERT; second call = SELECT by insertId
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 1 }])
      .mockResolvedValueOnce([[insertedRow]]);

    const result = await repo.create(makeCreateInput());

    expect(mockPool.execute).toHaveBeenCalledTimes(2);

    // First call must be INSERT
    const [insertSql, insertParams] = mockPool.execute.mock.calls[0];
    expect(insertSql).toMatch(/INSERT INTO ai_insights/i);

    // All 12 value columns in the expected order
    expect(insertParams).toEqual([
      10,              // tracked_material_id
      5,               // business_id
      'WTI prices rose 4% this week.',
      'WTI spot price increased from 71.2 to 74.1.',
      'Supply disruptions reported in key regions.',
      'Raw material costs may rise 3-5% near term.',
      'BULLISH',
      'MEDIUM',
      '71.2-74.1',
      14,
      4,
      'gemini-1.5-flash',
    ]);

    // Second call must SELECT by insertId
    const [selectSql, selectParams] = mockPool.execute.mock.calls[1];
    expect(selectSql).toMatch(/WHERE id = \?/i);
    expect(selectParams).toEqual([1]);

    expect(result).toEqual(insertedRow);
  });

  test('passes null for evidence_price_range when omitted', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 2 }])
      .mockResolvedValueOnce([[makeInsightRow({ id: 2 })]]);

    const input = makeCreateInput();
    delete input.evidencePriceRange; // omit to trigger default
    await repo.create(input);

    const [, insertParams] = mockPool.execute.mock.calls[0];
    // evidence_price_range is the 9th param (index 8)
    expect(insertParams[8]).toBeNull();
  });

  test('uses default 0 for evidence counts when omitted', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 3 }])
      .mockResolvedValueOnce([[makeInsightRow({ id: 3 })]]);

    const input = makeCreateInput();
    delete input.evidencePricePointsCount;
    delete input.evidenceNewsCount;
    await repo.create(input);

    const [, params] = mockPool.execute.mock.calls[0];
    expect(params[9]).toBe(0);  // evidence_price_points_count
    expect(params[10]).toBe(0); // evidence_news_count
  });

  test('returns null when SELECT-back finds no row', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute
      .mockResolvedValueOnce([{ insertId: 99 }])
      .mockResolvedValueOnce([[]]); // no rows returned

    const result = await repo.create(makeCreateInput());
    expect(result).toBeNull();
  });
});

// ── findLatestByMaterial() ────────────────────────────────────────────────────

describe('findLatestByMaterial()', () => {
  test('returns the latest insight row for the material', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    const row = makeInsightRow();
    mockPool.execute.mockResolvedValueOnce([[row]]);

    const result = await repo.findLatestByMaterial(10, 5);
    expect(result).toEqual(row);
  });

  test('returns null when no insight exists for the material', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    const result = await repo.findLatestByMaterial(10, 5);
    expect(result).toBeNull();
  });

  test('query includes both tracked_material_id AND business_id (ownership)', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[makeInsightRow()]]);

    await repo.findLatestByMaterial(10, 5);

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/tracked_material_id\s*=\s*\?/i);
    expect(sql).toMatch(/business_id\s*=\s*\?/i);
    expect(params).toEqual([10, 5]);
  });

  test('query orders by generated_at DESC and limits to 1', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[makeInsightRow()]]);

    await repo.findLatestByMaterial(10, 5);

    const [sql] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/ORDER BY generated_at DESC/i);
    expect(sql).toMatch(/LIMIT 1/i);
  });
});

// ── findLatestByBusiness() ────────────────────────────────────────────────────

describe('findLatestByBusiness()', () => {
  test('returns array of rows for the business', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    const rows = [makeInsightRow({ id: 1 }), makeInsightRow({ id: 2 })];
    mockPool.execute.mockResolvedValueOnce([rows]);

    const result = await repo.findLatestByBusiness(5);
    expect(result).toEqual(rows);
  });

  test('returns empty array when no insights exist', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    const result = await repo.findLatestByBusiness(5);
    expect(result).toEqual([]);
  });

  test('uses default LIMIT 3 when no limit passed', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.findLatestByBusiness(5);

    const [sql] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/LIMIT 3/);
  });

  test('inlines custom limit as a number', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.findLatestByBusiness(5, 10);

    const [sql] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/LIMIT 10/);
  });

  test('query filters only by business_id', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.findLatestByBusiness(5, 3);

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/WHERE business_id = \?/i);
    expect(params).toEqual([5]);
  });

  test('query orders by generated_at DESC', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.findLatestByBusiness(5);

    const [sql] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/ORDER BY generated_at DESC/i);
  });
});

// ── listByMaterial() ──────────────────────────────────────────────────────────

describe('listByMaterial()', () => {
  test('returns paginated rows for material + business', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    const rows = [makeInsightRow({ id: 1 }), makeInsightRow({ id: 2 }), makeInsightRow({ id: 3 })];
    mockPool.execute.mockResolvedValueOnce([rows]);

    const result = await repo.listByMaterial(10, 5, { limit: 3, offset: 0 });
    expect(result).toEqual(rows);
  });

  test('returns empty array when no history exists', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    const result = await repo.listByMaterial(10, 5, { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  test('inlines limit and offset as integers in SQL', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.listByMaterial(10, 5, { limit: 5, offset: 10 });

    const [sql] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/LIMIT 5 OFFSET 10/);
  });

  test('query scopes by both tracked_material_id and business_id', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.listByMaterial(10, 5, { limit: 5, offset: 0 });

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/tracked_material_id\s*=\s*\?/i);
    expect(sql).toMatch(/business_id\s*=\s*\?/i);
    expect(params).toEqual([10, 5]);
  });

  test('results are ordered newest-first', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[]]);

    await repo.listByMaterial(10, 5, { limit: 5, offset: 0 });

    const [sql] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/ORDER BY generated_at DESC/i);
  });
});

// ── countByMaterial() ─────────────────────────────────────────────────────────

describe('countByMaterial()', () => {
  test('returns total count as a number', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[{ total: 7 }]]);

    const result = await repo.countByMaterial(10, 5);
    expect(result).toBe(7);
  });

  test('returns 0 when no insights exist', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[{ total: 0 }]]);

    const result = await repo.countByMaterial(10, 5);
    expect(result).toBe(0);
  });

  test('query scopes by both tracked_material_id and business_id', async () => {
    const { pool: mockPool } = require('../src/database/connection');
    mockPool.execute.mockResolvedValueOnce([[{ total: 3 }]]);

    await repo.countByMaterial(10, 5);

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toMatch(/tracked_material_id\s*=\s*\?/i);
    expect(sql).toMatch(/business_id\s*=\s*\?/i);
    expect(params).toEqual([10, 5]);
  });
});
