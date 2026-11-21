'use strict';

/**
 * Supplier Sourcing & Procurement Recommendations Service (FR-ALERT-06 / T-08).
 *
 * Responsibilities:
 *   - Compares latest domestic supplier quotes against market proxy benchmarks.
 *   - Enforces strict currency-safe variance calculation:
 *       Variance % is ONLY computed when supplier quote and benchmark share the exact same currency.
 *       When currencies differ (e.g., INR vs USD), variancePercent is set to null with an explanatory note.
 *   - Employs exact ACTION_RECOMMENDATION enums aligned with V2-01C:
 *       ACCELERATE_PURCHASE, DELAY_PURCHASE, MAINTAIN_BUFFER, MONITOR_ONLY.
 *   - Provides grounded Indian market diversification guidance (petrochemicals, agro-commodities, packaging).
 *   - Enforces business-scoped tenant isolation via materialRepository.findByIdForBusiness.
 */

const { pool } = require('../database/connection');
const materialRepository = require('../repositories/material.repository');
const aiInsightQueryService = require('./aiInsightQuery.service');
const inventoryDecisionService = require('./inventoryDecision.service');
const { ACTION_RECOMMENDATION } = require('../constants/enums');
const AppError = require('../utils/AppError');

const BUFFER_STRATEGIES = {
  [ACTION_RECOMMENDATION.ACCELERATE_PURCHASE]: {
    summary: 'Increase safety buffer to 30–45 days; lock in forward contract prices.',
    guidance: 'High upstream price pressure observed. Recommended to increase safety inventory buffer to 30–45 days of production and lock in forward purchase orders with primary suppliers before upcoming revisions.',
    targetBufferDays: 45,
    priority: 'HIGH',
    badgeVariant: 'danger',
  },
  [ACTION_RECOMMENDATION.DELAY_PURCHASE]: {
    summary: 'Maintain lean buffer (10–14 days); procure on spot/JIT basis.',
    guidance: 'Softening market prices detected across upstream benchmarks. Maintain lean inventory buffer (10–14 days) and procure on a spot or just-in-time basis to capture falling rates.',
    targetBufferDays: 14,
    priority: 'MEDIUM',
    badgeVariant: 'warning',
  },
  [ACTION_RECOMMENDATION.MAINTAIN_BUFFER]: {
    summary: 'Maintain standard buffer (15–20 days); monitor contract terms.',
    guidance: 'Moderate price volatility with balanced supply-demand dynamics. Maintain standard safety buffer of 15–20 days and monitor primary supplier contracts against market benchmarks.',
    targetBufferDays: 20,
    priority: 'MEDIUM',
    badgeVariant: 'info',
  },
  [ACTION_RECOMMENDATION.MONITOR_ONLY]: {
    summary: 'Standard replenishment cadence (15 days); conduct routine vendor reviews.',
    guidance: 'Stable price trajectory across domestic and international benchmarks. Standard replenishment cadence recommended with routine quarterly vendor reviews and volume tier renegotiations.',
    targetBufferDays: 15,
    priority: 'LOW',
    badgeVariant: 'neutral',
  },
};

const OPERATIONAL_BUFFER_STRATEGIES = {
  BUY_MINIMUM_BRIDGE: {
    summary: 'Operational Bridge: Procure minimum volume to prevent imminent stockout.',
    guidance: 'Critical stockout risk identified within supplier lead time. Even though market prices are softening, operational continuity requires placing a minimum bridge order before negotiating bulk volumes.',
    targetBufferDays: 14,
    priority: 'CRITICAL',
    badgeVariant: 'danger',
  },
};

/**
 * Returns grounded Indian commodity supply chain diversification guidance.
 */
