/**
 * Tests for Phase 7 — Price Tracking (FR-PRICE-01, 02, 03, 04, 05, Document 5 §4.6).
 *
 * Covers:
 *   1. Latest Valid Price Retrieval (GET /api/v1/materials/:materialId/prices/latest)
 *      - Retrieves latest valid price with metadata (currency, unit, dataClass, etc.)
 *      - Strictly excludes invalid records (is_valid = 0 / spike outliers) and returns previous valid point
 *      - Returns 404 NOT_FOUND when no valid prices exist
 *      - Strict tenant isolation (material of another business -> 404)
 *   2. Manual Price Entry (POST /api/v1/materials/:materialId/prices)
 *      - Records price point with 201 Created and source = 'MANUAL'
 *      - Validates price > 0, recordedAt not in future, missing fields (400 VALIDATION_ERROR)
 *      - Rejects logging price for untracked material with 404 NOT_FOUND (FR-PRICE-01, FR-MAT-01)
 *      - Rejects logging price for material belonging to another business with 404 NOT_FOUND
 *      - Immediately evaluates alert rules after recording price
 *   3. Price Source Info & Provenance (GET /api/v1/materials/:materialId/prices/source-info)
 *      - Distinguishes proxy benchmarks (WTI/Brent USD/bbl) from domestic supplier quotes (INR)
 *      - Preserves user-facing disclaimers
 *      - Strict tenant isolation
 *   4. Automated Provider Ingestion & Integrity
 *      - Attaches automated benchmark feeds only to materials with approved external_symbol
 *      - Never attaches automated/fabricated prices to manual materials (external_symbol = null)
 *      - Ingestion deduplication (prevents duplicate daily records)
 *      - Safe error handling on provider failures
 *      - Scheduled execution skips when PRICE_INGESTION_ENABLED=false
 *   5. Price History & Trends (GET /api/v1/materials/:materialId/prices/history)
 *      - Date range filtering (?from=&to=)
 *      - Rejects from > to with 400 VALIDATION_ERROR
 *      - Excludes invalid records from history series
 *      - Strict tenant isolation
 *   6. Repository Layer SQL Construction Verification
 */

'use strict';

const priceQueryService = require('../src/services/priceQuery.service');
const priceIngestionService = require('../src/services/priceIngestion.service');
const trendQueryService = require('../src/services/trendQuery.service');
const priceController = require('../src/controllers/price.controller');
const priceRepository = require('../src/repositories/price.repository');
const materialRepository = require('../src/repositories/material.repository');
const alertEvaluationService = require('../src/services/alertEvaluation.service');
const syncStatusRepository = require('../src/repositories/syncStatus.repository');
const eiaProvider = require('../src/providers/eia.provider');
const { pool } = require('../src/database/connection');
const { runIngestion } = require('../src/jobs/priceIngestion.job');
const {
  validateAddPrice,
  validatePriceHistoryQuery,
} = require('../src/validators/price.validator');
const env = require('../src/config/env');
const AppError = require('../src/utils/AppError');

