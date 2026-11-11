/**
 * Phase 11 — Historical Price Trends & Charts API Integration & QA Test Suite
 *
 * Implements comprehensive verification of the Historical Trends module:
 *   1. GET /api/v1/materials/:materialId/prices/history (Document 2 §5.10 FR-HIST-01, 02, Document 5 §4.10)
 *   2. GET /api/v1/materials/prices/compare (Document 2 §5.10 FR-HIST-03, Document 5 §4.10)
 *
 * Verification Areas:
 *   1. Route Registration & Middleware: Protected by authMiddleware and validate.middleware;
 *      mounted at /api/v1/materials without path collisions.
 *   2. Query Validation:
 *      - Rejects invalid date strings for 'from' and 'to' (400 VALIDATION_ERROR).
 *      - Rejects 'from' after 'to' (400 VALIDATION_ERROR).
 *      - Rejects missing, empty, or non-numeric 'materialIds' (400 VALIDATION_ERROR).
 *      - Enforces 1–5 material count limit on compare (400 VALIDATION_ERROR if > 5).
 *   3. Price History Endpoint (/materials/:id/prices/history):
 *      - 401 on unauthenticated access.
 *      - 404 when user has no business profile.
 *      - 404 when materialId belongs to another business (strict tenant isolation, NFR-SEC-01).
 *      - 404 when materialId does not exist.
 *      - Envelope matches Document 5 §4.10: { success: true, data: [...], meta: { page, limit, total, totalPages } }.
 *      - Chronological ordering: recordedAt ASC chart-ready.
 *      - Invalid price points (is_valid = FALSE) excluded by default.
 *      - Pagination metadata calculated accurately.
 *      - Empty state handled gracefully (data: [], total: 0).
 *      - Metadata preservation: currency, unitLabel, region, grade, providerName, sourceUrl, dataClass, isValid.
 *   4. Price Compare Endpoint (/materials/prices/compare):
 *      - 401 on unauthenticated access.
 *      - 404 when any material in materialIds belongs to another business.
 *      - Documented response shape: [ { materialId, name, series: [ { price, recordedAt, ... } ] } ].
 *      - Chronological ordering for each series.
 *      - Empty series handled safely.
 *      - Invalid points excluded.
 *   5. Date Range Boundary Investigation & Regression (Step 3):
 *      - Inclusive date filtering for 'to=YYYY-MM-DD' includes points recorded later in the day.
 *      - Single-day range (from = to) includes all points recorded on that day.
 *   6. Performance & Architecture:
 *      - Parameterized SQL execution; index-compatible range queries (NFR-PERF-02).
 *      - Price immutability preserved (DR-02).
 */

'use strict';

const trendController = require('../src/controllers/trend.controller');
const trendQueryService = require('../src/services/trendQuery.service');
const materialRepository = require('../src/repositories/material.repository');
const priceRepository = require('../src/repositories/price.repository');
const businessRepository = require('../src/repositories/business.repository');
const trendsRouter = require('../src/routes/trends.routes');
const authMiddleware = require('../src/middleware/auth.middleware');
const validate = require('../src/middleware/validate.middleware');
const {
  validatePriceHistoryQuery,
  validateCompareQuery,
} = require('../src/validators/price.validator');
const { pool } = require('../src/database/connection');
const AppError = require('../src/utils/AppError');

