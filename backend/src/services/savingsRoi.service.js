'use strict';

/**
 * Procurement Savings ROI Engine (V3-M5).
 *
 * Responsibilities:
 *   1. Quantifies procurement savings comparing active supplier quotes against:
 *      - Landed Import Parity (benchmark + FX + duty/freight/spread), or
 *      - Domestic Market Benchmarks, or
 *      - WhatsApp Copilot Negotiation Wins (initial quote vs final logged price).
 *   2. Enforces ZERO DOUBLE-COUNTING:
 *      effectiveUnitSavings = Math.max(paritySavingsPerUnit, negotiationWinPerUnit) (never summed).
 *   3. Enforces ZERO FABRICATION / CONSUMPTION SCALING:
 *      Only multiplies unit savings into monthly rupees when daily_consumption_rate > 0.
 *      When consumption rate is missing, reports monthlySavingsInr = 0 and prompts user to set Stock Profile.
 */

const materialRepository = require('../repositories/material.repository');
const whatsappInboundRepository = require('../repositories/whatsappInbound.repository');
const supplierRecommendationService = require('./supplierRecommendation.service');

/**
 * Calculate procurement savings ROI across all tracked materials for a business.
 * @param {number} businessId
 * @returns {Promise<Object>} Savings ROI summary and per-material breakdowns.
 */
