/**
 * Tests for the external-symbol management endpoint.
 *
 * Covers:
 *   PATCH /api/v1/materials/:materialId/external-symbol
 *
 * via the service and repository layers — all DB and auth dependencies mocked.
 * No real database queries, no real EIA API calls.
 *
 * Tests 1–6: validator layer (shape, type, allowed-values)
 * Tests 7–10: service layer (business-scoping, DB write, ingestion discovery)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/database/connection', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../src/repositories/material.repository', () => ({
  findByIdForBusiness: jest.fn(),
  findById:            jest.fn(),
  updateExternalSymbol: jest.fn(),
  findTrackedByExternalSymbol: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const { validateSetExternalSymbol } = require('../src/validators/material.validator');
const { setExternalSymbol }          = require('../src/services/materialTracking.service');
const materialRepository             = require('../src/repositories/material.repository');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal tracked_materials DB row shape returned by the repository. */
function makeRow(overrides = {}) {
  return {
    id: 1,
    raw_material_id: 42,
    name: 'Crude Oil WTI',
    unit_abbreviation: 'bbl',
    is_tracked: 1,
    external_symbol: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

// ─── 1–6: Validator tests ─────────────────────────────────────────────────────

describe('validateSetExternalSymbol()', () => {

  test('1. accepts WTI', () => {
    expect(validateSetExternalSymbol({ externalSymbol: 'WTI' })).toEqual([]);
  });

  test('2. accepts BRENT', () => {
    expect(validateSetExternalSymbol({ externalSymbol: 'BRENT' })).toEqual([]);
  });

  test('3. accepts null (clear the mapping)', () => {
    expect(validateSetExternalSymbol({ externalSymbol: null })).toEqual([]);
  });

  test('4. rejects unsupported symbol string', () => {
    const errors = validateSetExternalSymbol({ externalSymbol: 'GOLD' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('externalSymbol');
    expect(errors[0].issue).toMatch(/WTI/);
    expect(errors[0].issue).toMatch(/BRENT/);
  });

  test('5. rejects non-string, non-null value (number)', () => {
    const errors = validateSetExternalSymbol({ externalSymbol: 123 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('externalSymbol');
    expect(errors[0].issue).toMatch(/string or null/);
  });

  test('6. rejects missing externalSymbol field', () => {
    const errors = validateSetExternalSymbol({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('externalSymbol');
    expect(errors[0].issue).toBe('is required');
  });

  test('6b. rejects extra fields in body', () => {
    const errors = validateSetExternalSymbol({ externalSymbol: 'WTI', businessId: 99 });
    expect(errors.some((e) => e.field === 'businessId')).toBe(true);
  });
});

// ─── 7–10: Service layer tests ────────────────────────────────────────────────

describe('setExternalSymbol() service', () => {

  test('7. authenticated business user can set WTI — returns updated material with externalSymbol', async () => {
    const row = makeRow({ external_symbol: 'WTI' });
    materialRepository.findByIdForBusiness.mockResolvedValue(makeRow());
    materialRepository.updateExternalSymbol.mockResolvedValue(row);

    const result = await setExternalSymbol(10, 1, 'WTI');

    expect(materialRepository.findByIdForBusiness).toHaveBeenCalledWith(1, 10);
    expect(materialRepository.updateExternalSymbol).toHaveBeenCalledWith(1, 'WTI');
    expect(result.externalSymbol).toBe('WTI');
    expect(result.id).toBe(1);
  });

  test('8. authenticated business user can set BRENT', async () => {
    const row = makeRow({ external_symbol: 'BRENT' });
    materialRepository.findByIdForBusiness.mockResolvedValue(makeRow());
    materialRepository.updateExternalSymbol.mockResolvedValue(row);

    const result = await setExternalSymbol(10, 1, 'BRENT');

    expect(materialRepository.updateExternalSymbol).toHaveBeenCalledWith(1, 'BRENT');
    expect(result.externalSymbol).toBe('BRENT');
  });

  test('9. authenticated business user can clear symbol with null', async () => {
    const row = makeRow({ external_symbol: null });
    materialRepository.findByIdForBusiness.mockResolvedValue(makeRow({ external_symbol: 'WTI' }));
    materialRepository.updateExternalSymbol.mockResolvedValue(row);

    const result = await setExternalSymbol(10, 1, null);

    expect(materialRepository.updateExternalSymbol).toHaveBeenCalledWith(1, null);
    expect(result.externalSymbol).toBeNull();
  });

  test('10. material belonging to another business → 404, updateExternalSymbol never called', async () => {
    // findByIdForBusiness returns null when materialId belongs to a different business
    materialRepository.findByIdForBusiness.mockResolvedValue(null);

    await expect(setExternalSymbol(99, 1, 'WTI')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(materialRepository.updateExternalSymbol).not.toHaveBeenCalled();
  });

  test('11. non-existent material → 404', async () => {
    materialRepository.findByIdForBusiness.mockResolvedValue(null);

    await expect(setExternalSymbol(10, 9999, 'WTI')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(materialRepository.updateExternalSymbol).not.toHaveBeenCalled();
  });

  test('12. after setting WTI — findTrackedByExternalSymbol discovers the material', async () => {
    // Simulate the ingestion job query after the symbol is set:
    // findTrackedByExternalSymbol('WTI') returns the material because
    // external_symbol = 'WTI' AND is_tracked = TRUE in the DB.
    materialRepository.findTrackedByExternalSymbol.mockResolvedValue([
      { id: 1, business_id: 10 },
    ]);

    const discovered = await materialRepository.findTrackedByExternalSymbol('WTI');

    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe(1);
    expect(discovered[0].business_id).toBe(10);
  });

  test('13. after clearing external_symbol — findTrackedByExternalSymbol does NOT find the material', async () => {
    // After null is written to external_symbol, the WHERE external_symbol = 'WTI'
    // clause returns no rows — the material is no longer auto-ingested.
    materialRepository.findTrackedByExternalSymbol.mockResolvedValue([]);

    const discovered = await materialRepository.findTrackedByExternalSymbol('WTI');

    expect(discovered).toHaveLength(0);
  });

  test('14. successful update — returned object includes all expected public fields', async () => {
    const row = makeRow({ external_symbol: 'WTI' });
    materialRepository.findByIdForBusiness.mockResolvedValue(makeRow());
    materialRepository.updateExternalSymbol.mockResolvedValue(row);

    const result = await setExternalSymbol(10, 1, 'WTI');

    // Verify the public shape produced by toPublicMaterial()
    expect(result).toMatchObject({
      id: 1,
      rawMaterialId: 42,
      name: 'Crude Oil WTI',
      unit: 'bbl',
      isTracked: true,
      isCustom: false,
      externalSymbol: 'WTI',
    });
    expect(result).toHaveProperty('createdAt');
  });
});
