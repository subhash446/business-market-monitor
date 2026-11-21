'use strict';

/**
 * Unit tests for Pure Deterministic Reorder & Stockout Timing Engine (V3 Milestone 1 / Migration 031).
 *
 * Verifies Tech Lead Refinements:
 *   1. Unit-Safe estimatedOrderValue guardrail: no multiplication of kg by USD/bbl; returns valuationNote.
 *   2. Zero-stock handling: currentStockQty === 0 is valid configured stock with 0d cover & CRITICAL risk.
 *   3. max_storage_days ceiling capping.
 *   4. BUY_MINIMUM_BRIDGE operational override when DELAY_PURCHASE meets CRITICAL stockout risk.
 *   5. 14-day stock staleness warning.
 *   6. 100% backward compatibility when inventoryProfile is unconfigured.
 */

const {
  evaluateInventoryDecision,
  resolveValuationPrice,
  normalizeUnit,
  isUnitCompatible,
} = require('../src/services/inventoryDecision.service');
const { ACTION_RECOMMENDATION, STOCKOUT_RISK } = require('../src/constants/enums');

describe('Inventory Decision Engine (V3-M1)', () => {
  const baseNow = new Date('2026-11-21T12:00:00Z');

  describe('1. Unconfigured & Invalid Inventory (Backward Compatibility)', () => {
    test('returns hasInventoryProfile: false when inventoryProfile is null or undefined', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: null,
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.DELAY_PURCHASE,
      });

      expect(res.hasInventoryProfile).toBe(false);
      expect(res.setupPrompt).toContain('Configure stock quantity and daily consumption');
    });

    test('returns hasInventoryProfile: false when currentStockQty or dailyConsumptionRate is null', () => {
      const res1 = evaluateInventoryDecision({
        inventoryProfile: { currentStockQty: null, dailyConsumptionRate: 50 },
      });
      expect(res1.hasInventoryProfile).toBe(false);

      const res2 = evaluateInventoryDecision({
        inventoryProfile: { currentStockQty: 100, dailyConsumptionRate: null },
      });
      expect(res2.hasInventoryProfile).toBe(false);
    });

    test('returns hasInventoryProfile: false when dailyConsumptionRate <= 0 or invalid', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: { currentStockQty: 100, dailyConsumptionRate: 0 },
      });
      expect(res.hasInventoryProfile).toBe(false);
      expect(res.setupPrompt).toContain('Valid daily consumption rate');
    });
  });

  describe('2. Zero-Stock Handling & Days of Cover (Tech Lead Refinement 2)', () => {
    test('treats currentStockQty === 0 as valid configured stock with 0d cover and CRITICAL risk', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 0,
          dailyConsumptionRate: 100,
          supplierLeadTimeDays: 7,
          inventoryUpdatedAt: '2026-11-21T10:00:00Z',
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.MAINTAIN_BUFFER,
        now: baseNow,
      });

      expect(res.hasInventoryProfile).toBe(true);
      expect(res.currentStockQty).toBe(0);
      expect(res.daysOfCover).toBe(0);
      expect(res.stockoutRisk).toBe(STOCKOUT_RISK.CRITICAL);
      expect(res.recommendedOrderQty).toBe(2000); // 20 days * 100 kg/day - 0
    });

    test('calculates accurate fractional daysOfCover rounded to 1 decimal place', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 350,
          dailyConsumptionRate: 30, // 350 / 30 = 11.666... -> 11.7
          supplierLeadTimeDays: 10,
        },
        materialUnit: 'kg',
        now: baseNow,
      });

      expect(res.daysOfCover).toBe(11.7);
      expect(res.stockoutRisk).toBe(STOCKOUT_RISK.LOW); // 11.7 <= max(15, 15)
    });
  });

  describe('3. Stockout Risk Classification & Lead Time Boundaries', () => {
    test('classifies CRITICAL when daysOfCover <= leadTimeDays', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 70,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7, // 7 days cover == 7 days lead time -> run out before arrival!
        },
        materialUnit: 'kg',
        now: baseNow,
      });

      expect(res.stockoutRisk).toBe(STOCKOUT_RISK.CRITICAL);
    });

    test('classifies LOW when leadTime < daysOfCover <= max(leadTime * 1.5, leadTime + 5)', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 120,
          dailyConsumptionRate: 10, // 12 days cover
          supplierLeadTimeDays: 8,  // max(12, 13) -> 13 days
        },
        materialUnit: 'kg',
        now: baseNow,
      });

      expect(res.stockoutRisk).toBe(STOCKOUT_RISK.LOW);
    });

    test('classifies HEALTHY when daysOfCover comfortably exceeds reorder threshold', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 300,
          dailyConsumptionRate: 10, // 30 days cover
          supplierLeadTimeDays: 7,
        },
        materialUnit: 'kg',
        now: baseNow,
      });

      expect(res.stockoutRisk).toBe(STOCKOUT_RISK.HEALTHY);
    });
  });

  describe('4. BUY_MINIMUM_BRIDGE Operational Override (Tech Lead Refinement 4)', () => {
    test('overrides DELAY_PURCHASE to BUY_MINIMUM_BRIDGE when stockoutRisk is CRITICAL', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 30,
          dailyConsumptionRate: 10, // 3 days cover
          supplierLeadTimeDays: 7,  // 7 days lead time -> critical!
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.DELAY_PURCHASE,
        now: baseNow,
      });

      expect(res.isBridgeOverride).toBe(true);
      expect(res.actionRecommendation).toBe('BUY_MINIMUM_BRIDGE');
      expect(res.originalAiRecommendation).toBe(ACTION_RECOMMENDATION.DELAY_PURCHASE);
      // Bridge target is lead time (7) + 7 = 14 days
      expect(res.targetBufferDays).toBe(14);
      // Shortfall = 14 * 10 - 30 = 110 kg
      expect(res.recommendedOrderQty).toBe(110);
      expect(res.decisionSummary).toContain('Critical stockout risk');
      expect(res.decisionSummary).toContain('factory uptime takes precedence');
    });

    test('does NOT override DELAY_PURCHASE when stock is healthy', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 250,
          dailyConsumptionRate: 10, // 25 days cover
          supplierLeadTimeDays: 7,
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.DELAY_PURCHASE,
        now: baseNow,
      });

      expect(res.isBridgeOverride).toBe(false);
      expect(res.actionRecommendation).toBe(ACTION_RECOMMENDATION.DELAY_PURCHASE);
      expect(res.recommendedOrderQty).toBe(0); // 14 * 10 = 140, already have 250
    });

    test('preserves ACCELERATE_PURCHASE target of 45 days when critical', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 50,
          dailyConsumptionRate: 10, // 5 days cover
          supplierLeadTimeDays: 7,
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.ACCELERATE_PURCHASE,
        now: baseNow,
      });

      expect(res.isBridgeOverride).toBe(false);
      expect(res.actionRecommendation).toBe(ACTION_RECOMMENDATION.ACCELERATE_PURCHASE);
      expect(res.targetBufferDays).toBe(45);
      expect(res.recommendedOrderQty).toBe(400); // 45 * 10 - 50 = 400
    });
  });

  describe('5. Max Storage Ceiling Capping', () => {
    test('caps effectiveTargetDays to maxStorageDays when target exceeds warehouse capacity', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 100,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
          maxStorageDays: 30, // Warehouse silo holds at most 30 days
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.ACCELERATE_PURCHASE, // Standard target is 45 days
        now: baseNow,
      });

      expect(res.targetBufferDays).toBe(45);
      expect(res.isStorageCapped).toBe(true);
      expect(res.effectiveTargetDays).toBe(30);
      expect(res.recommendedOrderQty).toBe(200); // 30 * 10 - 100 = 200 (not 45 * 10 - 100 = 350)
    });

    test('does not cap when targetBufferDays is within maxStorageDays', () => {
      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 100,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
          maxStorageDays: 60,
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.ACCELERATE_PURCHASE,
        now: baseNow,
      });

      expect(res.isStorageCapped).toBe(false);
      expect(res.effectiveTargetDays).toBe(45);
    });
  });

  describe('6. Unit-Safe Order Valuation Guardrail (Tech Lead Refinement 1)', () => {
    test('computes estimatedOrderValue when quote exists in matching material unit', () => {
      const prices = [
        {
          price: 95.50,
          currency: 'INR',
          unit_label: 'INR/kg',
          data_class: 'SUPPLIER_QUOTE',
          source: 'MANUAL',
        },
      ];

      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 100,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.MAINTAIN_BUFFER, // 20 days -> 200 target -> 100 shortfall
        prices,
        now: baseNow,
      });

      expect(res.recommendedOrderQty).toBe(100);
      expect(res.valuationPrice).toBe(95.50);
      expect(res.estimatedOrderValue).toBe(9550.00); // 100 * 95.50
      expect(res.currency).toBe('INR');
      expect(res.valuationNote).toBeNull();
    });

    test('refuses to multiply kg by USD/bbl proxy; returns null value and descriptive valuationNote', () => {
      const prices = [
        {
          price: 78.50,
          currency: 'USD',
          unit_label: 'USD/bbl',
          data_class: 'OFFICIAL_BENCHMARK',
          source: 'THIRD_PARTY_API',
        },
      ];

      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 50,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.MAINTAIN_BUFFER,
        prices,
        now: baseNow,
      });

      expect(res.recommendedOrderQty).toBe(150);
      expect(res.valuationPrice).toBeNull();
      expect(res.estimatedOrderValue).toBeNull();
      expect(res.currency).toBeNull();
      expect(res.valuationNote).toContain('Log a supplier quote in kg to estimate order value');
      expect(res.valuationNote).toContain('current benchmark is a USD/bbl proxy');
    });

    test('prefers domestic supplier quote over mismatched benchmark', () => {
      const prices = [
        {
          price: 90.00,
          currency: 'INR',
          unit_label: 'INR/kg',
          data_class: 'SUPPLIER_QUOTE',
          source: 'MANUAL',
        },
        {
          price: 75.00,
          currency: 'USD',
          unit_label: 'USD/bbl',
          data_class: 'OFFICIAL_BENCHMARK',
          source: 'THIRD_PARTY_API',
        },
      ];

      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 50,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
        },
        materialUnit: 'kg',
        actionRecommendation: ACTION_RECOMMENDATION.MAINTAIN_BUFFER,
        prices,
        now: baseNow,
      });

      expect(res.valuationPrice).toBe(90.00);
      expect(res.estimatedOrderValue).toBe(13500.00); // 150 * 90.00
      expect(res.currency).toBe('INR');
      expect(res.valuationNote).toBeNull();
    });

    test('unit helper normalizeUnit handles composite unit labels properly', () => {
      expect(normalizeUnit('INR/kg')).toBe('kg');
      expect(normalizeUnit('USD/bbl')).toBe('bbl');
      expect(normalizeUnit('kg')).toBe('kg');
      expect(normalizeUnit('')).toBe('');
      expect(isUnitCompatible('kg', 'INR/kg')).toBe(true);
      expect(isUnitCompatible('kg', 'USD/bbl')).toBe(false);
    });
  });

  describe('7. 14-Day Stock Staleness Detector', () => {
    test('marks isStockStale: true when inventoryUpdatedAt is 15 days in the past', () => {
      const staleDate = new Date(baseNow.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();

      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 200,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
          inventoryUpdatedAt: staleDate,
        },
        materialUnit: 'kg',
        now: baseNow,
      });

      expect(res.isStockStale).toBe(true);
      expect(res.daysSinceUpdate).toBe(15);
      expect(res.stalenessWarning).toContain('Warehouse stock data was updated 15 days ago');
    });

    test('marks isStockStale: false when inventoryUpdatedAt was updated 3 days ago', () => {
      const freshDate = new Date(baseNow.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

      const res = evaluateInventoryDecision({
        inventoryProfile: {
          currentStockQty: 200,
          dailyConsumptionRate: 10,
          supplierLeadTimeDays: 7,
          inventoryUpdatedAt: freshDate,
        },
        materialUnit: 'kg',
        now: baseNow,
      });

      expect(res.isStockStale).toBe(false);
      expect(res.daysSinceUpdate).toBe(3);
      expect(res.stalenessWarning).toBeNull();
    });
  });
});
