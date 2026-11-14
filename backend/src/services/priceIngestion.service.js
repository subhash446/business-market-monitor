/**
 * Price Tracking write-path business logic (Document 2 §5.6 FR-PRICE-01, 02,
 * 05, Document 3 §5 PriceIngestionService). Framework-agnostic — no req/res,
 * no SQL (Document 3 §3).
 *
 * Phase 7 scope: manual entry (source = MANUAL), the V1 default per
 * the Document 3 ADR. Scheduled/government-dataset ingestion is a separate,
 * internal node-cron job (Document 3 §8).
 *
 * Phase A addition: ingestFromProvider() — handles one normalized MarketPrice
 * for one tracked material. Reuses the same priceRepository.create() +
 * alertEvaluationService.evaluateMaterial() pipeline as addManualPrice();
 * no duplication of insertion or alert logic.
 *
 * Phase 1 (Data Integrity): enriches both manual and automatic price insertions
 * with currency, unit_label, region, grade, provider_name, source_url, and
 * data_class to clearly distinguish proxy benchmarks (WTI/Brent in USD/bbl)
 * from direct local procurement quotes (INR/kg).
 */
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const alertEvaluationService = require('./alertEvaluation.service');
const { COMMODITY_METADATA } = require('../config/commodityMapping');
const { PRICE_SOURCE } = require('../constants/enums');
const AppError = require('../utils/AppError');

const ALLOWED_PROVIDER_SOURCES = new Set([
  PRICE_SOURCE.GOVERNMENT_DATASET,
  PRICE_SOURCE.THIRD_PARTY_API,
]);

function resolveProviderSource(marketPrice, meta) {
  if (ALLOWED_PROVIDER_SOURCES.has(marketPrice?.source)) {
    return marketPrice.source;
  }
  if (ALLOWED_PROVIDER_SOURCES.has(meta?.priceSource)) {
    return meta.priceSource;
  }
  const symbolStr = typeof marketPrice?.symbol === 'string' ? marketPrice.symbol.trim().toUpperCase() : '';
  const providerStr = typeof marketPrice?.providerName === 'string' ? marketPrice.providerName.toLowerCase() : '';
  if (symbolStr.endsWith('_GOI') || providerStr.includes('data.gov.in')) {
    return PRICE_SOURCE.GOVERNMENT_DATASET;
  }
  return PRICE_SOURCE.THIRD_PARTY_API;
}

const {
  isStrictFiniteNumber,
  isStrictPositiveInteger,
  isValidCurrencyCode,
  normalizeCurrencyCode,
  isValidHttpUrl,
} = require('../utils/validationHelpers');
const logger = require('../utils/logger');

async function addManualPrice(businessId, materialId, {
  price,
  recordedAt,
  currency,
  unitLabel,
  region,
  grade,
  sourceUrl,
}) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }
  if (!material.is_tracked) {
    // Document 5 §4.6: "materialId doesn't exist for this business, or is
    // not currently tracked" — both are 404, not distinguished to the caller.
    throw new AppError(404, 'NOT_FOUND', 'Material is not currently tracked');
  }

  const trimmedSourceUrl = typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl.trim() : null;
  if (trimmedSourceUrl && !isValidHttpUrl(trimmedSourceUrl)) {
    const ValidationAppError = require('../utils/AppError');
    throw new ValidationAppError(400, 'VALIDATION_ERROR', 'Invalid sourceUrl: must use http or https protocol');
  }

  const created = await priceRepository.create({
    trackedMaterialId: materialId,
    price,
    recordedAt,
    source: 'MANUAL',
    currency: normalizeCurrencyCode(currency, 'INR'), // Default INR for domestic SME transactions
    unitLabel: unitLabel || material.unit_abbreviation || material.unit || null,
    region: region || 'Domestic (India)',
    grade: grade || null,
    providerName: 'Supplier Manual Entry',
    sourceUrl: trimmedSourceUrl,
    dataClass: 'SUPPLIER_QUOTE',
    isValid: true,
  });

  // Evaluate active alert rules immediately after recording the price.
  await alertEvaluationService.evaluateMaterial(businessId, materialId);

  return {
    id: created.id,
    price: created.price,
    recordedAt: created.recorded_at,
    source: created.source,
    currency: created.currency,
    unitLabel: created.unit_label,
    region: created.region,
    grade: created.grade,
    providerName: created.provider_name,
    sourceUrl: created.source_url,
    dataClass: created.data_class,
    isValid: created.is_valid !== undefined ? !!created.is_valid : true,
  };
}