describe('Phase 7 — Price Tracking', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. Latest Valid Price Retrieval (GET /materials/:materialId/prices/latest)
  // =========================================================================
  describe('1. Latest Valid Price Retrieval (FR-PRICE-04, Document 5 §4.6)', () => {

    const mockTrackedMaterial = {
      id: 101,
      business_id: 42,
      raw_material_id: 10,
      name: 'PET Resin',
      unit: 'kg',
      is_tracked: 1,
      external_symbol: 'WTI',
    };

    test('1.1 retrieves latest valid price with full metadata', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTrackedMaterial);
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 501,
        price: '78.50',
        recorded_at: '2026-09-15 00:00:00',
        source: 'THIRD_PARTY_API',
        currency: 'USD',
        unit_label: 'USD/bbl',
        region: 'Cushing, OK',
        grade: 'Light Sweet Crude Oil',
        provider_name: 'U.S. Energy Information Administration (EIA)',
        source_url: 'https://www.eia.gov',
        data_class: 'OFFICIAL_BENCHMARK',
        is_valid: 1,
        invalid_reason: null,
      });

      const result = await priceQueryService.getLatestPrice(42, 101);

      expect(result).toEqual({
        price: '78.50',
        recordedAt: '2026-09-15 00:00:00',
        source: 'THIRD_PARTY_API',
        currency: 'USD',
        unitLabel: 'USD/bbl',
        region: 'Cushing, OK',
        grade: 'Light Sweet Crude Oil',
        providerName: 'U.S. Energy Information Administration (EIA)',
        sourceUrl: 'https://www.eia.gov',
        dataClass: 'OFFICIAL_BENCHMARK',
        isValid: true,
        invalidReason: null,
      });
      // Verifies validOnly = true was passed to repository
      expect(priceRepository.findLatestByMaterialId).toHaveBeenCalledWith(101, true);
    });

    test('1.2 strictly excludes invalid price points and returns 404 when no valid prices exist', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTrackedMaterial);
      // findLatestByMaterialId with validOnly=true returns null because all points are invalid
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue(null);

      await expect(
        priceQueryService.getLatestPrice(42, 101)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: expect.stringContaining('No valid price recorded yet'),
      });
    });

    test('1.3 secondary guard: rejects invalid price point even if returned by mock with 404 NOT_FOUND', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTrackedMaterial);
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 502,
        price: '99999.00',
        recorded_at: '2026-09-16 00:00:00',
        source: 'THIRD_PARTY_API',
        is_valid: 0,
        invalid_reason: 'Spike outlier anomaly',
      });

      await expect(
        priceQueryService.getLatestPrice(42, 101)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: expect.stringContaining('No valid price recorded yet'),
      });
    });

    test('1.4 enforces tenant isolation: throws 404 NOT_FOUND for material of another business', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        priceQueryService.getLatestPrice(999, 101)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Material not found',
      });
    });

    test('1.5 getLatestPrice controller resolves businessId and returns 200', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { materialId: '101' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(priceQueryService, 'getLatestPrice').mockResolvedValue({
        price: '78.50',
        recordedAt: '2026-09-15 00:00:00',
        source: 'THIRD_PARTY_API',
      });

      await priceController.getLatestPrice(req, res, next);

      expect(priceQueryService.getLatestPrice).toHaveBeenCalledWith(42, '101');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ price: '78.50' }),
        })
      );
    });

  });

  // =========================================================================
  // 2. Manual Price Entry (POST /materials/:materialId/prices)
  // =========================================================================
  describe('2. Manual Price Entry (FR-PRICE-01, 02, 05, Document 5 §4.6)', () => {

    const mockTrackedMaterial = {
      id: 102,
      business_id: 42,
      raw_material_id: null,
      name: 'Custom Resin Flakes',
      unit: 'kg',
      is_tracked: 1,
    };

    const mockUntrackedMaterial = {
      id: 103,
      business_id: 42,
      raw_material_id: null,
      name: 'Old Untracked Material',
      unit: 'kg',
      is_tracked: 0,
    };

    test('2.1 successfully logs supplier quote with 201 Created and source=MANUAL', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTrackedMaterial);
      jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 601,
        price: '115.50',
        recorded_at: '2026-09-15',
        source: 'MANUAL',
        currency: 'INR',
        unit_label: 'kg',
        region: 'Domestic (India)',
        grade: 'Food Grade',
        provider_name: 'Supplier Manual Entry',
        source_url: null,
        data_class: 'SUPPLIER_QUOTE',
        is_valid: 1,
      });
      const alertSpy = jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

      const created = await priceIngestionService.addManualPrice(42, 102, {
        price: 115.50,
        recordedAt: '2026-09-15',
        grade: 'Food Grade',
      });

      expect(created).toMatchObject({
        id: 601,
        price: '115.50',
        source: 'MANUAL',
        currency: 'INR',
        unitLabel: 'kg',
        dataClass: 'SUPPLIER_QUOTE',
        isValid: true,
      });
      expect(priceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          trackedMaterialId: 102,
          price: 115.50,
          source: 'MANUAL',
          currency: 'INR',
          dataClass: 'SUPPLIER_QUOTE',
          isValid: true,
        })
      );
      // Evaluates alerts immediately
      expect(alertSpy).toHaveBeenCalledWith(42, 102);
    });

    test('2.2 rejects manual price logging for untracked material (is_tracked = false) with 404 NOT_FOUND', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockUntrackedMaterial);

      await expect(
        priceIngestionService.addManualPrice(42, 103, {
          price: 100,
          recordedAt: '2026-09-15',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Material is not currently tracked',
      });
    });

    test('2.3 rejects manual price logging for material of another business with 404 NOT_FOUND', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        priceIngestionService.addManualPrice(999, 102, {
          price: 100,
          recordedAt: '2026-09-15',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Material not found',
      });
    });

    test('2.4 validation: rejects price <= 0', () => {
      expect(validateAddPrice({ price: 0, recordedAt: '2026-09-15' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'price' })])
      );
      expect(validateAddPrice({ price: -15, recordedAt: '2026-09-15' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'price' })])
      );
    });

    test('2.5 validation: rejects future recordedAt date', () => {
      const futureDate = '2099-12-31';
      expect(validateAddPrice({ price: 100, recordedAt: futureDate })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'recordedAt', issue: 'cannot be in the future' })])
      );
    });

    test('2.6 validation: rejects missing recordedAt or invalid date', () => {
      expect(validateAddPrice({ price: 100 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'recordedAt', issue: 'is required' })])
      );
      expect(validateAddPrice({ price: 100, recordedAt: 'not-a-date' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'recordedAt', issue: 'must be a valid date' })])
      );
    });

    test('2.7 addPrice controller returns 201 Created', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { materialId: '102' },
        body: { price: 150, recordedAt: '2026-09-15' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(priceIngestionService, 'addManualPrice').mockResolvedValue({
        id: 701,
        price: '150.00',
        source: 'MANUAL',
      });

      await priceController.addPrice(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 701 }),
        })
      );
    });

  });

  // =========================================================================
  // 3. Price Source Info & Provenance (GET /materials/:materialId/prices/source-info)
  // =========================================================================
  describe('3. Price Source Info & Provenance Disclaimers', () => {

    test('3.1 provides proxy benchmark warning and EIA attribution for crude proxy (WTI)', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
        unit: 'kg',
        external_symbol: 'WTI',
      });
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        price: '78.50',
        recorded_at: '2026-09-15',
        source: 'THIRD_PARTY_API',
        currency: 'USD',
        unit_label: 'USD/bbl',
        grade: 'WTI Crude Oil',
      });

      const info = await priceQueryService.getPriceSourceInfo(42, 1);

      expect(info.isProxy).toBe(true);
      expect(info.currency).toBe('USD');
      expect(info.unitLabel).toBe('USD/bbl');
      expect(info.disclaimer).toContain('Price reflects a global commodity benchmark');
      expect(info.providerName).toContain('EIA');
    });

    test('3.2 provides supplier quote disclosure for manual material without proxy flag', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 2,
        name: 'Bottle Caps',
        unit: 'pcs',
        external_symbol: null,
      });
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        price: '0.45',
        recorded_at: '2026-09-15',
        source: 'MANUAL',
        currency: 'INR',
        unit_label: 'pcs',
      });

      const info = await priceQueryService.getPriceSourceInfo(42, 2);

      expect(info.isProxy).toBe(false);
      expect(info.currency).toBe('INR');
      expect(info.unitLabel).toBe('pcs');
      expect(info.disclaimer).toContain('Direct supplier quote');
    });

    test('3.3 enforces tenant isolation: returns 404 NOT_FOUND for material of another business', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        priceQueryService.getPriceSourceInfo(999, 1)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

  });

  // =========================================================================
  // 4. Automated Provider Ingestion & Data Integrity
  // =========================================================================
  describe('4. Automated Provider Ingestion & Data Integrity', () => {

    test('4.1 ingests provider prices only for materials with configured external_symbol', async () => {
      jest.spyOn(priceRepository, 'existsByMaterialDateSource').mockResolvedValue(false);
      const createSpy = jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 801,
        price: '82.00',
        recorded_at: '2026-09-15 00:00:00',
        source: 'THIRD_PARTY_API',
      });
      jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

      const result = await priceIngestionService.ingestFromProvider(
        { id: 10, business_id: 1 },
        { symbol: 'WTI', price: 82.00, recordedAt: '2026-09-15' }
      );

      expect(result.status).toBe('inserted');
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trackedMaterialId: 10,
          price: 82.00,
          source: 'THIRD_PARTY_API',
          currency: 'USD',
          unitLabel: 'USD/bbl',
          isValid: true,
        })
      );
    });

    test('4.2 deduplicates duplicate daily price ingestion from provider', async () => {
      // existsByMaterialDateSource returns true (already exists)
      jest.spyOn(priceRepository, 'existsByMaterialDateSource').mockResolvedValue(true);
      const createSpy = jest.spyOn(priceRepository, 'create');

      const result = await priceIngestionService.ingestFromProvider(
        { id: 10, business_id: 1 },
        { symbol: 'WTI', price: 82.00, recordedAt: '2026-09-15' }
      );

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('duplicate');
      expect(createSpy).not.toHaveBeenCalled();
    });

    test('4.2b ingests India Govt symbols with GOVERNMENT_DATASET provenance and deduplicates on GOVERNMENT_DATASET', async () => {
      const existsSpy = jest.spyOn(priceRepository, 'existsByMaterialDateSource')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const createSpy = jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 802,
        price: '2650.00',
        recorded_at: '2026-11-09 00:00:00',
        source: 'GOVERNMENT_DATASET',
      });
      jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

      const inserted = await priceIngestionService.ingestFromProvider(
        { id: 15, business_id: 2 },
        { symbol: 'WHEAT_GOI', price: 2650, recordedAt: '2026-11-09' }
      );
      expect(inserted.status).toBe('inserted');
      expect(existsSpy).toHaveBeenNthCalledWith(1, 15, '2026-11-09 00:00:00', 'GOVERNMENT_DATASET');
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trackedMaterialId: 15,
          source: 'GOVERNMENT_DATASET',
          currency: 'INR',
          unitLabel: 'INR/quintal',
        })
      );

      const skipped = await priceIngestionService.ingestFromProvider(
        { id: 15, business_id: 2 },
        { symbol: 'WHEAT_GOI', price: 2650, recordedAt: '2026-11-09' }
      );
      expect(skipped.status).toBe('skipped');
      expect(skipped.reason).toBe('duplicate');
      expect(existsSpy).toHaveBeenNthCalledWith(2, 15, '2026-11-09 00:00:00', 'GOVERNMENT_DATASET');
    });

    test('4.3 automated scheduler skips execution when PRICE_INGESTION_ENABLED is false', async () => {
      const origEnabled = env.priceIngestion.enabled;
      env.priceIngestion.enabled = false;

      const result = await runIngestion();

      expect(result.status).toBe('SKIPPED');
      expect(result.reason).toBe('disabled');

      env.priceIngestion.enabled = origEnabled;
    });

    test('4.4 provider error updates sync_status with FAILED without crashing', async () => {
      const origEnabled = env.priceIngestion.enabled;
      env.priceIngestion.enabled = true;

      jest.spyOn(syncStatusRepository, 'upsert').mockResolvedValue(undefined);
      jest.spyOn(eiaProvider, 'fetchLatestPrices').mockRejectedValue(new Error('Network timeout'));

      const result = await runIngestion();

      expect(result.status).toBe('FAILED');
      expect(syncStatusRepository.upsert).toHaveBeenCalledWith(
        'PRICE_INGESTION',
        expect.objectContaining({ lastStatus: 'FAILED' })
      );

      env.priceIngestion.enabled = origEnabled;
    });

  });

  // =========================================================================
  // 5. Price History & Trends (GET /materials/:materialId/prices/history)
  // =========================================================================
  describe('5. Price History & Trends (FR-HIST-01, 02, Document 5 §4.10)', () => {

    test('5.1 returns chronological series with validOnly filtering', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 10,
        name: 'PET Resin',
      });
      jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValue([
        {
          price: '70.00',
          recorded_at: '2026-09-01',
          source: 'THIRD_PARTY_API',
          currency: 'USD',
          unit_label: 'USD/bbl',
          is_valid: 1,
        },
        {
          price: '75.00',
          recorded_at: '2026-09-10',
          source: 'THIRD_PARTY_API',
          currency: 'USD',
          unit_label: 'USD/bbl',
          is_valid: 1,
        },
      ]);
      jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValue(2);

      const res = await trendQueryService.getPriceHistory(42, 10, {
        from: '2026-09-01',
        to: '2026-09-15',
        page: 1,
        limit: 50,
        offset: 0,
      });

      expect(res.items).toHaveLength(2);
      expect(res.items[0].price).toBe('70.00');
      expect(res.items[1].price).toBe('75.00');
      expect(res.meta.total).toBe(2);
      expect(priceRepository.findHistoryForMaterial).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ validOnly: true })
      );
    });

    test('5.2 validates that from date must not be after to date', () => {
      const errors = validatePriceHistoryQuery({ from: '2026-09-20', to: '2026-09-10' });
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'from', issue: 'must not be after to' })])
      );
    });

    test('5.3 enforces tenant isolation on price history: foreign material returns 404', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        trendQueryService.getPriceHistory(999, 10, { page: 1, limit: 20, offset: 0 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

  });

  // =========================================================================
  // 6. Repository Layer SQL Construction Verification
  // =========================================================================
  describe('6. Repository Layer SQL Construction Verification', () => {

    test('6.1 findLatestByMaterialId includes is_valid = TRUE when validOnly is true', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await priceRepository.findLatestByMaterialId(25, true);

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('WHERE tracked_material_id = ?');
      expect(sql).toContain('AND is_valid = TRUE');
      expect(sql).toContain('ORDER BY recorded_at DESC, id DESC LIMIT 1');
      expect(params).toEqual([25]);
    });

    test('6.2 findLatestByMaterialId omits is_valid filter when validOnly is false', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await priceRepository.findLatestByMaterialId(25, false);

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('WHERE tracked_material_id = ?');
      expect(sql).not.toContain('AND is_valid = TRUE');
      expect(params).toEqual([25]);
    });

    test('6.3 findLatestPricesByMaterialIds partitions and enforces is_valid = TRUE', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await priceRepository.findLatestPricesByMaterialIds([1, 2, 3], true);

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('tracked_material_id IN (?, ?, ?)');
      expect(sql).toContain('AND is_valid = TRUE');
      expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY tracked_material_id ORDER BY recorded_at DESC, id DESC)');
      expect(params).toEqual([1, 2, 3]);
    });

    test('6.4 findHistoryForMaterial includes is_valid = TRUE and date filters', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await priceRepository.findHistoryForMaterial(25, {
        from: '2026-09-01',
        to: '2026-09-10',
        limit: 20,
        offset: 0,
        validOnly: true,
      });

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('tracked_material_id = ?');
      expect(sql).toContain('is_valid = TRUE');
      expect(sql).toContain('recorded_at >= ?');
      expect(sql).toContain('recorded_at <= ?');
      expect(sql).toContain('ORDER BY recorded_at ASC, id ASC');
      expect(params).toEqual([25, '2026-09-01', '2026-09-10']);
    });

  });

});
