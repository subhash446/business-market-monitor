'use strict';

/**
 * Pure Deterministic Landed-Cost & FX Parity Normalization Engine (V3-M3).
 *
 * Responsibilities:
 *   1. Normalizes USD global benchmarks into estimated domestic INR landed benchmarks.
 *   2. Enforces Tech Lead Refinement 2:
 *      - USD-Only Currency Guard: Never multiplies an already-INR benchmark by FX rate.
 *      - Benchmark-Only Parity Support: Computes estimatedLandedBenchmark even if no
 *        domestic supplier quote has been logged yet (status: 'ESTIMATED_LANDED_PARITY_ONLY').
 *      - When domestic INR quote exists, computes variancePercent (status: 'ESTIMATED_LANDED_PARITY').
 *   3. Enforces strict numerical safety and audit transparency (never mutates price_points).
 *   4. Generates an auditable formulaBreakdown string.
 */

const STARTER_PRESETS = Object.freeze([
  {
    id: 'DIRECT_SAME_UNIT',
    label: 'Direct Import (USD/kg → INR/kg)',
    description: '1:1 unit match for imported direct materials',
    unitFactor: 1.0,
    dutyFreightPct: 0.0,
    fixedSpreadInr: 0.0,
  },
  {
    id: 'BULK_MT_TO_KG',
    label: 'Bulk Cargo Import (USD/MT → INR/kg)',
    description: '1 MT = 1,000 kg + 7.5% tariff & ₹2.50/kg port handling',
    unitFactor: 0.001,
    dutyFreightPct: 7.5,
    fixedSpreadInr: 2.50,
  },
  {
    id: 'CRUDE_TO_POLYMER',
    label: 'Crude Proxy to Polymer (USD/bbl → INR/kg)',
    description: '0.00735 bbl/kg crude proxy + 10% duty + ₹32.00/kg cracking spread',
    unitFactor: 0.00735,
    dutyFreightPct: 10.0,
    fixedSpreadInr: 32.00,
  },
]);

/**
 * Evaluates landed-cost parity for a tracked material against a benchmark and domestic quote.
 *
 * @param {Object} params
 * @param {Object|null} params.landedCostConfig
 * @param {number|null} [params.landedCostConfig.unitFactor]
 * @param {number|null} [params.landedCostConfig.dutyFreightPct]
 * @param {number|null} [params.landedCostConfig.fixedSpreadInr]
 * @param {string|Date|null} [params.landedCostConfig.updatedAt]
 * @param {Object|null} params.latestBenchmark
 * @param {number} params.latestBenchmark.price
 * @param {string} params.latestBenchmark.currency
 * @param {string} [params.latestBenchmark.unitLabel]
 * @param {string|Date} [params.latestBenchmark.recordedAt]
 * @param {Object|null} [params.latestQuote]
 * @param {number} [params.latestQuote.price]
 * @param {string} [params.latestQuote.currency]
 * @param {string} [params.latestQuote.unitLabel]
 * @param {Object|null} params.fxRate
 * @param {number} params.fxRate.rate
 * @param {string} params.fxRate.baseCurrency
 * @param {string} params.fxRate.quoteCurrency
 * @param {string} params.fxRate.rateDate
 * @param {boolean} [params.fxRate.isStale]
 * @param {number} [params.fxRate.ageDays]
 * @param {string} [params.materialUnit='kg']
 * @returns {Object}
 */