function getDiversificationGuidance(materialName) {
  const norm = String(materialName || '').toLowerCase();

  if (norm.includes('pet') || norm.includes('resin') || norm.includes('poly') || norm.includes('hdpe') || norm.includes('plastic') || norm.includes('naphtha')) {
    return {
      category: 'Petrochemicals & Polymers',
      primarySources: 'Domestic producers (Reliance Industries, Indian Oil CPCL, Haldia Petrochemicals)',
      sourcingStrategy: 'Dual-source domestic distribution alongside bonded import parity quotes (Middle East / Far East) to mitigate regional refinery maintenance or freight disruptions.',
      checklist: [
        'Compare domestic distributor price lists (ex-refinery) with ICIS/Platts CFR India import parity quotes.',
        'Qualify at least one secondary masterbatch/polymer distributor in northern/western regional clusters.',
        'Verify monthly feedstock indexation clauses (crude/naphtha linkages) in annual supplier contracts.',
      ],
    };
  }

  if (norm.includes('wheat') || norm.includes('flour') || norm.includes('grain') || norm.includes('sugar') || norm.includes('oil') || norm.includes('edible') || norm.includes('soy')) {
    return {
      category: 'Agro-Commodities & Food Ingredients',
      primarySources: 'Regional APMC mandis (Punjab, Haryana, MP for grains; Maharashtra, UP for sugar) & solvent extractors',
      sourcingStrategy: 'Diversify across regional mandi hubs and track Agmarknet modal benchmarks against primary distributors. Maintain seasonal buffer ahead of harvest or MSP announcements.',
      checklist: [
        'Track Agmarknet daily arrivals and modal wholesale prices across major state producing mandis.',
        'Contract directly with farmer producer organizations (FPOs) or regional millers to bypass multi-layer mandi broker margins.',
        'Ensure moisture and quality testing SLAs on every inbound delivery batch.',
      ],
    };
  }

  return {
    category: 'Industrial Raw Materials & Packaging',
    primarySources: 'Regional Tier-1 primary distributors and certified Tier-2 fabricators/converters',
    sourcingStrategy: 'Establish secondary supplier qualifications with regional converters and incorporate multi-source procurement contracts with price-escalation caps.',
    checklist: [
      'Maintain an active 70/30 dual-sourcing allocation between primary and secondary suppliers.',
      'Review contract terms for raw material indexation thresholds (±5% triggers).',
      'Audit vendor lead times and safety stock reserves semi-annually.',
    ],
  };
}

/**
 * Retrieve recent valid price points for a tracked material to analyze quotes vs benchmarks.
 */
async function getRecentPrices(trackedMaterialId) {
  const [rows] = await pool.execute(
    `SELECT id, price, recorded_at, source, currency, unit_label, region, grade, provider_name, source_url, data_class, is_valid
     FROM price_points
     WHERE tracked_material_id = ? AND is_valid = TRUE
     ORDER BY recorded_at DESC, id DESC
     LIMIT 30`,
    [trackedMaterialId]
  );
  return rows;
}

/**
 * Compare supplier quote vs market benchmark with strict currency safety.
 */
function analyzeQuoteVsBenchmark(prices) {
  if (!prices || prices.length === 0) {
    return {
      latestQuote: null,
      latestBenchmark: null,
      variancePercent: null,
      crossCurrencyNote: null,
      comparisonStatus: 'NO_DATA',
    };
  }

  const latestQuote = prices.find(
    (p) => p.data_class === 'SUPPLIER_QUOTE' || p.source === 'MANUAL' || p.source === 'SUPPLIER_INTEGRATION'
  ) || null;

  const latestBenchmark = prices.find(
    (p) => p.data_class === 'OFFICIAL_BENCHMARK' || p.data_class === 'MARKET_INDICATIVE' || (p.source !== 'MANUAL' && p.source !== 'SUPPLIER_INTEGRATION')
  ) || null;

  if (!latestQuote && !latestBenchmark) {
    const latest = prices[0];
    return {
      latestQuote: null,
      latestBenchmark: {
        price: Number(latest.price),
        currency: latest.currency || 'INR',
        unitLabel: latest.unit_label || null,
        recordedAt: latest.recorded_at,
        dataClass: latest.data_class,
        source: latest.source,
      },
      variancePercent: null,
      crossCurrencyNote: null,
      comparisonStatus: 'BENCHMARK_ONLY',
    };
  }

  if (latestQuote && !latestBenchmark) {
    return {
      latestQuote: {
        price: Number(latestQuote.price),
        currency: latestQuote.currency || 'INR',
        unitLabel: latestQuote.unit_label || null,
        recordedAt: latestQuote.recorded_at,
        dataClass: latestQuote.data_class,
        source: latestQuote.source,
      },
      latestBenchmark: null,
      variancePercent: null,
      crossCurrencyNote: null,
      comparisonStatus: 'QUOTE_ONLY',
    };
  }

  if (!latestQuote && latestBenchmark) {
    return {
      latestQuote: null,
      latestBenchmark: {
        price: Number(latestBenchmark.price),
        currency: latestBenchmark.currency || 'INR',
        unitLabel: latestBenchmark.unit_label || null,
        recordedAt: latestBenchmark.recorded_at,
        dataClass: latestBenchmark.data_class,
        source: latestBenchmark.source,
      },
      variancePercent: null,
      crossCurrencyNote: null,
      comparisonStatus: 'BENCHMARK_ONLY',
    };
  }

  const quoteCurr = (latestQuote.currency || 'INR').toUpperCase();
  const benchCurr = (latestBenchmark.benchmark_currency || latestBenchmark.currency || 'INR').toUpperCase();

  const quotePrice = Number(latestQuote.price);
  const benchPrice = Number(latestBenchmark.price);

  let variancePercent = null;
  let crossCurrencyNote = null;
  let comparisonStatus = 'SAME_CURRENCY';

  if (quoteCurr === benchCurr) {
    if (benchPrice > 0) {
      variancePercent = Number((((quotePrice - benchPrice) / benchPrice) * 100).toFixed(2));
    }
  } else {
    comparisonStatus = 'CROSS_CURRENCY';
    crossCurrencyNote = `Comparing domestic supplier quote (${quoteCurr}) with market benchmark (${benchCurr}). Numerical variance omitted without FX conversion.`;
  }

  return {
    latestQuote: {
      price: quotePrice,
      currency: quoteCurr,
      unitLabel: latestQuote.unit_label || null,
      recordedAt: latestQuote.recorded_at,
      dataClass: latestQuote.data_class,
      source: latestQuote.source,
    },
    latestBenchmark: {
      price: benchPrice,
      currency: benchCurr,
      unitLabel: latestBenchmark.unit_label || null,
      recordedAt: latestBenchmark.recorded_at,
      dataClass: latestBenchmark.data_class,
      source: latestBenchmark.source,
    },
    variancePercent,
    crossCurrencyNote,
    comparisonStatus,
  };
}