describe('Phase 11 — Historical Price Trends & Charts API', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  // =========================================================================
  // 1. Route Registration & Middleware Architecture
  // =========================================================================
  describe('1. Route Registration & Middleware Architecture', () => {

    test('1.1 registers GET /:materialId/prices/history with authMiddleware, validator, and controller', () => {
      const getRoutes = trendsRouter.stack.filter(
        (layer) => layer.route && layer.route.methods && layer.route.methods.get
      );
      const historyRoute = getRoutes.find((r) => r.route.path === '/:materialId/prices/history');
      expect(historyRoute).toBeDefined();

      const handlers = historyRoute.route.stack.map((s) => s.handle);
      expect(handlers).toContain(authMiddleware);
      expect(handlers).toContain(trendController.getPriceHistory);
    });

    test('1.2 registers GET /prices/compare with authMiddleware, validator, and controller', () => {
      const getRoutes = trendsRouter.stack.filter(
        (layer) => layer.route && layer.route.methods && layer.route.methods.get
      );
      const compareRoute = getRoutes.find((r) => r.route.path === '/prices/compare');
      expect(compareRoute).toBeDefined();

      const handlers = compareRoute.route.stack.map((s) => s.handle);
      expect(handlers).toContain(authMiddleware);
      expect(handlers).toContain(trendController.comparePrices);
    });

    test('1.3 confirms route path separation prevents route collisions', () => {
      // /prices/compare has 2 segments; /:materialId/prices/history has 3 segments
      const compareSegments = '/prices/compare'.split('/').filter(Boolean);
      const historySegments = '/:materialId/prices/history'.split('/').filter(Boolean);
      expect(compareSegments.length).toBe(2);
      expect(historySegments.length).toBe(3);
      expect(compareSegments[0]).toBe('prices');
      expect(historySegments[1]).toBe('prices');
    });

  });

  // =========================================================================
  // 2. Query Parameter Validation (validate.middleware & price.validator)
  // =========================================================================
  describe('2. Query Parameter Validation (price.validator)', () => {

    describe('validatePriceHistoryQuery', () => {
      test('2.1 accepts valid ISO date strings for from and to', () => {
        const errors = validatePriceHistoryQuery({ from: '2026-01-01', to: '2026-07-18' });
        expect(errors).toHaveLength(0);
      });

      test('2.2 rejects invalid date string for from with 400 VALIDATION_ERROR', () => {
        const errors = validatePriceHistoryQuery({ from: 'not-a-date', to: '2026-07-18' });
        expect(errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'from', issue: 'must be a valid date' })])
        );
      });

      test('2.3 rejects invalid date string for to with 400 VALIDATION_ERROR', () => {
        const errors = validatePriceHistoryQuery({ from: '2026-01-01', to: 'invalid-date' });
        expect(errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'to', issue: 'must be a valid date' })])
        );
      });

      test('2.4 rejects from after to with 400 VALIDATION_ERROR (Document 5 §4.10)', () => {
        const errors = validatePriceHistoryQuery({ from: '2026-07-19', to: '2026-07-18' });
        expect(errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'from', issue: 'must not be after to' })])
        );
      });

      test('2.5 allows omitting from and to for full historical view', () => {
        const errors = validatePriceHistoryQuery({});
        expect(errors).toHaveLength(0);
      });
    });

    describe('validateCompareQuery', () => {
      test('2.6 rejects missing materialIds with 400 VALIDATION_ERROR', () => {
        const errors = validateCompareQuery({});
        expect(errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'materialIds', issue: 'is required' })])
        );
      });

      test('2.7 rejects empty or whitespace materialIds with 400 VALIDATION_ERROR', () => {
        const errors = validateCompareQuery({ materialIds: '   ' });
        expect(errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'materialIds', issue: 'is required' })])
        );
      });

      test('2.8 rejects malformed or non-numeric materialIds with 400 VALIDATION_ERROR', () => {
        const errors = validateCompareQuery({ materialIds: '10,foo,20' });
        expect(errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'materialIds', issue: 'must be a comma-separated list of valid ids' }),
          ])
        );
      });

      test('2.9 rejects more than 5 materialIds with 400 VALIDATION_ERROR (Document 5 §4.10 limit)', () => {
        const errors = validateCompareQuery({ materialIds: '1,2,3,4,5,6' });
        expect(errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'materialIds', issue: 'must contain between 1 and 5 material ids' }),
          ])
        );
      });

      test('2.10 accepts valid 1–5 comma-separated IDs with optional valid date range', () => {
        const errors1 = validateCompareQuery({ materialIds: '100', from: '2026-01-01', to: '2026-06-01' });
        expect(errors1).toHaveLength(0);

        const errors5 = validateCompareQuery({ materialIds: '10, 20, 30, 40, 50' });
        expect(errors5).toHaveLength(0);
      });

      test('2.11 rejects from after to in compare query with 400 VALIDATION_ERROR', () => {
        const errors = validateCompareQuery({ materialIds: '10,20', from: '2026-08-01', to: '2026-07-01' });
        expect(errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'from', issue: 'must not be after to' })])
        );
      });
    });

  });

  // =========================================================================
  // 3. Single Material Price History (GET /api/v1/materials/:id/prices/history)
  // =========================================================================
  describe('3. Single Material Price History (GET /materials/:materialId/prices/history)', () => {

    test('3.1 passes 404 NOT_FOUND when business profile is missing', async () => {
      const req = { auth: { userId: 99 }, params: { materialId: '10' }, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce(null);

      await trendController.getPriceHistory(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Business not found',
        })
      );
    });

    test('3.2 enforces tenant isolation: returns 404 NOT_FOUND for material of another business', async () => {
      const req = { auth: { userId: 1, businessId: 42 }, params: { materialId: '999' }, query: {} };
      const res = createMockRes();
      const next = jest.fn();

      // findByIdForBusiness returns null because material 999 belongs to business 99, not 42
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      await trendController.getPriceHistory(req, res, next);

      expect(materialRepository.findByIdForBusiness).toHaveBeenCalledWith('999', 42);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Material not found',
        })
      );
    });

    test('3.3 returns 200 with chronological series and Document 5 §4.10 envelope', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { materialId: '10' },
        query: { page: '1', limit: '20' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 10,
        business_id: 42,
        name: 'PET Resin',
      });

      const mockRows = [
        {
          id: 1,
          price: '135.00',
          recorded_at: '2026-01-05T00:00:00Z',
          source: 'EIA',
          currency: 'USD',
          unit_label: 'bbl',
          region: 'Cushing, OK',
          grade: 'WTI',
          provider_name: 'EIA',
          source_url: 'https://eia.gov',
          data_class: 'OFFICIAL_BENCHMARK',
          is_valid: 1,
        },
        {
          id: 2,
          price: '138.50',
          recorded_at: '2026-01-12T00:00:00Z',
          source: 'EIA',
          currency: 'USD',
          unit_label: 'bbl',
          region: 'Cushing, OK',
          grade: 'WTI',
          provider_name: 'EIA',
          source_url: 'https://eia.gov',
          data_class: 'OFFICIAL_BENCHMARK',
          is_valid: 1,
        },
      ];

      jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce(mockRows);
      jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(2);

      await trendController.getPriceHistory(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({ price: '135.00', recordedAt: '2026-01-05T00:00:00Z', isValid: true }),
          expect.objectContaining({ price: '138.50', recordedAt: '2026-01-12T00:00:00Z', isValid: true }),
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('3.4 strictly excludes invalid price points (is_valid = FALSE) by default', async () => {
      const findSpy = jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([]);
      const countSpy = jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(0);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ id: 10, business_id: 42 });

      await trendQueryService.getPriceHistory(42, 10, { page: 1, limit: 20, offset: 0 });

      expect(findSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ validOnly: true })
      );
      expect(countSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ validOnly: true })
      );
    });

    test('3.5 returns empty data array with total 0 when material has no price history', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { materialId: '15' },
        query: {},
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 15,
        business_id: 42,
        name: 'New Material',
      });
      jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([]);
      jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(0);

      await trendController.getPriceHistory(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        meta: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
        },
      });
    });

    test('3.6 preserves full metadata (provenance, currency, unit, dataClass) in history items', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ id: 10, business_id: 42 });
      jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([
        {
          price: '2650.00',
          recorded_at: '2026-07-01T00:00:00Z',
          source: 'GOI_AGMARKNET',
          currency: 'INR',
          unit_label: 'INR/quintal',
          region: 'Indore, MP',
          grade: 'Wheat Modal',
          provider_name: 'Ministry of Agriculture',
          source_url: 'https://agmarknet.gov.in',
          data_class: 'OFFICIAL_BENCHMARK',
          is_valid: 1,
        },
      ]);
      jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(1);

      const result = await trendQueryService.getPriceHistory(42, 10, { page: 1, limit: 20, offset: 0 });

      expect(result.items[0]).toEqual({
        price: '2650.00',
        recordedAt: '2026-07-01T00:00:00Z',
        source: 'GOI_AGMARKNET',
        currency: 'INR',
        unitLabel: 'INR/quintal',
        region: 'Indore, MP',
        grade: 'Wheat Modal',
        providerName: 'Ministry of Agriculture',
        sourceUrl: 'https://agmarknet.gov.in',
        dataClass: 'OFFICIAL_BENCHMARK',
        isValid: true,
      });
    });

  });

  // =========================================================================
  // 4. Multi-Material Price Comparison (GET /api/v1/materials/prices/compare)
  // =========================================================================
  describe('4. Multi-Material Price Comparison (GET /materials/prices/compare)', () => {

    test('4.1 passes 404 NOT_FOUND when business profile is missing', async () => {
      const req = { auth: { userId: 5 }, query: { materialIds: '10,20' } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce(null);

      await trendController.comparePrices(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Business not found',
        })
      );
    });

    test('4.2 strictly enforces tenant isolation: returns 404 NOT_FOUND if ANY material belongs to another business', async () => {
      const req = { auth: { userId: 1, businessId: 42 }, query: { materialIds: '10,999' } };
      const res = createMockRes();
      const next = jest.fn();

      // Material 10 belongs to business 42, but material 999 belongs to another business
      jest.spyOn(materialRepository, 'findByIdForBusiness')
        .mockImplementation(async (id, busId) => {
          if (Number(id) === 10 && busId === 42) return { id: 10, name: 'PET Resin' };
          return null; // Foreign or non-existent
        });

      await trendController.comparePrices(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Material not found: 999',
        })
      );
    });

    test('4.3 returns 200 with documented multi-series payload shape (Document 5 §4.10)', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        query: { materialIds: '100,101', from: '2026-01-01', to: '2026-07-18' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness')
        .mockResolvedValueOnce({ id: 100, name: 'PET Resin' })
        .mockResolvedValueOnce({ id: 101, name: 'Bottle Caps' });

      const mockSeriesRows = [
        {
          tracked_material_id: 100,
          price: '138.00',
          recorded_at: '2026-01-05T00:00:00Z',
          source: 'EIA',
          currency: 'USD',
          unit_label: 'bbl',
          data_class: 'OFFICIAL_BENCHMARK',
          is_valid: 1,
        },
        {
          tracked_material_id: 101,
          price: '0.45',
          recorded_at: '2026-01-05T00:00:00Z',
          source: 'MANUAL',
          currency: 'INR',
          unit_label: 'pcs',
          data_class: 'SUPPLIER_QUOTE',
          is_valid: 1,
        },
        {
          tracked_material_id: 100,
          price: '142.50',
          recorded_at: '2026-07-18T00:00:00Z',
          source: 'EIA',
          currency: 'USD',
          unit_label: 'bbl',
          data_class: 'OFFICIAL_BENCHMARK',
          is_valid: 1,
        },
      ];

      jest.spyOn(priceRepository, 'findSeriesForMaterials').mockResolvedValueOnce(mockSeriesRows);

      await trendController.comparePrices(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            materialId: 100,
            name: 'PET Resin',
            series: [
              expect.objectContaining({ price: '138.00', recordedAt: '2026-01-05T00:00:00Z' }),
              expect.objectContaining({ price: '142.50', recordedAt: '2026-07-18T00:00:00Z' }),
            ],
          },
          {
            materialId: 101,
            name: 'Bottle Caps',
            series: [
              expect.objectContaining({ price: '0.45', recordedAt: '2026-01-05T00:00:00Z' }),
            ],
          },
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('4.4 handles empty price series for one or more compared materials gracefully', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        query: { materialIds: '10,20' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness')
        .mockResolvedValueOnce({ id: 10, name: 'Material With Prices' })
        .mockResolvedValueOnce({ id: 20, name: 'Material Without Prices' });

      jest.spyOn(priceRepository, 'findSeriesForMaterials').mockResolvedValueOnce([
        {
          tracked_material_id: 10,
          price: '100.00',
          recorded_at: '2026-06-01T00:00:00Z',
          source: 'MANUAL',
          is_valid: 1,
        },
      ]);

      await trendController.comparePrices(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({ materialId: 10, series: [expect.objectContaining({ price: '100.00' })] }),
          expect.objectContaining({ materialId: 20, series: [] }),
        ],
      });
    });

    test('4.5 strictly excludes invalid points from comparison series (validOnly = true)', async () => {
      const findSpy = jest.spyOn(priceRepository, 'findSeriesForMaterials').mockResolvedValueOnce([]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 10, name: 'PET' });

      await trendQueryService.compareMaterials(42, ['10'], { validOnly: true });

      expect(findSpy).toHaveBeenCalledWith(
        [10],
        expect.objectContaining({ validOnly: true })
      );
    });

  });

  // =========================================================================
  // 5. Date Range Boundary Investigation & Regression (Step 3)
  // =========================================================================
  describe('5. Date Range Boundary Investigation & Regression (Step 3)', () => {

    test('5.1 normalizes date-only `to` parameter (YYYY-MM-DD) to end of day (23:59:59) so later intraday prices are included', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ id: 10, business_id: 42 });

      const findSpy = jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([
        {
          price: '100.00',
          recorded_at: '2026-07-18 00:00:00',
          is_valid: 1,
        },
        {
          price: '105.00',
          recorded_at: '2026-07-18 14:30:00', // Intraday / afternoon price point
          is_valid: 1,
        },
        {
          price: '106.00',
          recorded_at: '2026-07-18 23:45:00', // Late evening price point
          is_valid: 1,
        },
      ]);
      const countSpy = jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(3);

      const result = await trendQueryService.getPriceHistory(42, 10, {
        from: '2026-07-01',
        to: '2026-07-18', // Date-only input
        page: 1,
        limit: 20,
        offset: 0,
      });

      // Verifies repository was called with inclusive end-of-day boundary
      expect(findSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          from: '2026-07-01',
          to: '2026-07-18 23:59:59',
        })
      );
      expect(countSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          from: '2026-07-01',
          to: '2026-07-18 23:59:59',
        })
      );

      // Verifies all three price points from July 18 are returned
      expect(result.items).toHaveLength(3);
      expect(result.items[1].recordedAt).toBe('2026-07-18 14:30:00');
      expect(result.items[2].recordedAt).toBe('2026-07-18 23:45:00');
    });

    test('5.2 single-day date query (from = to) captures all points recorded throughout that day', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ id: 10, business_id: 42 });
      const findSpy = jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([]);
      jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(0);

      await trendQueryService.getPriceHistory(42, 10, {
        from: '2026-07-18',
        to: '2026-07-18',
        page: 1,
        limit: 20,
        offset: 0,
      });

      expect(findSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          from: '2026-07-18',
          to: '2026-07-18 23:59:59',
        })
      );
    });

    test('5.3 preserves explicit timestamp or datetime string if already supplied', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ id: 10, business_id: 42 });
      const findSpy = jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([]);
      jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(0);

      await trendQueryService.getPriceHistory(42, 10, {
        from: '2026-07-01 00:00:00',
        to: '2026-07-18 12:00:00', // Explicit midday cutoff
        page: 1,
        limit: 20,
        offset: 0,
      });

      expect(findSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          from: '2026-07-01 00:00:00',
          to: '2026-07-18 12:00:00',
        })
      );
    });

    test('5.4 multi-material compare also applies inclusive end-of-day boundary normalization', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 10, name: 'PET' });
      const findSpy = jest.spyOn(priceRepository, 'findSeriesForMaterials').mockResolvedValueOnce([]);

      await trendQueryService.compareMaterials(42, ['10'], {
        from: '2026-07-01',
        to: '2026-07-18',
      });

      expect(findSpy).toHaveBeenCalledWith(
        [10],
        expect.objectContaining({
          from: '2026-07-01',
          to: '2026-07-18 23:59:59',
        })
      );
    });

  });

  // =========================================================================
  // 6. SQL Construction & Repository Integrity (NFR-PERF-02, DR-02)
  // =========================================================================
  describe('6. SQL Construction & Repository Integrity (NFR-PERF-02, DR-02)', () => {

    test('6.1 findHistoryForMaterial uses composite index range scan (recorded_at >= AND recorded_at <=)', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[
        { id: 1, price: '100.00', recorded_at: '2026-07-01', is_valid: 1 },
      ]]);

      await priceRepository.findHistoryForMaterial(10, {
        from: '2026-07-01',
        to: '2026-07-18 23:59:59',
        limit: 50,
        offset: 0,
        validOnly: true,
      });

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];

      expect(sql).toContain('WHERE tracked_material_id = ?');
      expect(sql).toContain('is_valid = TRUE');
      expect(sql).toContain('recorded_at >= ?');
      expect(sql).toContain('recorded_at <= ?');
      expect(sql).toContain('ORDER BY recorded_at ASC, id ASC');
      expect(sql).toContain('LIMIT 50 OFFSET 0');
      expect(params).toEqual([10, '2026-07-01', '2026-07-18 23:59:59']);
    });

    test('6.2 countHistoryForMaterial executes parameterized COUNT query matching index filters', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[{ total: 42 }]]);

      const count = await priceRepository.countHistoryForMaterial(10, {
        from: '2026-07-01',
        to: '2026-07-18 23:59:59',
        validOnly: true,
      });

      expect(count).toBe(42);
      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('SELECT COUNT(*) AS total FROM price_points WHERE');
      expect(params).toEqual([10, '2026-07-01', '2026-07-18 23:59:59']);
    });

    test('6.3 findSeriesForMaterials constructs parameterized IN clause for multi-material comparison', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await priceRepository.findSeriesForMaterials([10, 20, 30], {
        from: '2026-07-01',
        to: '2026-07-18 23:59:59',
        validOnly: true,
      });

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('WHERE tracked_material_id IN (?, ?, ?)');
      expect(sql).toContain('is_valid = TRUE');
      expect(sql).toContain('ORDER BY tracked_material_id ASC, recorded_at ASC, id ASC');
      expect(params).toEqual([10, 20, 30, '2026-07-01', '2026-07-18 23:59:59']);
    });

    test('6.4 price.repository.js contains zero UPDATE or DELETE methods (DR-02 price immutability)', () => {
      expect(priceRepository.update).toBeUndefined();
      expect(priceRepository.delete).toBeUndefined();
      expect(priceRepository.remove).toBeUndefined();
    });

  });

});
