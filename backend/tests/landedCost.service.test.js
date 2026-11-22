'use strict';

/**
 * Pure Deterministic Unit Tests for Landed-Cost & FX Parity Engine (V3-M3).
 */

const { evaluateLandedCostParity, STARTER_PRESETS } = require('../src/services/landedCost.service');

describe('landedCost.service.js — Pure Deterministic Landed-Cost Engine', () => {
  const mockFxRate = {
    rate: 86.00,
    baseCurrency: 'USD',
    quoteCurrency: 'INR',
    rateDate: '2026-11-20',
    isStale: false,
    ageDays: 2,
    source: 'FRANKFURTER_ECB',
  };

  test('STARTER_PRESETS contains 3 valid, distinct presets', () => {
    expect(STARTER_PRESETS).toHaveLength(3);
    const ids = STARTER_PRESETS.map((p) => p.id);
    expect(ids).toContain('DIRECT_SAME_UNIT');
    expect(ids).toContain('BULK_MT_TO_KG');
    expect(ids).toContain('CRUDE_TO_POLYMER');

    STARTER_PRESETS.forEach((preset) => {
      expect(preset.unitFactor).toBeGreaterThan(0);
      expect(preset.dutyFreightPct).toBeGreaterThanOrEqual(0);
      expect(preset.fixedSpreadInr).toBeGreaterThanOrEqual(0);
    });
  });

  test('returns isConfigured: false when landedCostConfig is missing or null', () => {
    const res = evaluateLandedCostParity({
      landedCostConfig: null,
      latestBenchmark: { price: 75.00, currency: 'USD' },
      latestQuote: { price: 90.00, currency: 'INR' },
      fxRate: mockFxRate,
      materialUnit: 'kg',
    });

    expect(res.isConfigured).toBe(false);
    expect(res.status).toBe('NOT_CONFIGURED');
    expect(res.estimatedLandedBenchmark).toBeNull();
    expect(res.variancePercent).toBeNull();
  });

  test('Direct USD/kg → INR/kg conversion (1:1 unit match with duty & spread)', () => {
    // Benchmark: 1.20 USD/kg, FX: 86.00, factor: 1.0, duty: 5%, spread: 2.00 INR
    // Base INR = 1.20 * 86.00 * 1.0 = 103.20
    // With Duty = 103.20 * 1.05 = 108.36
    // Landed = 108.36 + 2.00 = 110.36 INR/kg
    // Quote: 105.00 INR/kg
    // Variance = (105.00 - 110.36) / 110.36 * 100 = -4.86%
    const res = evaluateLandedCostParity({
      landedCostConfig: {
        unitFactor: 1.0,
        dutyFreightPct: 5.0,
        fixedSpreadInr: 2.00,
      },
      latestBenchmark: { price: 1.20, currency: 'USD', unitLabel: 'kg' },
      latestQuote: { price: 105.00, currency: 'INR', unitLabel: 'kg' },
      fxRate: mockFxRate,
      materialUnit: 'kg',
    });

    expect(res.isConfigured).toBe(true);
    expect(res.status).toBe('ESTIMATED_LANDED_PARITY');
    expect(res.estimatedLandedBenchmark).toBe(110.36);
    expect(res.variancePercent).toBe(-4.86);
    expect(res.formulaBreakdown).toContain('110.36 INR/kg');
  });

  test('Bulk Cargo USD/MT → INR/kg conversion', () => {
    // Benchmark: 1000.00 USD/MT, FX: 86.00, factor: 0.001 (MT->kg), duty: 7.5%, spread: 2.50 INR
    // Base INR = 1000 * 86 * 0.001 = 86.00
    // With Duty = 86.00 * 1.075 = 92.45
    // Landed = 92.45 + 2.50 = 94.95 INR/kg
    const res = evaluateLandedCostParity({
      landedCostConfig: {
        unitFactor: 0.001,
        dutyFreightPct: 7.5,
        fixedSpreadInr: 2.50,
      },
      latestBenchmark: { price: 1000.00, currency: 'USD', unitLabel: 'MT' },
      latestQuote: { price: 98.00, currency: 'INR', unitLabel: 'kg' },
      fxRate: mockFxRate,
      materialUnit: 'kg',
    });

    expect(res.estimatedLandedBenchmark).toBe(94.95);
    expect(res.variancePercent).toBe(3.21); // (98 - 94.95)/94.95 * 100
  });

  test('Crude Proxy USD/bbl → Polymer Resin INR/kg conversion', () => {
    // Crude: 75.00 USD/bbl, FX: 86.00, factor: 0.00735 bbl/kg, duty: 10%, spread: 32.00 INR
    // Base INR = 75 * 86 * 0.00735 = 47.4075
    // With Duty = 47.4075 * 1.10 = 52.14825
    // Landed = 52.14825 + 32.00 = 84.15 INR/kg
    const res = evaluateLandedCostParity({
      landedCostConfig: {
        unitFactor: 0.00735,
        dutyFreightPct: 10.0,
        fixedSpreadInr: 32.00,
      },
      latestBenchmark: { price: 75.00, currency: 'USD', unitLabel: 'bbl' },
      latestQuote: { price: 90.00, currency: 'INR', unitLabel: 'kg' },
      fxRate: mockFxRate,
      materialUnit: 'kg',
    });

    expect(res.estimatedLandedBenchmark).toBe(84.15);
    expect(res.variancePercent).toBe(6.95);
  });

  describe('Tech Lead Refinement 2 Enforcements', () => {
    test('USD-Only Currency Guard: rejects non-USD benchmark without applying FX multiplier', () => {
      const res = evaluateLandedCostParity({
        landedCostConfig: { unitFactor: 1.0 },
        latestBenchmark: { price: 2500.00, currency: 'INR', unitLabel: 'quintal' }, // e.g. Mandi wheat
        latestQuote: { price: 2600.00, currency: 'INR' },
        fxRate: mockFxRate,
        materialUnit: 'kg',
      });

      expect(res.isConfigured).toBe(true);
      expect(res.status).toBe('BENCHMARK_NOT_USD');
      expect(res.estimatedLandedBenchmark).toBeNull();
      expect(res.reason).toContain('Benchmark currency is INR');
    });

    test('Benchmark-Only Parity Support: computes landed benchmark when no domestic quote is logged yet', () => {
      const res = evaluateLandedCostParity({
        landedCostConfig: {
          unitFactor: 0.00735,
          dutyFreightPct: 10.0,
          fixedSpreadInr: 32.00,
        },
        latestBenchmark: { price: 75.00, currency: 'USD', unitLabel: 'bbl' },
        latestQuote: null, // No supplier quote logged yet
        fxRate: mockFxRate,
        materialUnit: 'kg',
      });

      expect(res.isConfigured).toBe(true);
      expect(res.status).toBe('ESTIMATED_LANDED_PARITY_ONLY');
      expect(res.estimatedLandedBenchmark).toBe(84.15);
      expect(res.latestDomesticQuote).toBeNull();
      expect(res.variancePercent).toBeNull();
      expect(res.formulaBreakdown).toContain('84.15 INR/kg');
    });
  });
});