/**
 * Resolve action recommendation using latest AI insight if available, else derive from price trend.
 */
function resolveActionRecommendation(latestInsight, prices) {
  if (latestInsight && latestInsight.action_recommendation && ACTION_RECOMMENDATION[latestInsight.action_recommendation]) {
    return {
      action: latestInsight.action_recommendation,
      rationale: latestInsight.recommendation_rationale || latestInsight.headline || 'Derived from AI market intelligence analysis.',
      horizon: latestInsight.recommendation_horizon || 'SHORT_TERM',
      source: 'AI_INSIGHT',
      confidence: latestInsight.confidence || 'HIGH',
      disclaimer: latestInsight.disclaimer || null,
    };
  }

  // Fallback heuristic if no AI insight generated yet
  if (!prices || prices.length < 2) {
    return {
      action: ACTION_RECOMMENDATION.MONITOR_ONLY,
      rationale: 'Baseline price monitoring. Add more price history or enable AI insights for automated predictive recommendations.',
      horizon: 'SHORT_TERM',
      source: 'HEURISTIC_DEFAULT',
      confidence: 'MEDIUM',
      disclaimer: null,
    };
  }

  const latest = Number(prices[0].price);
  const previous = Number(prices[Math.min(prices.length - 1, 5)].price);
  const pctChange = previous > 0 ? ((latest - previous) / previous) * 100 : 0;

  if (pctChange >= 4.0) {
    return {
      action: ACTION_RECOMMENDATION.ACCELERATE_PURCHASE,
      rationale: `Recent price upward momentum (+${pctChange.toFixed(1)}%). Lock in inventory buffer before further price increases.`,
      horizon: 'IMMEDIATE',
      source: 'HEURISTIC_TREND',
      confidence: 'MEDIUM',
      disclaimer: null,
    };
  }

  if (pctChange <= -4.0) {
    return {
      action: ACTION_RECOMMENDATION.DELAY_PURCHASE,
      rationale: `Recent price softening trend (${pctChange.toFixed(1)}%). Procure on spot/lean cadence while prices cool.`,
      horizon: 'SHORT_TERM',
      source: 'HEURISTIC_TREND',
      confidence: 'MEDIUM',
      disclaimer: null,
    };
  }

  return {
    action: ACTION_RECOMMENDATION.MAINTAIN_BUFFER,
    rationale: `Prices currently range-bound (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%). Maintain standard replenishment buffer.`,
    horizon: 'SHORT_TERM',
    source: 'HEURISTIC_TREND',
    confidence: 'MEDIUM',
    disclaimer: null,
  };
}

/**
 * Get supplier recommendations for a single tracked material.
 */