/**
 * Ingest a single normalized provider price for one tracked material.
 *
 * Called by the price ingestion job for each (tracked_material, marketPrice)
 * pair. Deliberately does NOT do ownership validation — the job has already
 * verified that this tracked_material_id exists and belongs to a real
 * business by querying via findTrackedByExternalSymbol().
 *
 * Returns one of:
 *   { status: 'inserted', trackedMaterialId, businessId }
 *   { status: 'skipped',  trackedMaterialId, businessId, reason: 'duplicate' }
 *
 * Never throws — errors are caught and returned as:
 *   { status: 'error',    trackedMaterialId, businessId, error: Error }
 *
 * This keeps the job loop simple: every material result is one of three
 * known statuses rather than a mix of values and thrown exceptions.
 *
 * @param {{ id: number, business_id: number }} trackedMaterial
 * @param {{ symbol: string, price: number, recordedAt: string }} marketPrice
 */
async function ingestFromProvider(trackedMaterial, marketPrice) {
  const { id: trackedMaterialId, business_id: businessId } = trackedMaterial;
  const { price, recordedAt, symbol } = marketPrice;

  // recordedAt from provider is 'YYYY-MM-DD'; stored as midnight DATETIME
  // e.g. '2026-09-09' → '2026-09-09 00:00:00' in MySQL DATETIME column.
  const recordedAtDateTime = `${recordedAt} 00:00:00`;

  try {
    // Populate commodity-specific metadata from canonical symbol catalog
    const meta = (symbol && COMMODITY_METADATA[symbol]) || {};
    const resolvedSource = resolveProviderSource(marketPrice, meta);

    // Application-layer dedup check (belt-and-suspenders with DB constraint).
    const alreadyExists = await priceRepository.existsByMaterialDateSource(
      trackedMaterialId,
      recordedAtDateTime,
      resolvedSource
    );

    if (alreadyExists) {
      return { status: 'skipped', trackedMaterialId, businessId, reason: 'duplicate' };
    }

    const resolvedCurrency = normalizeCurrencyCode(marketPrice.currency, meta.currency || null);

    // Reuse the exact same repository method the manual path uses.
    await priceRepository.create({
      trackedMaterialId,
      price,
      recordedAt: recordedAtDateTime,
      source: resolvedSource,
      currency: resolvedCurrency,
      unitLabel: marketPrice.unitLabel || meta.unitLabel || null,
      region: marketPrice.region || meta.region || null,
      grade: marketPrice.grade || meta.grade || null,
      providerName: marketPrice.providerName || meta.provider || 'External Market Provider',
      sourceUrl: marketPrice.sourceUrl || meta.sourceUrl || null,
      dataClass: marketPrice.dataClass || meta.dataClass || 'MARKET_INDICATIVE',
      isValid: true,
      invalidReason: null,
    });

    // Evaluate alert rules immediately — exactly as addManualPrice() does.
    await alertEvaluationService.evaluateMaterial(businessId, trackedMaterialId);

    return { status: 'inserted', trackedMaterialId, businessId };
  } catch (error) {
    return { status: 'error', trackedMaterialId, businessId, error };
  }
}

/**
 * Bulk upload manual prices for tracked materials (V2 T-07).
 *
 * Scopes every material to businessId, enforces is_tracked = TRUE,
 * performs per-row validation, guarantees idempotency against the
 * unique constraint uq_price_points_material_date_source, and triggers
 * alert evaluation once per affected material.
 *
 * Returns partial success breakdown:
 *   { summary: { total, inserted, skipped, failed }, results: [...] }
 *
 * @param {number} businessId
 * @param {Array<object>} prices
 * @returns {Promise<{ summary: object, results: Array<object> }>}
 */
