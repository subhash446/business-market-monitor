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
  pc: 'pcs',
  nos: 'pcs',
  unit: 'pcs',
  units: 'pcs',
};

/**
 * Resolves tracked material unit regardless of property naming convention across repositories,
 * controllers, and services (unit, unit_abbreviation, unitAbbreviation, unit_symbol, etc.)
 */
function resolveMaterialUnit(material) {
  if (!material) return null;
  const unit =
    material.unit ||
    material.unit_abbreviation ||
    material.unitAbbreviation ||
    material.unit_symbol ||
    material.unitSymbol ||
    material.unit_code ||
    material.unitCode ||
    material.unit_name ||
    material.unitName ||
    material.abbreviation ||
    null;
  return unit ? String(unit).trim() : null;
}

/**
 * Cleanly strips leading/trailing unit tokens, prepositions, or punctuation
 * so tokens like "/pcs", "pcs", "per kg" never leak into the supplier name.
 */
function sanitizeSupplierName(name) {
  if (!name || typeof name !== 'string') return null;
  let clean = name.trim();
  // Strip leading unit token (e.g. "/pcs", "pcs", "per pcs", "kg", "/kg", "per kg")
  clean = clean.replace(/^(?:\/|per\s+)?(?:pcs|piece|pieces|pc|nos|unit|units|kg|kgs|kilogram|kilograms|mt|ton|tons|tonne|tonnes|qtl|qtls|quintal|quintals|bbl|barrel|ltr|litre|litres|liter|liters)\s+/i, '');
  // Strip leading or trailing punctuation/noise symbols
  clean = clean.replace(/^[\s,./\\:;@#-]+/, '').replace(/[\s,./\\:;@#-]+$/, '').trim();
  // Strip noisy conversational prefixes
  clean = clean.replace(/^(?:today|rate|quote|price|is|at|from|m\/s\.?)\s+/i, '').trim();
  return clean.length >= 2 ? clean : null;
}

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
  let matchedPriceSnippet = null;

  for (const rx of priceRegexes) {
    const match = text.match(rx);
    if (match) {
      const parsedNum = parseIndianNumber(match[1]);
      if (parsedNum !== null) {
        rawPrice = parsedNum;
        matchedPriceSnippet = match[0];
        if (match[2]) {
          rawUnit = match[2].trim();
        }
        break;
      }
    }
  }

  const resolvedMatUnit = resolveMaterialUnit(matchedMaterial);

  // Fallback unit if not captured in price regex: check text for standalone units
  if (!rawUnit) {
    const unitMatch = text.match(/\b(kg|kgs|kilogram|mt|metric ton|ton|tonnes|qtl|quintal|bbl|barrel|ltr|litre|pcs|pieces|pc|nos|unit|units)\b/i);
    if (unitMatch) {
      rawUnit = unitMatch[1];
    } else if (matchedMaterial) {
      rawUnit = resolvedMatUnit || 'kg';
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
  // Prepare cleaned text for supplier extraction by stripping matched price, unit, and material tokens
  let supplierSearchText = text;

  if (matchedPriceSnippet) {
    supplierSearchText = supplierSearchText.replace(matchedPriceSnippet, ' ');
  }

  // Strip matched material name from search text so it cannot match as a company word
  if (matchedMaterial && matchedMaterial.name) {
    const matNameEsc = matchedMaterial.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    supplierSearchText = supplierSearchText.replace(new RegExp(`\\b${matNameEsc}\\b`, 'gi'), ' ');
  }

  // Strip lingering price/unit/rate tokens (e.g. /pcs, /kg, per kg, Rs 123.50, pcs, kg)
  supplierSearchText = supplierSearchText
    .replace(/(?:Rs\.?|₹|INR|\$)\s*[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?/gi, ' ')
    .replace(/(?:\/|per\s+)\s*(?:pcs|piece|pieces|pc|nos|unit|units|kg|kgs|kilogram|kilograms|mt|ton|tons|tonne|tonnes|qtl|qtls|quintal|quintals|bbl|barrel|ltr|litre|litres|liter|liters)\b/gi, ' ')
    .replace(/\b(?:pcs|piece|pieces|pc|nos|unit|units|kg|kgs|kilogram|kilograms|mt|ton|tons|tonne|tonnes|qtl|qtls|quintal|quintals|bbl|barrel|ltr|litre|litres|liter|liters)\b/gi, ' ')
    .replace(/\b(?:rate|quote|price|today|offer|quoted|inr|usd)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let supplierName = null;

  // Pattern A: Trailing comma supplier: e.g. ", Sharma Bros"
  const commaMatch = supplierSearchText.match(/,\s*([A-Z][A-Za-z0-9&. ]{2,35})\s*$/) ||
                     text.match(/,\s*([A-Z][A-Za-z0-9&. ]{2,35})\s*$/);
  if (commaMatch && !/^\s*(?:today|rate|kg|mt|quintal|qtl|pcs)\b/i.test(commaMatch[1])) {
    supplierName = sanitizeSupplierName(commaMatch[1]);
  }

  // Pattern B: "from <Supplier>", "by <Supplier>", "M/s <Supplier>"
  if (!supplierName) {
    const fromMatch = supplierSearchText.match(/(?:\bfrom\b|\bm\/s\.?\s+|\bsupplier\s*:\s*)\s*([A-Z0-9][A-Za-z0-9&., ]{2,35})/i) ||
                      text.match(/(?:\bfrom\b|\bm\/s\.?\s+|\bsupplier\s*:\s*)\s*([A-Z0-9][A-Za-z0-9&., ]{2,35})/i);
    if (fromMatch && fromMatch[1]) {
      const candidate = fromMatch[1].trim().replace(/[,.-]$/, '');
      if (candidate.length >= 2 && !candidate.toLowerCase().includes('http')) {
        supplierName = sanitizeSupplierName(candidate);
      }
    }
  }

  // Pattern C: Known company suffix: e.g. "Sharma Polymers", "ABC Plastics", "Indore Mandi"
  if (!supplierName) {
    const compMatch = supplierSearchText.match(/\b([A-Z][A-Za-z0-9&]*(?:\s+[A-Z][A-Za-z0-9&]*)*\s+(?:Polymers|Plastics|Enterprises|Traders|Industries|Chemicals|Mandi|Bros|Corp|Corporation|Pvt Ltd|Ltd))\b/i) ||
                      text.match(/\b([A-Z][A-Za-z0-9&]*(?:\s+[A-Z][A-Za-z0-9&]*)*\s+(?:Polymers|Plastics|Enterprises|Traders|Industries|Chemicals|Mandi|Bros|Corp|Corporation|Pvt Ltd|Ltd))\b/i);
    if (compMatch && compMatch[1]) {
      supplierName = sanitizeSupplierName(compMatch[1]);
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
          unit: resolvedMatUnit || 'kg',
          unit_abbreviation: resolvedMatUnit || 'kg',
          isTracked: matchedMaterial.isTracked ?? matchedMaterial.is_tracked ?? true,
          landedUnitFactor: matchedMaterial.landedUnitFactor ?? matchedMaterial.landed_unit_factor ?? null,
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
  const formattedQuotedPrice = Number(quotedPrice).toFixed(2);
  const formattedCounterLow = Number(suggestedCounterLow).toFixed(2);
  const formattedCounterHigh = Number(suggestedCounterHigh).toFixed(2);

  // Ready-to-send counter-offer WhatsApp message
  const benchmarkIntro = effectiveBenchmark != null
    ? `Based on current landed market benchmarks (${currencySymbol}${Number(effectiveBenchmark).toFixed(2)}/${normMatUnit}), `
    : '';

  const counterOfferStart = benchmarkIntro ? `${benchmarkIntro}our` : 'Our';

  const counterOfferMessage =
    `Hi ${supplierLabel}, received your quote of ${currencySymbol}${formattedQuotedPrice}/${normQuoteUnit} for ${materialName}.\n` +
    `${counterOfferStart} target counter-offer is ${currencySymbol}${formattedCounterLow}–${currencySymbol}${formattedCounterHigh}/${normMatUnit}.\n` +
    `Can we confirm an immediate purchase order at ${currencySymbol}${formattedCounterLow}/${normMatUnit}? Please let us know if we can close this today.`;

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
        unitLabel: unitLabel || resolveMaterialUnit(material) || 'kg',
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
  resolveMaterialUnit,
  sanitizeSupplierName,
  evaluateUnitConversion,
  parseWhatsAppQuote,
  generateNegotiationDrafts,
  logParsedSupplierQuote,
};
