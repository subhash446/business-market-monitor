'use strict';

/**
 * Pure Deterministic Inventory Reorder & Stockout Timing Engine (V3 Milestone 1 / Migration 031).
 *
 * Responsibilities:
 *   1. Computes daysOfCover and classifies stockoutRisk (CRITICAL, LOW, HEALTHY).
 *   2. Handles zero stock (currentStockQty === 0) strictly as configured critical stock (!= null checks).
 *   3. Enforces BUY_MINIMUM_BRIDGE operational override: factory uptime trumps market timing
 *      when stockout is imminent (CRITICAL) during a DELAY_PURCHASE market signal.
 *   4. Enforces max_storage_days ceiling capping on target inventory buffers.
 *   5. Calculates recommendedOrderQty and unit-safe estimatedOrderValue:
 *      Never multiplies by mismatched-unit proxies (e.g. kg * USD/bbl).
 *   6. Detects 14-day stock staleness (isStockStale) with actionable operational advisory.
 *   7. Retains 100% backward compatibility when inventory profile is unconfigured (returns hasInventoryProfile: false).
 */

const { ACTION_RECOMMENDATION, REORDER_ACTION, STOCKOUT_RISK } = require('../constants/enums');
const BUY_MINIMUM_BRIDGE = (REORDER_ACTION && REORDER_ACTION.BUY_MINIMUM_BRIDGE) || 'BUY_MINIMUM_BRIDGE';

const TARGET_BUFFER_DAYS = {
  [ACTION_RECOMMENDATION.ACCELERATE_PURCHASE]: 45,
  [ACTION_RECOMMENDATION.MAINTAIN_BUFFER]: 20,
  [ACTION_RECOMMENDATION.MONITOR_ONLY]: 15,
  [ACTION_RECOMMENDATION.DELAY_PURCHASE]: 14,
};

/**
 * Normalizes a unit string (e.g. 'INR/kg' -> 'kg', 'USD/bbl' -> 'bbl', 'kg' -> 'kg').
 */
function normalizeUnit(unitStr) {
  if (!unitStr || typeof unitStr !== 'string') return '';
  const trimmed = unitStr.trim().toLowerCase();
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    return parts[parts.length - 1].trim();
  }
  return trimmed;
}

/**
 * Checks whether price unit matches material unit.
 */
function isUnitCompatible(materialUnit, priceUnitLabel) {
  const normMat = normalizeUnit(materialUnit);
  const normPrice = normalizeUnit(priceUnitLabel);
  if (!normMat || !normPrice) return false;
  return normMat === normPrice;
}

/**
 * Resolves a valuation price point safely adhering to Tech Lead Refinement 1:
 * - Prefer latest SUPPLIER_QUOTE / MANUAL price in the material's native unit.
 * - Otherwise use benchmark price ONLY if its unit matches the material's unit.
 * - Otherwise return null with clear valuationNote.
 */
function resolveValuationPrice(prices, materialUnit) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return {
      price: null,
      currency: null,
      valuationNote: materialUnit
        ? `Log a supplier quote in ${materialUnit} to estimate order value.`
        : 'Log a supplier quote to estimate order value.',
    };
  }

  // 1. Look for domestic supplier quotes / manual quotes
  const quote = prices.find(
    (p) => p.data_class === 'SUPPLIER_QUOTE' || p.source === 'MANUAL' || p.source === 'SUPPLIER_INTEGRATION'
  );

  if (quote && Number(quote.price) > 0) {
    const quoteUnit = quote.unit_label || materialUnit;
    if (!materialUnit || isUnitCompatible(materialUnit, quoteUnit)) {
      return {
        price: Number(quote.price),
        currency: (quote.currency || 'INR').toUpperCase(),
        valuationNote: null,
        isFromQuote: true,
      };
    }
  }

  // 2. Look for official benchmark or market indicative prices
  const benchmark = prices.find(
    (p) => p.data_class === 'OFFICIAL_BENCHMARK' || p.data_class === 'MARKET_INDICATIVE' || (p.source !== 'MANUAL' && p.source !== 'SUPPLIER_INTEGRATION')
  );

  if (benchmark && Number(benchmark.price) > 0) {
    const benchUnit = benchmark.unit_label || '';
    if (materialUnit && isUnitCompatible(materialUnit, benchUnit)) {
      return {
        price: Number(benchmark.price),
        currency: (benchmark.currency || 'INR').toUpperCase(),
        valuationNote: null,
        isFromQuote: false,
      };
    }

    // Unit mismatch detected (e.g. material is kg, benchmark is USD/bbl)
    const proxyDesc = benchUnit
      ? (benchUnit.includes('/') ? benchUnit : `${benchmark.currency || 'USD'}/${benchUnit}`)
      : `${benchmark.currency || 'USD'}/proxy unit`;
    return {
      price: null,
      currency: null,
      valuationNote: `Log a supplier quote in ${materialUnit || 'native unit'} to estimate order value; current benchmark is a ${proxyDesc} proxy.`,
    };
  }

  return {
    price: null,
    currency: null,
    valuationNote: materialUnit
      ? `Log a supplier quote in ${materialUnit} to estimate order value.`
      : 'Log a supplier quote to estimate order value.',
  };
}