async function bulkAddPrices(businessId, prices) {
  const summary = {
    total: Array.isArray(prices) ? prices.length : 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
  };
  const results = [];
  const affectedMaterialIds = new Set();
  const materialCache = new Map();

  const ALLOWED_DATA_CLASSES = ['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE', 'SUPPLIER_QUOTE'];

  for (let index = 0; index < prices.length; index++) {
    const item = prices[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      summary.failed++;
      results.push({
        index,
        status: 'failed',
        reason: 'Item must be an object',
      });
      continue;
    }

    const {
      trackedMaterialId,
      price,
      recordedAt,
      currency,
      unitLabel,
      region,
      grade,
      sourceUrl,
      dataClass,
    } = item;

    // Validate trackedMaterialId
    if (!isStrictPositiveInteger(trackedMaterialId)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: trackedMaterialId !== undefined ? trackedMaterialId : null,
        status: 'failed',
        reason: 'trackedMaterialId must be a positive integer',
      });
      continue;
    }

    const matId = Number(trackedMaterialId);

    // Business ownership & tracking check
    let material;
    if (materialCache.has(matId)) {
      material = materialCache.get(matId);
    } else {
      material = await materialRepository.findByIdForBusiness(matId, businessId);
      materialCache.set(matId, material);
    }

    if (!material) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'Material not found or not tracked',
      });
      continue;
    }

    if (!material.is_tracked) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'Material is not currently tracked',
      });
      continue;
    }

    // Validate price
    const numPrice = isStrictFiniteNumber(price) ? Number(price) : NaN;
    if (Number.isNaN(numPrice) || numPrice <= 0) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'Price must be a number greater than 0',
      });
      continue;
    }

    // Validate recordedAt
    if (!recordedAt) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'recordedAt is required',
      });
      continue;
    }

    const recordedDate = new Date(recordedAt);
    if (Number.isNaN(recordedDate.getTime())) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'recordedAt must be a valid date',
      });
      continue;
    }

    if (recordedDate.getTime() > Date.now()) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'recordedAt cannot be in the future',
      });
      continue;
    }

    // Normalize recordedAt to YYYY-MM-DD 00:00:00 if date-only string
    let normalizedRecordedAt = recordedAt;
    if (typeof recordedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(recordedAt.trim())) {
      normalizedRecordedAt = `${recordedAt.trim()} 00:00:00`;
    }

    // Validate currency
    if (currency !== undefined && currency !== null && !isValidCurrencyCode(currency)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'currency must be a 3-letter alphabetic currency code (e.g. INR, USD)',
      });
      continue;
    }
    const resolvedCurrency = normalizeCurrencyCode(currency, 'INR');

    // Validate unitLabel
    if (unitLabel !== undefined && unitLabel !== null && (typeof unitLabel !== 'string' || unitLabel.length > 30)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'unitLabel must be a string up to 30 characters',
      });
      continue;
    }
    const resolvedUnitLabel = (typeof unitLabel === 'string' && unitLabel.trim())
      ? unitLabel.trim()
      : (material.unit_abbreviation || material.unit || null);

    // Validate region
    if (region !== undefined && region !== null && (typeof region !== 'string' || region.length > 100)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'region must be a string up to 100 characters',
      });
      continue;
    }
    const resolvedRegion = (typeof region === 'string' && region.trim()) ? region.trim() : 'Domestic (India)';

    // Validate grade
    if (grade !== undefined && grade !== null && (typeof grade !== 'string' || grade.length > 100)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'grade must be a string up to 100 characters',
      });
      continue;
    }
    const resolvedGrade = (typeof grade === 'string' && grade.trim()) ? grade.trim() : null;

    // Validate sourceUrl
    const trimmedSourceUrl = typeof sourceUrl === 'string' && sourceUrl.trim() ? sourceUrl.trim() : null;
    if (trimmedSourceUrl && !isValidHttpUrl(trimmedSourceUrl, 500)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: 'sourceUrl must be a valid http or https URL string up to 500 characters',
      });
      continue;
    }

    // Validate dataClass
    if (dataClass !== undefined && dataClass !== null && !ALLOWED_DATA_CLASSES.includes(dataClass)) {
      summary.failed++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'failed',
        reason: `dataClass must be one of: ${ALLOWED_DATA_CLASSES.join(', ')}`,
      });
      continue;
    }
    const resolvedDataClass = dataClass || 'SUPPLIER_QUOTE';

    // Idempotent duplicate pre-check
    try {
      const alreadyExists = await priceRepository.existsByMaterialDateSource(
        matId,
        normalizedRecordedAt,
        'MANUAL'
      );

      if (alreadyExists) {
        summary.skipped++;
        results.push({
          index,
          trackedMaterialId: matId,
          status: 'skipped',
          reason: 'Duplicate price entry for this material and date',
        });
        continue;
      }

      const created = await priceRepository.create({
        trackedMaterialId: matId,
        price: numPrice,
        recordedAt: normalizedRecordedAt,
        source: 'MANUAL',
        currency: resolvedCurrency,
        unitLabel: resolvedUnitLabel,
        region: resolvedRegion,
        grade: resolvedGrade,
        providerName: 'Supplier Manual Entry (Bulk)',
        sourceUrl: trimmedSourceUrl,
        dataClass: resolvedDataClass,
        isValid: true,
        invalidReason: null,
      });

      summary.inserted++;
      results.push({
        index,
        trackedMaterialId: matId,
        status: 'inserted',
        id: created.id,
        price: created.price,
        currency: created.currency,
        recordedAt: created.recorded_at,
      });
      affectedMaterialIds.add(matId);
    } catch (insertErr) {
      if (insertErr?.code === 'ER_DUP_ENTRY' || insertErr?.errno === 1062) {
        summary.skipped++;
        results.push({
          index,
          trackedMaterialId: matId,
          status: 'skipped',
          reason: 'Duplicate price entry for this material and date',
        });
      } else {
        summary.failed++;
        results.push({
          index,
          trackedMaterialId: matId,
          status: 'failed',
          reason: insertErr?.message || 'Database error during insertion',
        });
      }
    }
  }

  // Trigger alert evaluation once per distinct material affected
  for (const matId of affectedMaterialIds) {
    try {
      await alertEvaluationService.evaluateMaterial(businessId, matId);
    } catch (alertErr) {
      logger.warn(`[bulkAddPrices] Alert evaluation failed for material ${matId}: ${alertErr?.message}`);
    }
  }

  return { summary, results };
}

module.exports = { addManualPrice, ingestFromProvider, bulkAddPrices };
