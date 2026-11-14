'use strict';

/**
 * Unit & Integration tests for Supplier Recommendations Service (FR-ALERT-06 / T-08).
 *
 * Verifies Tech Lead Refinements:
 *   1. Currency-safe variance: only computed when currencies match; null + crossCurrencyNote when currencies differ.
 *   2. Aligned with V2-01C enums: ACCELERATE_PURCHASE, DELAY_PURCHASE, MAINTAIN_BUFFER, MONITOR_ONLY.
 *   3. Buffer strategies and Indian supply chain diversification guidance.
 */

const supplierRecommendationService = require('../src/services/supplierRecommendation.service');
const materialRepository = require('../src/repositories/material.repository');
const aiInsightQueryService = require('../src/services/aiInsightQuery.service');
const { pool } = require('../src/database/connection');
const { ACTION_RECOMMENDATION } = require('../src/constants/enums');

describe('Supplier Recommendations Service (T-08 / FR-ALERT-06)', () => {
  describe('analyzeQuoteVsBenchmark (Currency Safety)', () => {
    test('computes numeric variancePercent when supplier quote and benchmark share the SAME currency', () => {
      const prices = [
        {
          price: 120.00,
          currency: 'INR',
          data_class: 'SUPPLIER_QUOTE',
          source: 'MANUAL',
          recorded_at: '2026-11-10T10:00:00Z',
        },
        {
          price: 100.00,
          currency: 'INR',
          data_class: 'OFFICIAL_BENCHMARK',
          source: 'GOVERNMENT_DATASET',
          recorded_at: '2026-11-09T10:00:00Z',
        },
      ];

      const result = supplierRecommendationService.analyzeQuoteVsBenchmark(prices);

      expect(result.comparisonStatus).toBe('SAME_CURRENCY');
      expect(result.variancePercent).toBe(20.00); // (120 - 100) / 100 * 100
      expect(result.crossCurrencyNote).toBeNull();
      expect(result.latestQuote.price).toBe(120.00);
      expect(result.latestBenchmark.price).toBe(100.00);
    });

    test('sets variancePercent to null with explanatory note when currencies DIFFER (e.g. INR vs USD)', () => {
      const prices = [
        {
          price: 95.50,
          currency: 'INR',
          data_class: 'SUPPLIER_QUOTE',
          source: 'MANUAL',
          recorded_at: '2026-11-10T10:00:00Z',
        },
        {
          price: 78.20,
          currency: 'USD',
          data_class: 'OFFICIAL_BENCHMARK',
          source: 'THIRD_PARTY_API',
          recorded_at: '2026-11-09T10:00:00Z',
        },
      ];

      const result = supplierRecommendationService.analyzeQuoteVsBenchmark(prices);

      expect(result.comparisonStatus).toBe('CROSS_CURRENCY');
      expect(result.variancePercent).toBeNull();
      expect(result.crossCurrencyNote).toContain('Comparing domestic supplier quote (INR) with market benchmark (USD)');
      expect(result.crossCurrencyNote).toContain('Numerical variance omitted without FX conversion');
      expect(result.latestQuote.currency).toBe('INR');
      expect(result.latestBenchmark.currency).toBe('USD');
    });

    test('handles quote-only case gracefully', () => {
      const prices = [
        {
          price: 150.00,
          currency: 'INR',
          data_class: 'SUPPLIER_QUOTE',
          source: 'MANUAL',
          recorded_at: '2026-11-10T10:00:00Z',
        },
      ];

      const result = supplierRecommendationService.analyzeQuoteVsBenchmark(prices);

      expect(result.comparisonStatus).toBe('QUOTE_ONLY');
      expect(result.latestQuote).toBeDefined();
      expect(result.latestBenchmark).toBeNull();
      expect(result.variancePercent).toBeNull();
      expect(result.crossCurrencyNote).toBeNull();
    });

    test('handles empty prices array gracefully', () => {
      const result = supplierRecommendationService.analyzeQuoteVsBenchmark([]);

      expect(result.comparisonStatus).toBe('NO_DATA');
      expect(result.latestQuote).toBeNull();
      expect(result.latestBenchmark).toBeNull();
      expect(result.variancePercent).toBeNull();
    });
  });

  describe('ACTION_RECOMMENDATION Enum Alignment', () => {
    test('enforces exact ACTION_RECOMMENDATION enums from enums.js and rejects legacy terms', () => {
      const validEnums = Object.values(ACTION_RECOMMENDATION);
      expect(validEnums).toEqual(['ACCELERATE_PURCHASE', 'DELAY_PURCHASE', 'MAINTAIN_BUFFER', 'MONITOR_ONLY']);

      expect(validEnums).not.toContain('BUY_NOW');
      expect(validEnums).not.toContain('HOLD');
      expect(validEnums).not.toContain('INCREASE_BUFFER');

      // Check all BUFFER_STRATEGIES keys match valid enums
      const strategyKeys = Object.keys(supplierRecommendationService.BUFFER_STRATEGIES);
      expect(strategyKeys.sort()).toEqual(validEnums.sort());
    });

    test('resolveActionRecommendation adopts AI insight action if present', () => {
      const aiInsight = {
        action_recommendation: ACTION_RECOMMENDATION.ACCELERATE_PURCHASE,
        recommendation_rationale: 'Upstream crude rally expected to lift polymer quotes.',
        recommendation_horizon: 'IMMEDIATE',
        confidence: 'HIGH',
      };

      const rec = supplierRecommendationService.resolveActionRecommendation(aiInsight, []);

      expect(rec.action).toBe(ACTION_RECOMMENDATION.ACCELERATE_PURCHASE);
      expect(rec.rationale).toBe('Upstream crude rally expected to lift polymer quotes.');
      expect(rec.source).toBe('AI_INSIGHT');
    });

    test('resolveActionRecommendation derives trend-based recommendation when no AI insight exists', () => {
      const upwardPrices = [
        { price: 110.00 },
        { price: 100.00 },
      ];
      const recUp = supplierRecommendationService.resolveActionRecommendation(null, upwardPrices);
      expect(recUp.action).toBe(ACTION_RECOMMENDATION.ACCELERATE_PURCHASE);

      const downwardPrices = [
        { price: 90.00 },
        { price: 100.00 },
      ];
      const recDown = supplierRecommendationService.resolveActionRecommendation(null, downwardPrices);
      expect(recDown.action).toBe(ACTION_RECOMMENDATION.DELAY_PURCHASE);

      const flatPrices = [
        { price: 100.50 },
        { price: 100.00 },
      ];
      const recFlat = supplierRecommendationService.resolveActionRecommendation(null, flatPrices);
      expect(recFlat.action).toBe(ACTION_RECOMMENDATION.MAINTAIN_BUFFER);
    });
  });

  describe('Indian Supply Chain Diversification Guidance', () => {
    test('provides petrochemical guidance for polymer materials (PET Resin, HDPE)', () => {
      const petGuidance = supplierRecommendationService.getDiversificationGuidance('PET Resin Bottle Grade');
      expect(petGuidance.category).toBe('Petrochemicals & Polymers');
      expect(petGuidance.primarySources).toContain('Reliance Industries');
      expect(petGuidance.sourcingStrategy).toContain('Dual-source domestic distribution alongside bonded import parity');

      const hdpeGuidance = supplierRecommendationService.getDiversificationGuidance('HDPE Granules');
      expect(hdpeGuidance.category).toBe('Petrochemicals & Polymers');
    });

    test('provides agro-commodity mandi guidance for grains, sugar, and edible oils', () => {
      const wheatGuidance = supplierRecommendationService.getDiversificationGuidance('Milling Wheat');
      expect(wheatGuidance.category).toBe('Agro-Commodities & Food Ingredients');
      expect(wheatGuidance.primarySources).toContain('APMC mandis');
      expect(wheatGuidance.sourcingStrategy).toContain('Agmarknet modal benchmarks');

      const sugarGuidance = supplierRecommendationService.getDiversificationGuidance('Refined Sugar M-30');
      expect(sugarGuidance.category).toBe('Agro-Commodities & Food Ingredients');
    });

    test('provides general industrial guidance for packaging and other materials', () => {
      const boxGuidance = supplierRecommendationService.getDiversificationGuidance('Corrugated Packaging Box');
      expect(boxGuidance.category).toBe('Industrial Raw Materials & Packaging');
      expect(boxGuidance.checklist).toBeDefined();
      expect(boxGuidance.checklist.length).toBeGreaterThan(0);
    });
  });

  describe('getMaterialSupplierRecommendations & getBusinessSupplierRecommendations', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    test('getMaterialSupplierRecommendations returns complete recommendation payload', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 36,
        business_id: 1,
        name: 'PET Resin',
        unit_abbreviation: 'INR/kg',
        is_tracked: 1,
      });

      jest.spyOn(pool, 'execute').mockImplementation(async (sql) => {
        if (sql.includes('price_points')) {
          return [[
            {
              id: 101,
              price: 112.50,
              currency: 'INR',
              unit_label: 'kg',
              source: 'MANUAL',
              data_class: 'SUPPLIER_QUOTE',
              recorded_at: '2026-11-12T10:00:00Z',
              is_valid: 1,
            },
            {
              id: 100,
              price: 105.00,
              currency: 'INR',
              unit_label: 'kg',
              source: 'GOVERNMENT_DATASET',
              data_class: 'OFFICIAL_BENCHMARK',
              recorded_at: '2026-11-11T10:00:00Z',
              is_valid: 1,
            },
          ]];
        }
        return [[]];
      });

      jest.spyOn(aiInsightQueryService, 'getLatestInsight').mockResolvedValue({
        action_recommendation: ACTION_RECOMMENDATION.ACCELERATE_PURCHASE,
        recommendation_rationale: 'Domestic feedstock price surge detected.',
        recommendation_horizon: 'IMMEDIATE',
        confidence: 'HIGH',
      });

      const res = await supplierRecommendationService.getMaterialSupplierRecommendations(1, 36);

      expect(res.materialId).toBe(36);
      expect(res.materialName).toBe('PET Resin');
      expect(res.actionRecommendation).toBe(ACTION_RECOMMENDATION.ACCELERATE_PURCHASE);
      expect(res.bufferStrategy.targetBufferDays).toBe(45);
      expect(res.bufferStrategy.priority).toBe('HIGH');
      expect(res.quoteComparison.variancePercent).toBe(7.14); // (112.5 - 105) / 105 * 100
      expect(res.quoteComparison.crossCurrencyNote).toBeNull();
      expect(res.diversification.category).toBe('Petrochemicals & Polymers');
    });

    test('getBusinessSupplierRecommendations aggregates across tracked materials', async () => {
      jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
        { id: 36, name: 'PET Resin', unit_abbreviation: 'INR/kg', is_tracked: 1 },
      ]);

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 36,
        business_id: 1,
        name: 'PET Resin',
        unit_abbreviation: 'INR/kg',
        is_tracked: 1,
      });

      jest.spyOn(pool, 'execute').mockResolvedValue([[]]);
      jest.spyOn(aiInsightQueryService, 'getLatestInsight').mockResolvedValue(null);

      const aggregated = await supplierRecommendationService.getBusinessSupplierRecommendations(1);

      expect(aggregated.summary).toBeDefined();
      expect(aggregated.summary.totalTracked).toBe(1);
      expect(aggregated.recommendations.length).toBe(1);
    });
  });
});
