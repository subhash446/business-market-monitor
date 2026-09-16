/**
 * Tests for aiInsightQuery.service.js (Phase H)
 *
 * All DB dependencies mocked. No real DB or auth calls.
 *
 * Covers:
 *
 * getLatestInsight()
 *   1.  Material found + insight exists -> returns formatted insight
 *   2.  Material found + no insight yet -> returns null (not a 404)
 *   3.  Material not found (wrong business) -> throws AppError 404
 *   4.  business_id is NOT included in the public response
 *   5.  tracked_material_id IS included (for UI linking)
 *
 * listInsightHistory()
 *   6.  Returns paginated items + meta object
 *   7.  Empty history -> items=[], meta.total=0
 *   8.  Material not found -> throws AppError 404
 *   9.  Calls countByMaterial and listByMaterial in parallel
 *   10. Meta reflects page/limit/total correctly
 *
 * listLatestForBusiness()
 *   11. Returns formatted array of insights
 *   12. Returns empty array when no insights exist
 *   13. Accepts custom limit (passed through to repo)
 *   14. Does NOT call findByIdForBusiness (no per-material ownership check)
 *
 * formatInsight()
 *   15. Includes all required public fields
 *   16. Excludes business_id from output
 *   17. Preserves null evidence_price_range
 */

jest.mock('../src/database/connection', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../src/repositories/material.repository', () => ({
  findByIdForBusiness: jest.fn(),
}));

jest.mock('../src/repositories/aiInsight.repository', () => ({
  findLatestByMaterial:  jest.fn(),
  listByMaterial:        jest.fn(),
  countByMaterial:       jest.fn(),
  findLatestByBusiness:  jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

let service;
let materialRepo;
let aiInsightRepo;

beforeEach(() => {
  jest.resetModules();
  jest.mock('../src/database/connection', () => ({ pool: { execute: jest.fn() } }));
  jest.mock('../src/repositories/material.repository', () => ({
    findByIdForBusiness: jest.fn(),
  }));
  jest.mock('../src/repositories/aiInsight.repository', () => ({
    findLatestByMaterial: jest.fn(),
    listByMaterial:       jest.fn(),
    countByMaterial:      jest.fn(),
    findLatestByBusiness: jest.fn(),
  }));
  jest.mock('../src/utils/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn(),
  }));

  service       = require('../src/services/aiInsightQuery.service');
  materialRepo  = require('../src/repositories/material.repository');
  aiInsightRepo = require('../src/repositories/aiInsight.repository');
});

afterEach(() => jest.clearAllMocks());

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeDbRow(overrides = {}) {
  return {
    id:                           1,
    tracked_material_id:          10,
    business_id:                  5,
    headline:                     'WTI crude rose 4% this week.',
    what_happened:                'Price increased from 70.0 to 72.8.',
    why_it_happened:              'Supply disruptions cited in Reuters headlines.',
    business_impact:              'Raw material costs may increase near term.',
    outlook:                      'BULLISH',
    confidence:                   'HIGH',
    evidence_price_range:         '70.00-72.80',
    evidence_price_points_count:  14,
    evidence_news_count:          3,
    model_used:                   'gemini-1.5-flash',
    generated_at:                 new Date('2026-09-15T06:00:00Z'),
    ...overrides,
  };
}

const MATERIAL_ROW = { id: 10, business_id: 5, name: 'WTI Crude Oil' };

// ── getLatestInsight() ────────────────────────────────────────────────────────

describe('getLatestInsight()', () => {
  test('1. material found + insight exists -> returns formatted insight', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.findLatestByMaterial.mockResolvedValue(makeDbRow());

    const result = await service.getLatestInsight(5, 10);

    expect(result).not.toBeNull();
    expect(result.headline).toBe('WTI crude rose 4% this week.');
    expect(result.outlook).toBe('BULLISH');
  });

  test('2. material found + no insight yet -> returns null (not a 404)', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.findLatestByMaterial.mockResolvedValue(null);

    const result = await service.getLatestInsight(5, 10);
    expect(result).toBeNull();
  });

  test('3. material not found (wrong business) -> throws AppError 404', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(null);

    await expect(service.getLatestInsight(5, 10)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(aiInsightRepo.findLatestByMaterial).not.toHaveBeenCalled();
  });

  test('4. business_id is NOT included in the public response', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.findLatestByMaterial.mockResolvedValue(makeDbRow());

    const result = await service.getLatestInsight(5, 10);
    expect(result).not.toHaveProperty('business_id');
  });

  test('5. tracked_material_id IS included for UI linking', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.findLatestByMaterial.mockResolvedValue(makeDbRow());

    const result = await service.getLatestInsight(5, 10);
    expect(result.tracked_material_id).toBe(10);
  });
});

