/**
 * Tests for V2 T-07 — Bulk Price Upload (POST /api/v1/materials/prices/bulk)
 *
 * Covers:
 *   1. Validation Envelope (validateBulkPriceUpload)
 *      - Rejects non-object bodies, missing prices, empty arrays, batch size > 200
 *   2. Controller Integration (bulkUploadPrices)
 *      - Resolves businessId, invokes service, sends 200 OK
 *   3. Service Logic & Partial Success (bulkAddPrices)
 *      - All rows valid -> 100% inserted
 *      - Duplicate detection via existsByMaterialDateSource & ER_DUP_ENTRY -> skipped
 *      - Untracked material -> failed row
 *      - Cross-tenant material -> failed row (strict tenant isolation, no leak)
 *      - Invalid price (<= 0, NaN) -> failed row
 *      - Invalid/future dates -> failed row
 *      - Mixed partial success breakdown
 *      - Batched alert evaluation: exactly once per unique inserted material
 *      - Alert failure resilience: does not fail the price batch response
 */

'use strict';

const priceIngestionService = require('../src/services/priceIngestion.service');
const priceController = require('../src/controllers/price.controller');
const priceRepository = require('../src/repositories/price.repository');
const materialRepository = require('../src/repositories/material.repository');
const alertEvaluationService = require('../src/services/alertEvaluation.service');
const { validateBulkPriceUpload } = require('../src/validators/price.validator');

