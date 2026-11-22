'use strict';

/**
 * WhatsApp Quote Capture & Negotiation Copilot Service (V3-M4).
 *
 * Responsibilities:
 *   1. Pure deterministic parser for Indian SME quote phrasing:
 *      - Handles Indian comma-formatted numbers (e.g. ₹2,640/qtl, Rs. 1,14,500/MT, Rs 123.50/kg).
 *      - Matches tracked materials via exact and token matching.
 *      - Normalizes mass and volume units (kg, MT, quintal/qtl, ton, bbl, ltr).
 *      - Extracts supplier name and handles non-quote conversational noise gracefully.
 *   2. Safe Unit Conversion & Parity Evaluation:
 *      - Converts quote to tracked material native unit (e.g. MT -> kg, quintal -> kg).
 *      - Flags incompatible units (e.g. pcs vs kg) with unitMismatch: true.
 *   3. Counter-Offer & Negotiation Drafting:
 *      - Evaluates parity/market variance and suggests fair counter-offer bounds.
 *      - Guarantees suggestedCounterLow <= suggestedCounterHigh and both > 0.
 *      - Generates ready-to-send WhatsApp counter-offer and RFQ draft messages.
 *   4. Safe Persistence:
 *      - Handles same-day duplicate entries (ER_DUP_ENTRY) gracefully without crashing.
 */

const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const alertEvaluationService = require('./alertEvaluation.service');
const { pool } = require('../database/connection');

// Unit normalization lookup
const UNIT_MAP = {
  kg: 'kg',
  kgs: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mt: 'MT',
  ton: 'MT',
  tons: 'MT',
  tonne: 'MT',
  tonnes: 'MT',
  'metric ton': 'MT',
  'metric tons': 'MT',
  qtl: 'quintal',
  qtls: 'quintal',
  quintal: 'quintal',
  quintals: 'quintal',
  bbl: 'bbl',
  barrel: 'bbl',
  barrels: 'bbl',
  ltr: 'litre',
  litre: 'litre',
  litres: 'litre',
  liter: 'litre',
  liters: 'litre',
  pcs: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
};

// Conversions to kg
const MASS_TO_KG = {
  kg: 1,
  quintal: 100, // 1 quintal = 100 kg
  MT: 1000,     // 1 MT = 1000 kg
};

/**
 * Clean and parse Indian comma-formatted numbers.
 * Examples: "1,14,500" -> 114500, "2,640.50" -> 2640.5
 */