/**
 * Pure evaluation function for inventory reorder decisions.
 *
 * @param {Object} params
 * @param {Object|null} params.inventoryProfile - tracked material inventory columns
 * @param {string} [params.materialUnit] - unit of measurement (e.g. 'kg', 'MT')
 * @param {string} [params.actionRecommendation] - AI or heuristic recommendation
 * @param {Array} [params.prices] - recent price points
 * @param {Date} [params.now] - current timestamp (injectable for testing)
 * @returns {Object} Deterministic decision payload
 */
function evaluateInventoryDecision({
  inventoryProfile,
  materialUnit = '',
  actionRecommendation = ACTION_RECOMMENDATION.MONITOR_ONLY,
  prices = [],
  now = new Date(),
} = {}) {
  // Explicit != null check for zero-stock handling (Tech Lead Refinement 2)
  const hasConfiguredStock = inventoryProfile != null &&
    inventoryProfile.currentStockQty != null &&
    inventoryProfile.dailyConsumptionRate != null;

  if (!hasConfiguredStock) {
    return {
      hasInventoryProfile: false,
      setupPrompt: 'Configure stock quantity and daily consumption in Materials to enable automated order sizing and stockout protection.',
    };
  }

  const currentStockQty = Number(inventoryProfile.currentStockQty);
  const dailyConsumptionRate = Number(inventoryProfile.dailyConsumptionRate);

  if (dailyConsumptionRate <= 0 || isNaN(dailyConsumptionRate) || isNaN(currentStockQty) || currentStockQty < 0) {
    return {
      hasInventoryProfile: false,
      setupPrompt: 'Valid daily consumption rate (> 0) and non-negative stock quantity required to evaluate reorder decision.',
    };
  }

  // 1. Days of Cover (safe with currentStockQty === 0)
  const daysOfCover = Number((currentStockQty / dailyConsumptionRate).toFixed(1));

  // 2. Lead Time (defaults to 7 days if unconfigured or null)
  const leadTimeDays = (inventoryProfile.supplierLeadTimeDays != null && Number(inventoryProfile.supplierLeadTimeDays) >= 0)
    ? Number(inventoryProfile.supplierLeadTimeDays)
    : 7;

  // 3. Stockout Risk Classification
  let stockoutRisk = STOCKOUT_RISK.HEALTHY;
  if (daysOfCover <= leadTimeDays) {
    stockoutRisk = STOCKOUT_RISK.CRITICAL;
  } else if (daysOfCover <= Math.max(leadTimeDays * 1.5, leadTimeDays + 5)) {
    stockoutRisk = STOCKOUT_RISK.LOW;
  }

  // 4. Operational Override: BUY_MINIMUM_BRIDGE
  let isBridgeOverride = false;
  let effectiveAction = actionRecommendation;
  let targetBufferDays = TARGET_BUFFER_DAYS[actionRecommendation] || 15;

  if (actionRecommendation === ACTION_RECOMMENDATION.DELAY_PURCHASE && stockoutRisk === STOCKOUT_RISK.CRITICAL) {
    isBridgeOverride = true;
    effectiveAction = BUY_MINIMUM_BRIDGE;
    // Bridge target: enough for lead time plus a lean 7-day safety buffer
    targetBufferDays = leadTimeDays + 7;
  }

  // 5. Max Storage Capping
  let isStorageCapped = false;
  let effectiveTargetDays = targetBufferDays;
  const maxStorageDays = (inventoryProfile.maxStorageDays != null && Number(inventoryProfile.maxStorageDays) > 0)
    ? Number(inventoryProfile.maxStorageDays)
    : null;

  if (maxStorageDays != null && targetBufferDays > maxStorageDays) {
    isStorageCapped = true;
    effectiveTargetDays = maxStorageDays;
  }

  // 6. Recommended Order Quantity
  const targetStockQty = effectiveTargetDays * dailyConsumptionRate;
  const shortfall = targetStockQty - currentStockQty;
  const recommendedOrderQty = shortfall > 0 ? Number(shortfall.toFixed(2)) : 0;

  // 7. Unit-Safe Estimated Order Value (Tech Lead Refinement 1)
  const valuation = resolveValuationPrice(prices, materialUnit);
  let estimatedOrderValue = null;
  let currency = null;

  if (valuation.price != null && recommendedOrderQty > 0) {
    estimatedOrderValue = Number((recommendedOrderQty * valuation.price).toFixed(2));
    currency = valuation.currency;
  }

  // 8. 14-Day Stock Staleness Warning
  let isStockStale = false;
  let stalenessWarning = null;
  let daysSinceUpdate = null;

  if (inventoryProfile.inventoryUpdatedAt) {
    const updatedMs = new Date(inventoryProfile.inventoryUpdatedAt).getTime();
    const currentMs = (now instanceof Date ? now : new Date(now)).getTime();
    if (!isNaN(updatedMs) && currentMs >= updatedMs) {
      daysSinceUpdate = Math.floor((currentMs - updatedMs) / (1000 * 60 * 60 * 24));
      if (daysSinceUpdate >= 14) {
        isStockStale = true;
        stalenessWarning = `Warehouse stock data was updated ${daysSinceUpdate} days ago. Verify physical inventory before placing purchase orders.`;
      }
    }
  }

  // 9. Decision Rationale & Summary
  let decisionSummary;
  if (isBridgeOverride) {
    decisionSummary = `Critical stockout risk (${daysOfCover}d cover <= ${leadTimeDays}d lead time). Market prices are softening, but factory uptime takes precedence. Minimum bridge order of ${recommendedOrderQty.toLocaleString()} ${materialUnit || 'units'} required to maintain plant operations while deferring bulk replenishment.`;
  } else if (stockoutRisk === STOCKOUT_RISK.CRITICAL) {
    decisionSummary = `Critical stockout risk (${daysOfCover}d cover <= ${leadTimeDays}d lead time). Expedited order of ${recommendedOrderQty.toLocaleString()} ${materialUnit || 'units'} required immediately.`;
  } else if (stockoutRisk === STOCKOUT_RISK.LOW) {
    decisionSummary = `Low inventory cover (${daysOfCover}d). Replenishment order of ${recommendedOrderQty.toLocaleString()} ${materialUnit || 'units'} recommended within standard procurement window.`;
  } else if (recommendedOrderQty > 0) {
    decisionSummary = `Inventory healthy (${daysOfCover}d cover). Routine replenishment order of ${recommendedOrderQty.toLocaleString()} ${materialUnit || 'units'} maintains target buffer of ${effectiveTargetDays} days.`;
  } else {
    decisionSummary = `Inventory healthy (${daysOfCover}d cover). Stock exceeds target buffer of ${effectiveTargetDays} days (${targetStockQty.toLocaleString()} ${materialUnit || 'units'}). Zero procurement required.`;
  }

  return {
    hasInventoryProfile: true,
    currentStockQty,
    dailyConsumptionRate,
    daysOfCover,
    supplierLeadTimeDays: leadTimeDays,
    maxStorageDays,
    stockoutRisk,
    actionRecommendation: effectiveAction,
    originalAiRecommendation: actionRecommendation,
    isBridgeOverride,
    isStorageCapped,
    targetBufferDays,
    effectiveTargetDays,
    recommendedOrderQty,
    unit: materialUnit || null,
    estimatedOrderValue,
    currency,
    valuationPrice: valuation.price,
    valuationNote: valuation.valuationNote,
    isStockStale,
    daysSinceUpdate,
    stalenessWarning,
    decisionSummary,
  };
}

module.exports = {
  evaluateInventoryDecision,
  resolveValuationPrice,
  normalizeUnit,
  isUnitCompatible,
  TARGET_BUFFER_DAYS,
};