describe('V2 T-07 — Bulk Price Upload (POST /api/v1/materials/prices/bulk)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. Validation Envelope (validateBulkPriceUpload)
  // =========================================================================
  describe('1. Validation Envelope', () => {
    test('1.1 rejects null or non-object body', () => {
      const errs1 = validateBulkPriceUpload(null);
      expect(errs1).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'body', issue: 'must be an object' }),
      ]));

      const errs2 = validateBulkPriceUpload('string');
      expect(errs2).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'body', issue: 'must be an object' }),
      ]));
    });

    test('1.2 rejects missing or non-array prices field', () => {
      const errs1 = validateBulkPriceUpload({});
      expect(errs1).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'prices', issue: 'must be an array' }),
      ]));

      const errs2 = validateBulkPriceUpload({ prices: 'not-an-array' });
      expect(errs2).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'prices', issue: 'must be an array' }),
      ]));
    });

    test('1.3 rejects empty prices array', () => {
      const errs = validateBulkPriceUpload({ prices: [] });
      expect(errs).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'prices', issue: 'must contain at least 1 price item' }),
      ]));
    });

    test('1.4 rejects batch size exceeding 200 items', () => {
      const oversized = Array.from({ length: 201 }, (_, i) => ({
        trackedMaterialId: 1,
        price: 100,
        recordedAt: '2026-11-01',
      }));
      const errs = validateBulkPriceUpload({ prices: oversized });
      expect(errs).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'prices', issue: 'cannot exceed maximum batch size of 200 items' }),
      ]));
    });

    test('1.5 rejects non-object items within prices array', () => {
      const errs = validateBulkPriceUpload({ prices: ['invalid-item'] });
      expect(errs).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'prices[0]', issue: 'must be an object' }),
      ]));
    });

    test('1.6 accepts valid batch envelope of 1 to 200 items', () => {
      const valid = [
        { trackedMaterialId: 1, price: 100, recordedAt: '2026-11-01' },
        { trackedMaterialId: 2, price: 200, recordedAt: '2026-11-02' },
      ];
      const errs = validateBulkPriceUpload({ prices: valid });
      expect(errs).toEqual([]);
    });
  });

  // =========================================================================
  // 2. Controller Integration (bulkUploadPrices)
  // =========================================================================
  describe('2. Controller Integration', () => {
    test('2.1 resolves businessId, invokes service, and returns 200 OK with summary', async () => {
      const mockResult = {
        summary: { total: 1, inserted: 1, skipped: 0, failed: 0 },
        results: [{ index: 0, trackedMaterialId: 101, status: 'inserted', id: 501 }],
      };
      jest.spyOn(priceIngestionService, 'bulkAddPrices').mockResolvedValue(mockResult);

      const req = {
        auth: { businessId: 42 },
        body: {
          prices: [{ trackedMaterialId: 101, price: 150, recordedAt: '2026-11-01' }],
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await priceController.bulkUploadPrices(req, res, next);

      expect(priceIngestionService.bulkAddPrices).toHaveBeenCalledWith(42, req.body.prices);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockResult,
      }));
      expect(next).not.toHaveBeenCalled();
    });

    test('2.2 forwards errors to next middleware', async () => {
      jest.spyOn(priceIngestionService, 'bulkAddPrices').mockRejectedValue(new Error('DB failure'));

      const req = {
        auth: { businessId: 42 },
        body: { prices: [{ trackedMaterialId: 101, price: 150, recordedAt: '2026-11-01' }] },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      await priceController.bulkUploadPrices(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // =========================================================================
  // 3. Service Logic & Partial Success (bulkAddPrices)
  // =========================================================================
  describe('3. Service Logic & Partial Success', () => {
    const businessId = 42;
    const trackedMat1 = {
      id: 101,
      business_id: 42,
      name: 'PET Resin',
      unit_abbreviation: 'kg',
      is_tracked: 1,
    };
    const trackedMat2 = {
      id: 102,
      business_id: 42,
      name: 'Caustic Soda',
      unit_abbreviation: 't',
      is_tracked: 1,
    };
    const untrackedMat = {
      id: 103,
      business_id: 42,
      name: 'Untracked Mat',
      unit_abbreviation: 'kg',
      is_tracked: 0,
    };

    test('3.1 inserts valid rows and triggers alert evaluation once per material', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness')
        .mockImplementation(async (id, bId) => {
          if (bId === 42 && id === 101) return trackedMat1;
          if (bId === 42 && id === 102) return trackedMat2;
          return null;
        });

      jest.spyOn(priceRepository, 'existsByMaterialDateSource').mockResolvedValue(false);
      jest.spyOn(priceRepository, 'create').mockImplementation(async (data) => ({
        id: Math.floor(Math.random() * 1000) + 1,
        tracked_material_id: data.trackedMaterialId,
        price: data.price,
        recorded_at: data.recordedAt,
        source: data.source,
        currency: data.currency,
      }));
      const alertSpy = jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

      const prices = [
        { trackedMaterialId: 101, price: 110.0, recordedAt: '2026-11-01', currency: 'INR' },
        { trackedMaterialId: 101, price: 112.5, recordedAt: '2026-11-02', currency: 'INR' },
        { trackedMaterialId: 102, price: 450.0, recordedAt: '2026-11-01', currency: 'USD' },
      ];

      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary).toEqual({
        total: 3,
        inserted: 3,
        skipped: 0,
        failed: 0,
      });
      expect(res.results).toHaveLength(3);
      expect(res.results[0]).toMatchObject({ index: 0, trackedMaterialId: 101, status: 'inserted' });
      expect(res.results[1]).toMatchObject({ index: 1, trackedMaterialId: 101, status: 'inserted' });
      expect(res.results[2]).toMatchObject({ index: 2, trackedMaterialId: 102, status: 'inserted' });

      // Alert evaluation called exactly once per distinct material (101 and 102), not twice for 101
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(alertSpy).toHaveBeenCalledWith(42, 101);
      expect(alertSpy).toHaveBeenCalledWith(42, 102);
    });

    test('3.2 skips duplicate rows gracefully via pre-check and ER_DUP_ENTRY', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(trackedMat1);
      // First row detected by existsByMaterialDateSource
      jest.spyOn(priceRepository, 'existsByMaterialDateSource')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      // Second row encounters race condition ER_DUP_ENTRY during insert
      const dupError = new Error('Duplicate entry');
      dupError.code = 'ER_DUP_ENTRY';
      jest.spyOn(priceRepository, 'create').mockRejectedValueOnce(dupError);

      const alertSpy = jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

      const prices = [
        { trackedMaterialId: 101, price: 110.0, recordedAt: '2026-11-01' },
        { trackedMaterialId: 101, price: 110.0, recordedAt: '2026-11-02' },
      ];

      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary).toEqual({
        total: 2,
        inserted: 0,
        skipped: 2,
        failed: 0,
      });
      expect(res.results[0]).toMatchObject({
        index: 0,
        trackedMaterialId: 101,
        status: 'skipped',
        reason: 'Duplicate price entry for this material and date',
      });
      expect(res.results[1]).toMatchObject({
        index: 1,
        trackedMaterialId: 101,
        status: 'skipped',
        reason: 'Duplicate price entry for this material and date',
      });
      expect(alertSpy).not.toHaveBeenCalled();
    });

    test('3.3 rejects untracked material with row-level failure', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(untrackedMat);

      const prices = [{ trackedMaterialId: 103, price: 100, recordedAt: '2026-11-01' }];
      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary).toEqual({
        total: 1,
        inserted: 0,
        skipped: 0,
        failed: 1,
      });
      expect(res.results[0]).toMatchObject({
        index: 0,
        trackedMaterialId: 103,
        status: 'failed',
        reason: 'Material is not currently tracked',
      });
    });

    test('3.4 strictly enforces tenant scoping (cross-tenant material fails with no leak)', async () => {
      // Material ID 999 belongs to another business -> returns null
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      const prices = [{ trackedMaterialId: 999, price: 100, recordedAt: '2026-11-01' }];
      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary).toEqual({
        total: 1,
        inserted: 0,
        skipped: 0,
        failed: 1,
      });
      expect(res.results[0]).toMatchObject({
        index: 0,
        trackedMaterialId: 999,
        status: 'failed',
        reason: 'Material not found or not tracked',
      });
    });

    test('3.5 rejects invalid price values (<= 0, NaN)', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(trackedMat1);

      const prices = [
        { trackedMaterialId: 101, price: -5, recordedAt: '2026-11-01' },
        { trackedMaterialId: 101, price: 0, recordedAt: '2026-11-01' },
        { trackedMaterialId: 101, price: 'abc', recordedAt: '2026-11-01' },
      ];
      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary).toEqual({
        total: 3,
        inserted: 0,
        skipped: 0,
        failed: 3,
      });
      expect(res.results[0].reason).toBe('Price must be a number greater than 0');
      expect(res.results[1].reason).toBe('Price must be a number greater than 0');
      expect(res.results[2].reason).toBe('Price must be a number greater than 0');
    });

    test('3.6 rejects invalid dates and future dates', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(trackedMat1);

      const futureDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const prices = [
        { trackedMaterialId: 101, price: 100, recordedAt: 'not-a-date' },
        { trackedMaterialId: 101, price: 100, recordedAt: futureDate },
      ];
      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary.failed).toBe(2);
      expect(res.results[0].reason).toBe('recordedAt must be a valid date');
      expect(res.results[1].reason).toBe('recordedAt cannot be in the future');
    });

    test('3.7 handles mixed partial success batch accurately', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockImplementation(async (id) => {
        if (id === 101) return trackedMat1;
        return null;
      });
      jest.spyOn(priceRepository, 'existsByMaterialDateSource')
        .mockResolvedValueOnce(false)  // row 0: insert
        .mockResolvedValueOnce(true);  // row 1: duplicate

      jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 701,
        tracked_material_id: 101,
        price: 115.5,
        recorded_at: '2026-11-01 00:00:00',
        currency: 'INR',
      });
      jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

      const prices = [
        { trackedMaterialId: 101, price: 115.5, recordedAt: '2026-11-01' }, // valid -> inserted
        { trackedMaterialId: 101, price: 115.5, recordedAt: '2026-11-01' }, // duplicate -> skipped
        { trackedMaterialId: 999, price: 50.0, recordedAt: '2026-11-01' },  // cross-tenant -> failed
        { trackedMaterialId: 101, price: -10, recordedAt: '2026-11-01' },   // invalid price -> failed
      ];

      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary).toEqual({
        total: 4,
        inserted: 1,
        skipped: 1,
        failed: 2,
      });
      expect(res.results[0]).toMatchObject({ index: 0, status: 'inserted', id: 701 });
      expect(res.results[1]).toMatchObject({ index: 1, status: 'skipped' });
      expect(res.results[2]).toMatchObject({ index: 2, status: 'failed', reason: 'Material not found or not tracked' });
      expect(res.results[3]).toMatchObject({ index: 3, status: 'failed', reason: 'Price must be a number greater than 0' });
    });

    test('3.8 alert evaluation failure does not fail the bulk insertion response', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(trackedMat1);
      jest.spyOn(priceRepository, 'existsByMaterialDateSource').mockResolvedValue(false);
      jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 801,
        tracked_material_id: 101,
        price: 120,
        recorded_at: '2026-11-01',
      });
      // Alert evaluation fails
      jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockRejectedValue(new Error('Alert engine timeout'));

      const prices = [{ trackedMaterialId: 101, price: 120, recordedAt: '2026-11-01' }];
      const res = await priceIngestionService.bulkAddPrices(businessId, prices);

      expect(res.summary.inserted).toBe(1);
      expect(res.results[0].status).toBe('inserted');
    });
  });
});