function parseIndianNumber(str) {
  if (typeof str !== 'string' && typeof str !== 'number') return null;
  const clean = String(str).replace(/,/g, '').trim();
  const num = Number(clean);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Normalizes a raw unit string into standard BMM abbreviation.
 */
function normalizeUnit(unitStr) {
  if (!unitStr) return null;
  const clean = String(unitStr).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return UNIT_MAP[clean] || clean;
}

/**
 * Evaluates unit conversion between quoted unit and tracked material unit.
 */
function evaluateUnitConversion(quotedPrice, quotedUnit, materialUnit) {
  const qUnit = normalizeUnit(quotedUnit);
  const mUnit = normalizeUnit(materialUnit);

  if (!qUnit || !mUnit || qUnit === mUnit) {
    return {
      convertedPrice: quotedPrice,
      targetUnit: mUnit || qUnit || 'unit',
      unitMismatch: false,
      conversionFactor: 1.0,
      unitConversionNote: null,
    };
  }

  // Mass unit conversion (kg, quintal, MT)
  if (MASS_TO_KG[qUnit] && MASS_TO_KG[mUnit]) {
    const factorToKg = MASS_TO_KG[qUnit];
    const pricePerKg = quotedPrice / factorToKg;
    const factorFromKg = MASS_TO_KG[mUnit];
    const convertedPrice = Number((pricePerKg * factorFromKg).toFixed(4));
    const factor = factorToKg / factorFromKg;

    return {
      convertedPrice,
      targetUnit: mUnit,
      unitMismatch: false,
      conversionFactor: factor,
      unitConversionNote: `Converted from ${qUnit} to ${mUnit} (1 ${qUnit} = ${factor} ${mUnit}).`,
    };
  }

  // Incompatible unit types (e.g. pcs vs kg)
  return {
    convertedPrice: quotedPrice,
    targetUnit: mUnit,
    unitMismatch: true,
    conversionFactor: null,
    unitConversionNote: `Unit mismatch: quote is in ${qUnit} but material is tracked in ${mUnit}. Manual review required.`,
  };
}

/**
 * Extract material, price, unit, and supplier from raw WhatsApp quote text.
 */
function parseWhatsAppQuote(rawText, trackedMaterials = []) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      isMatch: false,
      reason: 'EMPTY_TEXT',
      rawText: rawText || '',
    };
  }

  const text = rawText.trim();

  // 1. Match material against tracked materials
  let matchedMaterial = null;
  let highestScore = 0;

  for (const mat of trackedMaterials) {
    const matName = mat.name.trim();
    const regex = new RegExp(`\\b${matName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      if (matName.length > highestScore) {
        matchedMaterial = mat;
        highestScore = matName.length;
      }
    }
  }

  // Secondary token match for industrial synonyms (e.g. "PET Resin" matching "PET", "Virgin HDPE" matching "HDPE")
  if (!matchedMaterial) {
    for (const mat of trackedMaterials) {
      const tokens = mat.name.split(/\s+/).filter((t) => t.length >= 3);
      for (const tok of tokens) {
        const tokRegex = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
        if (tokRegex.test(text)) {
          if (tok.length > highestScore) {
            matchedMaterial = mat;
            highestScore = tok.length;
          }
        }
      }
    }
  }

  // 2. Price and unit extraction
  // Handles:
  // - "Rs. 1,14,500/MT" or "Rs 123.50/kg"
  // - "₹2,640/qtl" or "₹ 118.50 per kg"
  // - "@ 98.20 per kg" or "@98.20/kg"
  // - "99.50/kg" or "2640 per quintal"
  const priceRegexes = [
    // Symbol / Prefix + number + optional unit: ₹ 2,640 / qtl or Rs. 1,14,500/MT
    /(?:(?:Rs\.?|₹|INR)\s*)([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:\/|per\s+)?([a-zA-Z]+)?/i,
    // @ prefix: @ 98.20 / kg
    /@\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:\/|per\s+)?([a-zA-Z]+)?/i,
    // Number + unit separator: 123.50/kg or 2,640 per quintal
    /\b([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:\/|per\s+)([a-zA-Z]+)\b/i,
  ];

  let rawPrice = null;
  let rawUnit = null;

  for (const rx of priceRegexes) {
    const match = text.match(rx);
    if (match) {
      const parsedNum = parseIndianNumber(match[1]);
      if (parsedNum !== null) {
        rawPrice = parsedNum;
        if (match[2]) {
          rawUnit = match[2].trim();
        }
        break;
      }
    }
  }

  // Fallback unit if not captured in price regex: check text for standalone units
  if (!rawUnit) {
    const unitMatch = text.match(/\b(kg|kgs|kilogram|mt|metric ton|ton|tonnes|qtl|quintal|bbl|barrel|ltr|litre|pcs|pieces)\b/i);
    if (unitMatch) {
      rawUnit = unitMatch[1];
    } else if (matchedMaterial) {
      rawUnit = matchedMaterial.unit || 'kg';
    } else {
      rawUnit = 'kg';
    }
  }

  // If no price found, message is not a valid quote (e.g. conversational chatter)
  if (rawPrice === null) {
    return {
      isMatch: false,
      reason: 'NO_PRICE_FOUND',
      rawText: text,
      matchedMaterial: matchedMaterial ? { id: matchedMaterial.id, name: matchedMaterial.name } : null,
    };
  }

  // 3. Extract supplier name
  let supplierName = null;

  // Pattern A: Trailing comma supplier: e.g. ", Sharma Bros"
  const commaMatch = text.match(/,\s*([A-Z][A-Za-z0-9&. ]{2,35})\s*$/);
  if (commaMatch && !/^\s*(?:today|rate|kg|mt|quintal|qtl)\b/i.test(commaMatch[1])) {
    supplierName = commaMatch[1].trim();
  }

  // Pattern B: "from <Supplier>", "by <Supplier>", "M/s <Supplier>"
  if (!supplierName) {
    const fromMatch = text.match(/(?:\bfrom\b|\bm\/s\.?\s+|\bsupplier\s*:\s*)\s*([A-Z0-9][A-Za-z0-9&., ]{2,35})/i);
    if (fromMatch && fromMatch[1]) {
      const candidate = fromMatch[1].trim().replace(/[,.-]$/, '');
      if (candidate.length >= 2 && !candidate.toLowerCase().includes('http')) {
        supplierName = candidate;
      }
    }
  }

  // Pattern C: Known company suffix: e.g. "Sharma Polymers", "ABC Plastics", "Indore Mandi"
  if (!supplierName) {
    const compMatch = text.match(/\b([A-Z][A-Za-z0-9&]*(?:\s+[A-Z][A-Za-z0-9&]*)*\s+(?:Polymers|Plastics|Enterprises|Traders|Industries|Chemicals|Mandi|Bros|Corp|Corporation|Pvt Ltd|Ltd))\b/i);
    if (compMatch && compMatch[1]) {
      supplierName = compMatch[1].trim();
    }
  }

  const normalizedUnit = normalizeUnit(rawUnit);
  const currency = text.includes('$') || /\bUSD\b/i.test(text) ? 'USD' : 'INR';

  return {
    isMatch: true,
    rawText: text,
    matchedMaterial: matchedMaterial
      ? {
          id: matchedMaterial.id,
          name: matchedMaterial.name,
          unit: matchedMaterial.unit,
          isTracked: matchedMaterial.isTracked,
          landedUnitFactor: matchedMaterial.landedUnitFactor,
        }
      : null,
    rawPrice,
    rawUnit: normalizedUnit,
    currency,
    supplierName: supplierName || null,
    confidence: matchedMaterial && rawPrice > 0 ? 'HIGH' : 'MEDIUM',
  };
}

/**
 * Generate negotiation counter-offer and RFQ draft messages.
 */
function generateNegotiationDrafts({
  materialName,
  materialUnit = 'kg',
  quotedPrice,
  quotedUnit = 'kg',
  currency = 'INR',
  supplierName = null,
  benchmarkPrice = null,
  benchmarkSource = 'Market Benchmark',
  landedParityBenchmark = null,
}) {
  const normMatUnit = normalizeUnit(materialUnit) || 'kg';
  const normQuoteUnit = normalizeUnit(quotedUnit) || normMatUnit;
  const unitConv = evaluateUnitConversion(quotedPrice, normQuoteUnit, normMatUnit);

  const effectiveQuotedPrice = unitConv.convertedPrice;
  const effectiveBenchmark = landedParityBenchmark != null
    ? Number(landedParityBenchmark)
    : (benchmarkPrice != null ? Number(benchmarkPrice) : null);

  let variancePercent = null;
  let suggestedCounterLow = null;
  let suggestedCounterHigh = null;

  if (effectiveBenchmark != null && effectiveBenchmark > 0) {
    variancePercent = Number((((effectiveQuotedPrice - effectiveBenchmark) / effectiveBenchmark) * 100).toFixed(2));

    if (variancePercent > 0) {
      // Quote is above benchmark/parity
      // Low: aggressive target (e.g. benchmark or 5% below quote)
      // High: compromise target (e.g. midpoint or 2% below quote)
      const lowTarget = Math.min(effectiveBenchmark, effectiveQuotedPrice * 0.95);
      const highTarget = Math.max(lowTarget, Math.min(effectiveQuotedPrice * 0.98, (effectiveBenchmark + effectiveQuotedPrice) / 2));
      suggestedCounterLow = Number(lowTarget.toFixed(2));
      suggestedCounterHigh = Number(highTarget.toFixed(2));
    } else {
      // Quote is at or below benchmark/parity (good quote)
      // Low: lock in with slight immediate order discount (2%)
      // High: accept quoted rate
      suggestedCounterLow = Number((effectiveQuotedPrice * 0.98).toFixed(2));
      suggestedCounterHigh = Number(effectiveQuotedPrice.toFixed(2));
    }
  } else {
    // Benchmark absent: use standard 3% - 5% discount target
    suggestedCounterLow = Number((effectiveQuotedPrice * 0.95).toFixed(2));
    suggestedCounterHigh = Number((effectiveQuotedPrice * 0.97).toFixed(2));
  }

  // Ensure strict bounds: suggestedCounterLow <= suggestedCounterHigh and both > 0
  if (suggestedCounterLow <= 0) suggestedCounterLow = Number((effectiveQuotedPrice * 0.95).toFixed(2));
  if (suggestedCounterHigh <= 0) suggestedCounterHigh = effectiveQuotedPrice;
  if (suggestedCounterLow > suggestedCounterHigh) {
    suggestedCounterLow = suggestedCounterHigh;
  }

  const supplierLabel = supplierName || 'Partner';
  const currencySymbol = currency === 'USD' ? '$' : '₹';

  // Ready-to-send counter-offer WhatsApp message
  const benchmarkText = effectiveBenchmark != null
    ? `Based on current landed market benchmarks (${currencySymbol}${effectiveBenchmark.toFixed(2)}/${normMatUnit}), `
    : '';

  const counterOfferMessage =
    `Hi ${supplierLabel}, received your quote of ${currencySymbol}${quotedPrice}/${normQuoteUnit} for ${materialName}.\n` +
    `${benchmarkText}our target counter-offer is ${currencySymbol}${suggestedCounterLow.toFixed(2)}–${currencySymbol}${suggestedCounterHigh.toFixed(2)}/${normMatUnit}.\n` +
    `Can we confirm an immediate purchase order at ${currencySymbol}${suggestedCounterLow.toFixed(2)}/${normMatUnit}? Please let us know if we can close this today.`;

  // Ready-to-send RFQ WhatsApp message
  const rfqMessage =
    `Hi ${supplierLabel}, please share your best quote and delivery timeline for ${materialName} (${normQuoteUnit}).\n` +
    `Required for immediate dispatch to our warehouse facility. Please mention payment terms and quote validity.`;

  const waMeLink = `https://wa.me/?text=${encodeURIComponent(counterOfferMessage)}`;

  return {
    quotedPrice,
    quotedUnit: normQuoteUnit,
    effectiveQuotedPrice,
    materialUnit: normMatUnit,
    unitConversion: unitConv,
    benchmarkPrice: effectiveBenchmark,
    benchmarkSource: landedParityBenchmark != null ? 'Landed Parity Parity Benchmark' : benchmarkSource,
    variancePercent,
    suggestedCounterLow,
    suggestedCounterHigh,
    counterOfferMessage,
    rfqMessage,
    waMeLink,
  };
}

/**
 * Persist a supplier quote into price_points cleanly, handling same-day duplicate constraints.
 */
async function logParsedSupplierQuote({
  businessId,
  materialId,
  price,
  recordedAt = new Date(),
  supplierName = null,
  unitLabel = null,
  currency = 'INR',
}) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new Error('Tracked material not found or not owned by business.');
  }

  const recDate = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
  const normalizedDate = isNaN(recDate.getTime()) ? new Date() : recDate;

  // Attempt creation, retrying with slight offset if same-second duplicate occurs
  let created = null;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptTime = new Date(normalizedDate.getTime() + attempt * 1000);
    try {
      created = await priceRepository.create({
        trackedMaterialId: materialId,
        price,
        recordedAt: attemptTime,
        source: 'SUPPLIER_INTEGRATION',
        currency: currency || 'INR',
        unitLabel: unitLabel || material.unit_abbreviation || material.unit || null,
        region: 'Domestic (India)',
        grade: null,
        providerName: supplierName || 'WhatsApp Inbound',
        sourceUrl: 'whatsapp://inbound',
        dataClass: 'SUPPLIER_QUOTE',
        isValid: true,
      });
      break;
    } catch (err) {
      if ((err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) && attempt < maxAttempts - 1) {
        continue;
      }
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        // Return latest existing price point gracefully rather than throwing 500
        const [existing] = await pool.execute(
          `SELECT * FROM price_points
           WHERE tracked_material_id = ? AND source = 'SUPPLIER_INTEGRATION'
           ORDER BY recorded_at DESC LIMIT 1`,
          [materialId]
        );
        if (existing && existing[0]) {
          created = existing[0];
          break;
        }
      }
      throw err;
    }
  }

  // Evaluate active alert rules
  try {
    await alertEvaluationService.evaluateMaterial(businessId, materialId);
  } catch (_) {
    // Non-blocking alert evaluation
  }

  return created;
}

module.exports = {
  parseIndianNumber,
  normalizeUnit,
  evaluateUnitConversion,
  parseWhatsAppQuote,
  generateNegotiationDrafts,
  logParsedSupplierQuote,
};