function evaluateLandedCostParity({
  landedCostConfig,
  latestBenchmark,
  latestQuote,
  fxRate,
  materialUnit = 'kg',
}) {
  const normUnit = materialUnit || 'unit';

  // 1. Check if landed-cost parameters are configured
  if (
    !landedCostConfig ||
    landedCostConfig.unitFactor == null ||
    isNaN(Number(landedCostConfig.unitFactor)) ||
    Number(landedCostConfig.unitFactor) <= 0
  ) {
    return {
      isConfigured: false,
      status: 'NOT_CONFIGURED',
      reason: 'Landed-cost normalization parameters have not been configured for this material.',
      targetUnit: normUnit,
      currency: 'INR',
      estimatedLandedBenchmark: null,
      latestDomesticQuote: latestQuote ? Number(latestQuote.price) : null,
      variancePercent: null,
      formulaBreakdown: null,
      fxRate: fxRate || null,
      landedCostConfig: null,
    };
  }

  const unitFactor = Number(landedCostConfig.unitFactor);
  const dutyFreightPct = Number(landedCostConfig.dutyFreightPct || 0);
  const fixedSpreadInr = Number(landedCostConfig.fixedSpreadInr || 0);
  const updatedAt = landedCostConfig.updatedAt || null;

  const configSummary = {
    unitFactor,
    dutyFreightPct,
    fixedSpreadInr,
    updatedAt,
  };

  // 2. Check benchmark availability
  if (!latestBenchmark || Number(latestBenchmark.price) <= 0) {
    return {
      isConfigured: true,
      status: 'MISSING_BENCHMARK',
      reason: 'No valid benchmark price available to normalize.',
      targetUnit: normUnit,
      currency: 'INR',
      estimatedLandedBenchmark: null,
      latestDomesticQuote: latestQuote ? Number(latestQuote.price) : null,
      variancePercent: null,
      formulaBreakdown: null,
      fxRate: fxRate || null,
      landedCostConfig: configSummary,
    };
  }

  // 3. USD-Only Currency Guard (Tech Lead Refinement 2)
  const benchCurrency = String(latestBenchmark.currency || '').trim().toUpperCase();
  if (benchCurrency !== 'USD') {
    return {
      isConfigured: true,
      status: 'BENCHMARK_NOT_USD',
      reason: `Benchmark currency is ${benchCurrency}; FX normalization applies only to USD benchmarks.`,
      targetUnit: normUnit,
      currency: 'INR',
      estimatedLandedBenchmark: null,
      latestDomesticQuote: latestQuote ? Number(latestQuote.price) : null,
      variancePercent: null,
      formulaBreakdown: null,
      fxRate: fxRate || null,
      landedCostConfig: configSummary,
    };
  }

  // 4. Check FX rate availability
  if (!fxRate || Number(fxRate.rate) <= 0) {
    return {
      isConfigured: true,
      status: 'MISSING_FX_RATE',
      reason: 'Live USD/INR exchange rate is currently unavailable.',
      targetUnit: normUnit,
      currency: 'INR',
      estimatedLandedBenchmark: null,
      latestDomesticQuote: latestQuote ? Number(latestQuote.price) : null,
      variancePercent: null,
      formulaBreakdown: null,
      fxRate: null,
      landedCostConfig: configSummary,
    };
  }

  const rawBenchPrice = Number(latestBenchmark.price);
  const numFxRate = Number(fxRate.rate);

  // 5. Deterministic Landed-Cost Calculation
  // Base INR = BenchmarkPrice (USD) * FXRate * unitFactor
  const baseInr = rawBenchPrice * numFxRate * unitFactor;
  // Estimated Landed = Base INR * (1 + dutyFreightPct / 100) + fixedSpreadInr
  const withDuty = baseInr * (1 + dutyFreightPct / 100);
  const estimatedLandedBenchmark = Number((withDuty + fixedSpreadInr).toFixed(2));

  // Build transparent formula breakdown string
  const benchUnitStr = latestBenchmark.unitLabel ? ` ${latestBenchmark.unitLabel}` : '';
  const formulaBreakdown = `(${rawBenchPrice.toFixed(2)} USD${benchUnitStr} * ${numFxRate.toFixed(2)} * ${unitFactor}) * (1 + ${dutyFreightPct}%) + ${fixedSpreadInr.toFixed(2)} INR = ${estimatedLandedBenchmark.toFixed(2)} INR/${normUnit}`;

  // 6. Domestic Supplier Quote Comparison (Benchmark-Only vs Live Parity)
  const hasDomesticQuote = latestQuote && Number(latestQuote.price) > 0 && String(latestQuote.currency || 'INR').toUpperCase() === 'INR';

  if (!hasDomesticQuote) {
    return {
      isConfigured: true,
      status: 'ESTIMATED_LANDED_PARITY_ONLY',
      targetUnit: normUnit,
      currency: 'INR',
      estimatedLandedBenchmark,
      latestDomesticQuote: null,
      variancePercent: null,
      formulaBreakdown,
      baseBenchmark: {
        price: rawBenchPrice,
        currency: benchCurrency,
        unitLabel: latestBenchmark.unitLabel || null,
        recordedAt: latestBenchmark.recordedAt || null,
      },
      fxRate: {
        rate: numFxRate,
        base: fxRate.baseCurrency || 'USD',
        quote: fxRate.quoteCurrency || 'INR',
        rateDate: fxRate.rateDate || null,
        source: fxRate.source || 'FRANKFURTER_ECB',
        isStale: Boolean(fxRate.isStale),
        ageDays: fxRate.ageDays ?? 0,
      },
      landedCostConfig: configSummary,
    };
  }

  const quotePrice = Number(latestQuote.price);
  const variancePercent = estimatedLandedBenchmark > 0
    ? Number((((quotePrice - estimatedLandedBenchmark) / estimatedLandedBenchmark) * 100).toFixed(2))
    : null;

  return {
    isConfigured: true,
    status: 'ESTIMATED_LANDED_PARITY',
    targetUnit: normUnit,
    currency: 'INR',
    estimatedLandedBenchmark,
    latestDomesticQuote: quotePrice,
    variancePercent,
    formulaBreakdown,
    baseBenchmark: {
      price: rawBenchPrice,
      currency: benchCurrency,
      unitLabel: latestBenchmark.unitLabel || null,
      recordedAt: latestBenchmark.recordedAt || null,
    },
    fxRate: {
      rate: numFxRate,
      base: fxRate.baseCurrency || 'USD',
      quote: fxRate.quoteCurrency || 'INR',
      rateDate: fxRate.rateDate || null,
      source: fxRate.source || 'FRANKFURTER_ECB',
      isStale: Boolean(fxRate.isStale),
      ageDays: fxRate.ageDays ?? 0,
    },
    landedCostConfig: configSummary,
  };
}

module.exports = {
  STARTER_PRESETS,
  evaluateLandedCostParity,
};