async function calculateSavingsRoi(businessId) {
  if (!businessId) {
    return createEmptySummary(0);
  }

  const materials = await materialRepository.listByBusinessId(businessId, true);
  if (!materials || materials.length === 0) {
    return createEmptySummary(0);
  }

  // Retrieve recent WhatsApp quotes for this business
  let recentInbound = [];
  try {
    recentInbound = await whatsappInboundRepository.listRecentByBusinessId(businessId, 50);
  } catch (_) {
    recentInbound = [];
  }

  const materialBreakdowns = await Promise.all(
    materials.map(async (material) => {
      try {
        const rec = await supplierRecommendationService.getMaterialSupplierRecommendations(
          businessId,
          material.id
        );

        const latestQuote = rec.quoteComparison?.latestQuote;
        const latestBenchmark = rec.quoteComparison?.latestBenchmark;
        const fxComparison = rec.fxNormalizedComparison;

        const latestQuotePrice = (latestQuote && Number(latestQuote.price) > 0)
          ? Number(latestQuote.price)
          : null;

        // 1. Determine reference price (prefer Landed Parity over bare domestic benchmark)
        let referencePrice = null;
        let referenceType = null;

        if (fxComparison && fxComparison.hasLandedCostConfig && fxComparison.estimatedLandedBenchmark > 0) {
          referencePrice = Number(fxComparison.estimatedLandedBenchmark);
          referenceType = 'LANDED_PARITY';
        } else if (
          latestBenchmark &&
          Number(latestBenchmark.price) > 0 &&
          (rec.quoteComparison.status === 'SAME_CURRENCY' || (latestBenchmark.currency || 'INR').toUpperCase() === 'INR')
        ) {
          referencePrice = Number(latestBenchmark.price);
          referenceType = 'DOMESTIC_BENCHMARK';
        }

        // 2. Parity savings per unit
        let paritySavingsPerUnit = 0;
        if (referencePrice != null && latestQuotePrice != null && referencePrice > latestQuotePrice) {
          paritySavingsPerUnit = Number((referencePrice - latestQuotePrice).toFixed(2));
        }

        // 3. WhatsApp negotiation win per unit
        const matchingInbound = (recentInbound || []).find(
          (msg) => Number(msg.parsed_material_id) === Number(material.id) && Number(msg.parsed_price) > 0
        );

        let initialWhatsappQuote = null;
        let negotiationWinPerUnit = 0;
        if (matchingInbound && latestQuotePrice != null) {
          initialWhatsappQuote = Number(matchingInbound.parsed_price);
          if (initialWhatsappQuote > latestQuotePrice) {
            negotiationWinPerUnit = Number((initialWhatsappQuote - latestQuotePrice).toFixed(2));
          }
        }

        // 4. Strict Zero Double-Counting: take MAX, never sum
        const effectiveUnitSavings = Math.max(paritySavingsPerUnit, negotiationWinPerUnit);

        let savingsBasis = 'NONE';
        if (effectiveUnitSavings > 0) {
          if (effectiveUnitSavings === negotiationWinPerUnit && negotiationWinPerUnit > paritySavingsPerUnit) {
            savingsBasis = 'NEGOTIATION_WIN';
          } else if (referenceType === 'LANDED_PARITY') {
            savingsBasis = 'LANDED_PARITY';
          } else {
            savingsBasis = 'DOMESTIC_BENCHMARK';
          }
        }

        // 5. Consumption scaling guard
        const dailyRate = Number(material.daily_consumption_rate || 0);
        const isScaledByConsumption = dailyRate > 0;
        const monthlyConsumption = isScaledByConsumption ? Number((dailyRate * 30).toFixed(1)) : 0;
        const monthlySavingsInr = (isScaledByConsumption && effectiveUnitSavings > 0)
          ? Math.round(effectiveUnitSavings * monthlyConsumption)
          : 0;

        return {
          materialId: material.id,
          materialName: material.name,
          unit: material.unit || material.unit_abbreviation || 'kg',
          latestQuotePrice,
          referencePrice,
          referenceType,
          initialWhatsappQuote,
          paritySavingsPerUnit,
          negotiationWinPerUnit,
          effectiveUnitSavings,
          savingsBasis,
          dailyConsumptionRate: dailyRate,
          monthlyConsumption,
          isScaledByConsumption,
          monthlySavingsInr,
          missingConsumptionPrompt: (!isScaledByConsumption && effectiveUnitSavings > 0)
            ? 'Configure daily consumption in Stock Profile to calculate estimated monthly ROI.'
            : null,
        };
      } catch (_) {
        return {
          materialId: material.id,
          materialName: material.name,
          unit: material.unit || material.unit_abbreviation || 'kg',
          latestQuotePrice: null,
          referencePrice: null,
          referenceType: null,
          initialWhatsappQuote: null,
          paritySavingsPerUnit: 0,
          negotiationWinPerUnit: 0,
          effectiveUnitSavings: 0,
          savingsBasis: 'NONE',
          dailyConsumptionRate: 0,
          monthlyConsumption: 0,
          isScaledByConsumption: false,
          monthlySavingsInr: 0,
          missingConsumptionPrompt: null,
        };
      }
    })
  );

  let totalMonthlySavingsInr = 0;
  let materialsWithSavingsCount = 0;
  let materialsScaledCount = 0;

  for (const item of materialBreakdowns) {
    if (item.monthlySavingsInr > 0) {
      totalMonthlySavingsInr += item.monthlySavingsInr;
    }
    if (item.effectiveUnitSavings > 0) {
      materialsWithSavingsCount += 1;
    }
    if (item.isScaledByConsumption && item.monthlySavingsInr > 0) {
      materialsScaledCount += 1;
    }
  }

  // Sort materials by monthly savings descending, then effective unit savings descending
  const sortedMaterials = [...materialBreakdowns].sort((a, b) => {
    if (b.monthlySavingsInr !== a.monthlySavingsInr) {
      return b.monthlySavingsInr - a.monthlySavingsInr;
    }
    return b.effectiveUnitSavings - a.effectiveUnitSavings;
  });

  return {
    totalMonthlySavingsInr,
    annualizedSavingsInr: totalMonthlySavingsInr * 12,
    materialsTracked: materials.length,
    materialsWithSavings: materialsWithSavingsCount,
    materialsScaledCount,
    topMaterials: sortedMaterials.slice(0, 5),
    allMaterials: sortedMaterials,
    methodology:
      'Procurement ROI measures verified savings comparing active supplier quotes against landed import parity or domestic market benchmarks, and logged WhatsApp negotiation wins. Monthly savings are scaled strictly by your 30-day consumption rate with zero double-counting or synthetic rupee fabrication.',
    calculatedAt: new Date().toISOString(),
  };
}

function createEmptySummary(materialsTracked = 0) {
  return {
    totalMonthlySavingsInr: 0,
    annualizedSavingsInr: 0,
    materialsTracked,
    materialsWithSavings: 0,
    materialsScaledCount: 0,
    topMaterials: [],
    allMaterials: [],
    methodology:
      'Procurement ROI measures verified savings comparing active supplier quotes against landed import parity or domestic market benchmarks, and logged WhatsApp negotiation wins. Monthly savings are scaled strictly by your 30-day consumption rate with zero double-counting or synthetic rupee fabrication.',
    calculatedAt: new Date().toISOString(),
  };
}

module.exports = {
  calculateSavingsRoi,
  createEmptySummary,
};