// ── listInsightHistory() ──────────────────────────────────────────────────────

describe('listInsightHistory()', () => {
  const PAGINATION = { page: 1, limit: 10, offset: 0 };

  test('6. returns paginated items + meta object', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.listByMaterial.mockResolvedValue([makeDbRow({ id: 1 }), makeDbRow({ id: 2 })]);
    aiInsightRepo.countByMaterial.mockResolvedValue(2);

    const { items, meta } = await service.listInsightHistory(5, 10, PAGINATION);

    expect(items).toHaveLength(2);
    expect(meta.total).toBe(2);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(10);
  });

  test('7. empty history -> items=[], meta.total=0', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.listByMaterial.mockResolvedValue([]);
    aiInsightRepo.countByMaterial.mockResolvedValue(0);

    const { items, meta } = await service.listInsightHistory(5, 10, PAGINATION);
    expect(items).toEqual([]);
    expect(meta.total).toBe(0);
  });

  test('8. material not found -> throws AppError 404', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(null);

    await expect(service.listInsightHistory(5, 10, PAGINATION)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('9. calls countByMaterial and listByMaterial (parallel)', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.listByMaterial.mockResolvedValue([]);
    aiInsightRepo.countByMaterial.mockResolvedValue(0);

    await service.listInsightHistory(5, 10, PAGINATION);

    expect(aiInsightRepo.listByMaterial).toHaveBeenCalledWith(10, 5, { limit: 10, offset: 0 });
    expect(aiInsightRepo.countByMaterial).toHaveBeenCalledWith(10, 5);
  });

  test('10. meta reflects page/limit/total correctly (page 2, limit 5, total 12)', async () => {
    materialRepo.findByIdForBusiness.mockResolvedValue(MATERIAL_ROW);
    aiInsightRepo.listByMaterial.mockResolvedValue([makeDbRow()]);
    aiInsightRepo.countByMaterial.mockResolvedValue(12);

    const { meta } = await service.listInsightHistory(5, 10, { page: 2, limit: 5, offset: 5 });
    expect(meta.page).toBe(2);
    expect(meta.limit).toBe(5);
    expect(meta.total).toBe(12);
    expect(meta.totalPages).toBe(3); // ceil(12/5)
  });
});

// ── listLatestForBusiness() ───────────────────────────────────────────────────

describe('listLatestForBusiness()', () => {
  test('11. returns formatted array of insights', async () => {
    aiInsightRepo.findLatestByBusiness.mockResolvedValue([
      makeDbRow({ id: 1, tracked_material_id: 10 }),
      makeDbRow({ id: 2, tracked_material_id: 11 }),
    ]);

    const result = await service.listLatestForBusiness(5, 3);
    expect(result).toHaveLength(2);
    expect(result[0].headline).toBe('WTI crude rose 4% this week.');
  });

  test('12. returns empty array when no insights exist', async () => {
    aiInsightRepo.findLatestByBusiness.mockResolvedValue([]);

    const result = await service.listLatestForBusiness(5, 3);
    expect(result).toEqual([]);
  });

  test('13. passes custom limit through to repo', async () => {
    aiInsightRepo.findLatestByBusiness.mockResolvedValue([]);

    await service.listLatestForBusiness(5, 7);
    expect(aiInsightRepo.findLatestByBusiness).toHaveBeenCalledWith(5, 7);
  });

  test('14. does NOT call findByIdForBusiness (no per-material ownership check needed)', async () => {
    aiInsightRepo.findLatestByBusiness.mockResolvedValue([]);

    await service.listLatestForBusiness(5, 3);
    expect(materialRepo.findByIdForBusiness).not.toHaveBeenCalled();
  });
});

// ── formatInsight() ───────────────────────────────────────────────────────────

describe('formatInsight()', () => {
  test('15. includes all required public fields', () => {
    const result = service.formatInsight(makeDbRow());
    const REQUIRED = [
      'id', 'tracked_material_id', 'headline', 'what_happened',
      'why_it_happened', 'business_impact', 'outlook', 'confidence',
      'evidence_price_range', 'evidence_price_points_count',
      'evidence_news_count', 'model_used', 'generated_at',
    ];
    for (const field of REQUIRED) {
      expect(result).toHaveProperty(field);
    }
  });

  test('16. excludes business_id from output', () => {
    const result = service.formatInsight(makeDbRow());
    expect(result).not.toHaveProperty('business_id');
  });

  test('17. preserves null evidence_price_range', () => {
    const result = service.formatInsight(makeDbRow({ evidence_price_range: null }));
    expect(result.evidence_price_range).toBeNull();
  });
});