async function getMaterialSupplierRecommendations(businessId, materialId) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Tracked material not found');
  }

  const [prices, latestInsight] = await Promise.all([
    getRecentPrices(materialId),
    aiInsightQueryService.getLatestInsight(businessId, materialId).catch(() => null),
  ]);

  const quoteAnalysis = analyzeQuoteVsBenchmark(prices);
  const recommendation = resolveActionRecommendation(latestInsight, prices);

  // V3-M1: Evaluate deterministic inventory reorder decision
  const inventoryProfile = {
    currentStockQty: material.current_stock_qty != null ? Number(material.current_stock_qty) : null,
    dailyConsumptionRate: material.daily_consumption_rate != null ? Number(material.daily_consumption_rate) : null,
    supplierLeadTimeDays: material.supplier_lead_time_days != null ? Number(material.supplier_lead_time_days) : null,
    maxStorageDays: material.max_storage_days != null ? Number(material.max_storage_days) : null,
    inventoryUpdatedAt: material.inventory_updated_at,
  };

  const inventoryDecision = inventoryDecisionService.evaluateInventoryDecision({
    inventoryProfile,
    materialUnit: material.unit_abbreviation,
    actionRecommendation: recommendation.action,
    prices,
  });

  const effectiveAction = (inventoryDecision.hasInventoryProfile && inventoryDecision.isBridgeOverride)
    ? 'BUY_MINIMUM_BRIDGE'
    : recommendation.action;

  const bufferPlan = OPERATIONAL_BUFFER_STRATEGIES[effectiveAction] || BUFFER_STRATEGIES[effectiveAction] || BUFFER_STRATEGIES[ACTION_RECOMMENDATION.MONITOR_ONLY];
  const diversification = getDiversificationGuidance(material.name);

  return {
    materialId: material.id,
    materialName: material.name,
    unit: material.unit_abbreviation,
    isTracked: Boolean(material.is_tracked),
    actionRecommendation: effectiveAction,
    originalAiRecommendation: recommendation.action,
    rationale: (inventoryDecision.hasInventoryProfile && inventoryDecision.isBridgeOverride)
      ? inventoryDecision.decisionSummary
      : recommendation.rationale,
    horizon: recommendation.horizon,
    confidence: recommendation.confidence,
    recommendationSource: (inventoryDecision.hasInventoryProfile && inventoryDecision.isBridgeOverride)
      ? 'OPERATIONAL_OVERRIDE'
      : recommendation.source,
    bufferStrategy: {
      action: effectiveAction,
      summary: bufferPlan.summary,
      detailedGuidance: bufferPlan.guidance,
      targetBufferDays: bufferPlan.targetBufferDays,
      priority: bufferPlan.priority,
      badgeVariant: bufferPlan.badgeVariant,
    },
    quoteComparison: {
      status: quoteAnalysis.comparisonStatus,
      latestQuote: quoteAnalysis.latestQuote,
      latestBenchmark: quoteAnalysis.latestBenchmark,
      variancePercent: quoteAnalysis.variancePercent,
      crossCurrencyNote: quoteAnalysis.crossCurrencyNote,
    },
    inventoryDecision,
    diversification,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Get supplier recommendations aggregated across all tracked materials for a business.
 */
async function getBusinessSupplierRecommendations(businessId) {
  const materials = await materialRepository.listByBusinessId(businessId, true);
  if (!materials || materials.length === 0) {
    return {
      summary: {
        totalTracked: 0,
        accelerateCount: 0,
        delayCount: 0,
        maintainCount: 0,
        monitorCount: 0,
        bridgeCount: 0,
      },
      recommendations: [],
    };
  }

  const recommendations = await Promise.all(
    materials.map((m) => getMaterialSupplierRecommendations(businessId, m.id).catch((err) => ({
      materialId: m.id,
      materialName: m.name,
      error: err.message,
    })))
  );

  const summary = {
    totalTracked: materials.length,
    accelerateCount: 0,
    delayCount: 0,
    maintainCount: 0,
    monitorCount: 0,
    bridgeCount: 0,
  };

  for (const rec of recommendations) {
    if (!rec.actionRecommendation) continue;
    switch (rec.actionRecommendation) {
      case ACTION_RECOMMENDATION.ACCELERATE_PURCHASE:
        summary.accelerateCount += 1;
        break;
      case ACTION_RECOMMENDATION.DELAY_PURCHASE:
        summary.delayCount += 1;
        break;
      case ACTION_RECOMMENDATION.MAINTAIN_BUFFER:
        summary.maintainCount += 1;
        break;
      case ACTION_RECOMMENDATION.MONITOR_ONLY:
        summary.monitorCount += 1;
        break;
      case ACTION_RECOMMENDATION.BUY_MINIMUM_BRIDGE:
        summary.bridgeCount += 1;
        break;
      default:
        break;
    }
  }

  return {
    summary,
    recommendations,
  };
}

module.exports = {
  BUFFER_STRATEGIES,
  getDiversificationGuidance,
  analyzeQuoteVsBenchmark,
  resolveActionRecommendation,
  getMaterialSupplierRecommendations,
  getBusinessSupplierRecommendations,
};
