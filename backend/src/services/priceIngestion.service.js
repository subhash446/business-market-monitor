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

const { normalizeCurrencyCode, isValidHttpUrl } = require('../utils/validationHelpers');

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

module.exports = { addManualPrice, ingestFromProvider };
