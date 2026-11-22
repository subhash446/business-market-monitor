'use strict';

/**
 * Procurement Savings ROI Engine Tests (V3-M5).
 *
 * Verifies:
 *   1. Landed Parity vs Active Quote Savings calculation.
 *   2. Domestic Benchmark vs Active Quote Savings calculation.
 *   3. WhatsApp Negotiation Win calculation (initial quote vs final logged price).
 *   4. Strict Zero Double-Counting (effective savings = max of parity and negotiation win).
 *   5. Zero Rupee Fabrication: Monthly rupees scaled strictly by daily_consumption_rate * 30;
 *      when unconfigured, reports 0 monthly savings with prompt to set Stock Profile.
 *   6. Cross-currency safety (no synthetic conversions without landed parity model).
 */

const savingsRoiService = require('../src/services/savingsRoi.service');
const materialRepository = require('../src/repositories/material.repository');
const whatsappInboundRepository = require('../src/repositories/whatsappInbound.repository');
const supplierRecommendationService = require('../src/services/supplierRecommendation.service');

describe('Savings ROI Service (V3-M5)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('calculateSavingsRoi returns empty summary when business has no tracked materials', async () => {
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([]);

    const res = await savingsRoiService.calculateSavingsRoi(1);
    expect(res.totalMonthlySavingsInr).toBe(0);
    expect(res.annualizedSavingsInr).toBe(0);
    expect(res.materialsTracked).toBe(0);
    expect(res.materialsWithSavings).toBe(0);
    expect(res.topMaterials).toEqual([]);
    expect(res.methodology).toContain('Procurement ROI measures verified savings');
  });

  test('calculates landed parity savings and scales by consumption rate', async () => {
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
      {
        id: 10,
        name: 'PET Resin Bottle Grade',
        unit: 'kg',
        daily_consumption_rate: '150.00', // 150 kg/day = 4500 kg/mo
      },
    ]);

    jest.spyOn(whatsappInboundRepository, 'listRecentByBusinessId').mockResolvedValue([]);

    jest.spyOn(supplierRecommendationService, 'getMaterialSupplierRecommendations').mockResolvedValue({
      quoteComparison: {
        status: 'CROSS_CURRENCY',
        latestQuote: { price: 105.0, currency: 'INR' },
        latestBenchmark: { price: 78.5, currency: 'USD' },
      },
      fxNormalizedComparison: {
        hasLandedCostConfig: true,
        estimatedLandedBenchmark: 115.0, // Landed parity = ₹115/kg
      },
    });

    const res = await savingsRoiService.calculateSavingsRoi(1);

    expect(res.materialsTracked).toBe(1);
    expect(res.materialsWithSavings).toBe(1);
    expect(res.materialsScaledCount).toBe(1);

    const mat = res.topMaterials[0];
    expect(mat.materialName).toBe('PET Resin Bottle Grade');
    expect(mat.referencePrice).toBe(115.0);
    expect(mat.referenceType).toBe('LANDED_PARITY');
    expect(mat.latestQuotePrice).toBe(105.0);
    expect(mat.paritySavingsPerUnit).toBe(10.0);
    expect(mat.negotiationWinPerUnit).toBe(0);
    expect(mat.effectiveUnitSavings).toBe(10.0);
    expect(mat.savingsBasis).toBe('LANDED_PARITY');
    expect(mat.isScaledByConsumption).toBe(true);
    expect(mat.monthlyConsumption).toBe(4500.0);
    // 10 INR/kg * 4500 kg/mo = ₹45,000/mo
    expect(mat.monthlySavingsInr).toBe(45000);
    expect(res.totalMonthlySavingsInr).toBe(45000);
    expect(res.annualizedSavingsInr).toBe(540000);
  });

  test('enforces ZERO DOUBLE-COUNTING: takes MAX of parity savings and WhatsApp negotiation win', async () => {
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
      {
        id: 20,
        name: 'PP Granules',
        unit: 'kg',
        daily_consumption_rate: '200.00', // 6000 kg/mo
      },
    ]);

    // Inbound WhatsApp message with initial quote of ₹125/kg
    jest.spyOn(whatsappInboundRepository, 'listRecentByBusinessId').mockResolvedValue([
      {
        parsed_material_id: 20,
        parsed_price: '125.00',
        parsed_currency: 'INR',
      },
    ]);

    // Domestic benchmark = ₹112/kg, logged quote = ₹105/kg
    // Parity savings = 112 - 105 = 7/kg
    // WhatsApp negotiation win = 125 - 105 = 20/kg
    // Effective savings MUST BE max(7, 20) = 20/kg (NEVER 27/kg)
    jest.spyOn(supplierRecommendationService, 'getMaterialSupplierRecommendations').mockResolvedValue({
      quoteComparison: {
        status: 'SAME_CURRENCY',
        latestQuote: { price: 105.0, currency: 'INR' },
        latestBenchmark: { price: 112.0, currency: 'INR' },
      },
      fxNormalizedComparison: null,
    });

    const res = await savingsRoiService.calculateSavingsRoi(1);
    const mat = res.topMaterials[0];

    expect(mat.paritySavingsPerUnit).toBe(7.0);
    expect(mat.negotiationWinPerUnit).toBe(20.0);
    expect(mat.effectiveUnitSavings).toBe(20.0); // MAX, not 27
    expect(mat.savingsBasis).toBe('NEGOTIATION_WIN');
    // 20 INR/kg * 6000 kg/mo = ₹120,000/mo
    expect(mat.monthlySavingsInr).toBe(120000);
  });

  test('enforces ZERO FABRICATION: reports 0 monthly savings if daily_consumption_rate is missing', async () => {
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
      {
        id: 30,
        name: 'HDPE Granules',
        unit: 'kg',
        daily_consumption_rate: null, // No stock profile configured
      },
    ]);

    jest.spyOn(whatsappInboundRepository, 'listRecentByBusinessId').mockResolvedValue([]);

    jest.spyOn(supplierRecommendationService, 'getMaterialSupplierRecommendations').mockResolvedValue({
      quoteComparison: {
        status: 'SAME_CURRENCY',
        latestQuote: { price: 95.0, currency: 'INR' },
        latestBenchmark: { price: 100.0, currency: 'INR' },
      },
      fxNormalizedComparison: null,
    });

    const res = await savingsRoiService.calculateSavingsRoi(1);
    const mat = res.topMaterials[0];

    expect(mat.effectiveUnitSavings).toBe(5.0);
    expect(mat.isScaledByConsumption).toBe(false);
    expect(mat.monthlySavingsInr).toBe(0); // Zero synthetic rupees
    expect(mat.missingConsumptionPrompt).toContain('Configure daily consumption in Stock Profile');
    expect(res.totalMonthlySavingsInr).toBe(0);
    expect(res.materialsScaledCount).toBe(0);
    expect(res.materialsWithSavings).toBe(1);
  });
});
