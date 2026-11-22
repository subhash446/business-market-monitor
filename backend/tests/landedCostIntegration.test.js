'use strict';

/**
 * Landed-Cost & FX Parity Route, Controller, Validation & Recommendation Integration Tests (V3-M3).
 */

const { validateUpdateLandedCost } = require('../src/validators/material.validator');
const materialController = require('../src/controllers/material.controller');
const fxController = require('../src/controllers/fx.controller');
const materialTrackingService = require('../src/services/materialTracking.service');
const materialRepository = require('../src/repositories/material.repository');
const businessRepository = require('../src/repositories/business.repository');
const fxRateService = require('../src/services/fxRate.service');
const supplierRecommendationService = require('../src/services/supplierRecommendation.service');

describe('V3-M3 — Landed Cost & FX Integration & Validation Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  describe('1. validateUpdateLandedCost (Refinement 3 Bounds & Integrity)', () => {
    test('accepts valid configuration payload', () => {
      const errors = validateUpdateLandedCost({
        landedUnitFactor: 0.00735,
        landedDutyFreightPct: 10.5,
        landedFixedSpreadInr: 32.00,
      });
      expect(errors).toHaveLength(0);
    });

    test('accepts clearing configuration (all nulls)', () => {
      const errors = validateUpdateLandedCost({
        landedUnitFactor: null,
        landedDutyFreightPct: null,
        landedFixedSpreadInr: null,
      });
      expect(errors).toHaveLength(0);
    });

    test('rejects empty body, non-objects, and unknown fields', () => {
      expect(validateUpdateLandedCost(null)).toHaveLength(1);
      expect(validateUpdateLandedCost({})).toHaveLength(1);
      expect(validateUpdateLandedCost({ landedUnitFactor: 1.0, maliciousField: 123 })).toHaveLength(1);
    });

    test('enforces numeric bounds (factor <= 100000, duty <= 500, spread <= 1000000)', () => {
      // Negative / zero factor
      expect(validateUpdateLandedCost({ landedUnitFactor: 0 })).toEqual([
        { field: 'landedUnitFactor', issue: 'must be a positive number <= 100000 or null' },
      ]);
      expect(validateUpdateLandedCost({ landedUnitFactor: -1 })).toEqual([
        { field: 'landedUnitFactor', issue: 'must be a positive number <= 100000 or null' },
      ]);
      expect(validateUpdateLandedCost({ landedUnitFactor: 100001 })).toEqual([
        { field: 'landedUnitFactor', issue: 'must be a positive number <= 100000 or null' },
      ]);

      // Negative or overflow duty
      expect(validateUpdateLandedCost({ landedDutyFreightPct: -5 })).toEqual([
        { field: 'landedDutyFreightPct', issue: 'must be a non-negative number <= 500 or null' },
      ]);
      expect(validateUpdateLandedCost({ landedDutyFreightPct: 501 })).toEqual([
        { field: 'landedDutyFreightPct', issue: 'must be a non-negative number <= 500 or null' },
      ]);

      // Negative or overflow spread
      expect(validateUpdateLandedCost({ landedFixedSpreadInr: -1 })).toEqual([
        { field: 'landedFixedSpreadInr', issue: 'must be a non-negative number <= 1000000 or null' },
      ]);
      expect(validateUpdateLandedCost({ landedFixedSpreadInr: 1000001 })).toEqual([
        { field: 'landedFixedSpreadInr', issue: 'must be a non-negative number <= 1000000 or null' },
      ]);
    });
  });

  describe('2. materialController.updateLandedCost & tenant isolation', () => {
    test('successfully updates landed cost for authorized business', async () => {
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce({ id: 10 });
      jest.spyOn(materialTrackingService, 'updateLandedCost').mockResolvedValueOnce({
        id: 42,
        name: 'PET Resin',
        landedUnitFactor: 0.00735,
        landedDutyFreightPct: 10.0,
        landedFixedSpreadInr: 32.0,
      });

      const req = {
        auth: { userId: 5 },
        params: { materialId: 42 },
        body: { landedUnitFactor: 0.00735, landedDutyFreightPct: 10.0, landedFixedSpreadInr: 32.0 },
      };
      const res = createMockRes();
      const next = jest.fn();

      await materialController.updateLandedCost(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 42,
            landedUnitFactor: 0.00735,
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('passes error to next middleware when material not found or cross-tenant', async () => {
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce({ id: 10 });
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      const req = {
        auth: { userId: 5 },
        params: { materialId: 999 },
        body: { landedUnitFactor: 1.0 },
      };
      const res = createMockRes();
      const next = jest.fn();

      await materialController.updateLandedCost(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('3. fxController.getLatestFxRate', () => {
    test('returns latest exchange rate', async () => {
      jest.spyOn(fxRateService, 'getLatestRate').mockResolvedValueOnce({
        baseCurrency: 'USD',
        quoteCurrency: 'INR',
        rate: 86.42,
        rateDate: '2026-11-20',
        source: 'FRANKFURTER_ECB',
        isStale: false,
        ageDays: 2,
      });

      const req = { query: { base: 'USD', quote: 'INR' } };
      const res = createMockRes();
      const next = jest.fn();

      await fxController.getLatestFxRate(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          baseCurrency: 'USD',
          quoteCurrency: 'INR',
          rate: 86.42,
        }),
      });
    });
  });

  describe('4. supplierRecommendationService with fxNormalizedComparison', () => {
    test('attaches fxNormalizedComparison while preserving quoteComparison backward-compatibility', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 7,
        business_id: 10,
        name: 'HDPE Granules',
        unit_abbreviation: 'kg',
        is_tracked: 1,
        external_symbol: 'BRENT',
        landed_unit_factor: '0.00735',
        landed_duty_freight_pct: '10.0',
        landed_fixed_spread_inr: '32.0',
      });

      // Price points: Domestic quote in INR and Benchmark in USD
      jest.spyOn(require('../src/database/connection').pool, 'execute').mockImplementation(async (sql) => {
        if (sql.includes('FROM price_points')) {
          return [[
            { id: 1, price: 95.00, recorded_at: '2026-11-20', currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE', source: 'MANUAL', is_valid: 1 },
            { id: 2, price: 75.00, recorded_at: '2026-11-20', currency: 'USD', unit_label: 'bbl', data_class: 'OFFICIAL_BENCHMARK', source: 'EIA', is_valid: 1 },
          ]];
        }
        return [[]];
      });

      jest.spyOn(fxRateService, 'getLatestRate').mockResolvedValueOnce({
        rate: 86.00,
        baseCurrency: 'USD',
        quoteCurrency: 'INR',
        rateDate: '2026-11-20',
        isStale: false,
        ageDays: 2,
        source: 'FRANKFURTER_ECB',
      });

      const rec = await supplierRecommendationService.getMaterialSupplierRecommendations(10, 7);

      expect(rec).toBeDefined();
      // quoteComparison remains untouched and backward-compatible
      expect(rec.quoteComparison.status).toBe('CROSS_CURRENCY');
      expect(rec.quoteComparison.variancePercent).toBeNull();
      expect(rec.quoteComparison.crossCurrencyNote).toContain('without FX conversion');

      // Additive fxNormalizedComparison resolves parity
      expect(rec.fxNormalizedComparison).toBeDefined();
      expect(rec.fxNormalizedComparison.isConfigured).toBe(true);
      expect(rec.fxNormalizedComparison.status).toBe('ESTIMATED_LANDED_PARITY');
      expect(rec.fxNormalizedComparison.estimatedLandedBenchmark).toBe(84.15);
      expect(rec.fxNormalizedComparison.latestDomesticQuote).toBe(95.00);
      expect(rec.fxNormalizedComparison.variancePercent).toBe(12.89);
    });
  });
});
