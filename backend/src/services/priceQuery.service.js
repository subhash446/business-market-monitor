/**
 * Price Tracking read-path business logic (Document 2 §5.6 FR-PRICE-04,
 * Document 3 §5 PriceQueryService). Framework-agnostic — no req/res, no
 * SQL (Document 3 §3).
 *
 * Range/comparison queries (FR-HIST-01–03) belong to Historical Trends
 * (trendQuery.service.js) — a separate module.
 *
 * Phase 1 & Phase 7 (Data Integrity & Price Tracking):
 *   - includes price metadata (currency, unit_label, region, grade, provider_name,
 *     source_url, data_class, is_valid).
 *   - strictly retrieves latest VALID price point (is_valid = TRUE), ensuring
 *     outlier spikes or corrupt records never appear as the latest valid price.
 *   - getPriceSourceInfo() provides transparent disclaimers on commodity proxies
 *     (e.g. WTI/Brent in USD/bbl) vs direct local procurement quotes.
 */
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const AppError = require('../utils/AppError');

async function getLatestPrice(businessId, materialId) {
  // Reuses the existing, frozen Phase 6A ownership check — no duplicated
  // business-isolation logic (Document 5 §2.4).
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  // Retrieve the latest valid price point (is_valid = TRUE)
  const latest = await priceRepository.findLatestByMaterialId(materialId, true);
  if (!latest || latest.is_valid === 0 || latest.is_valid === false) {
    throw new AppError(404, 'NOT_FOUND', 'No valid price recorded yet for this material');
  }

  return {
    price: latest.price,
    recordedAt: latest.recorded_at,
    source: latest.source,
    currency: latest.currency || null,
    unitLabel: latest.unit_label || null,
    region: latest.region || null,
    grade: latest.grade || null,
    providerName: latest.provider_name || null,
    sourceUrl: latest.source_url || null,
    dataClass: latest.data_class || null,
    isValid: true,
    invalidReason: latest.invalid_reason || null,
  };
}

/**
 * Detailed provenance and classification info for a material's price data.
 * Used by the UI to render transparent badges and proxy disclaimers.
 */
const { COMMODITY_METADATA } = require('../config/commodityMapping');

function formatSourceUnitDisplay(currency, unitLabel) {
  const safeCurrency = currency || 'INR';
  if (!unitLabel) return `${safeCurrency}/unit`;
  const trimmed = String(unitLabel).trim();
  if (trimmed.toUpperCase().startsWith(`${safeCurrency.toUpperCase()}/`)) {
    return trimmed;
  }
  return `${safeCurrency}/${trimmed}`;
}

async function getPriceSourceInfo(businessId, materialId) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const latest = await priceRepository.findLatestByMaterialId(materialId, true);
  const externalSymbol = material.external_symbol || null;
  const materialUnit = material.unit_abbreviation || material.unit || null;
  const meta = externalSymbol ? COMMODITY_METADATA[externalSymbol] || null : null;
  const hasLatest = Boolean(latest);
  const isManualLatest = hasLatest && latest.source === 'MANUAL';

  let isProxy = false;
  if (meta) {
    isProxy = isManualLatest ? false : Boolean(meta.isProxy);
  } else if (hasLatest && !isManualLatest) {
    isProxy = Boolean(
      latest.source === 'THIRD_PARTY_API' &&
      (!latest.currency || latest.currency === 'USD' || latest.data_class === 'MARKET_INDICATIVE')
    );
  }

  let currency;
  let unitLabel;
  let dataClass;
  let providerName;
  let sourceUrl;
  let region;
  let grade;
  let disclaimer = null;

  if (isManualLatest) {
    currency = latest.currency || 'INR';
    unitLabel = latest.unit_label || materialUnit;
    dataClass = latest.data_class || 'SUPPLIER_QUOTE';
    providerName = latest.provider_name || 'Manual Entry';
    sourceUrl = latest.source_url || null;
    region = latest.region || 'Domestic (India)';
    grade = latest.grade || null;
    const unitDisplay = unitLabel ? formatSourceUnitDisplay(currency, unitLabel) : `${currency}/unit`;
    disclaimer = `Direct supplier quote recorded in ${unitDisplay}.`;
  } else if (meta) {
    currency = latest?.currency || meta.currency;
    unitLabel = latest?.unit_label || meta.unitLabel;
    dataClass = latest?.data_class || meta.dataClass;
    providerName = latest?.provider_name || meta.provider;
    sourceUrl = latest?.source_url || meta.sourceUrl || null;
    region = latest?.region || meta.region || null;
    grade = latest?.grade || meta.grade || null;
    if (isProxy) {
      const unitDisplay = formatSourceUnitDisplay(currency, unitLabel);
      disclaimer = `Price reflects a global commodity benchmark (${externalSymbol} in ${unitDisplay}) — not a direct local procurement cost for ${material.name}.`;
    } else {
      disclaimer = meta.disclaimer || null;
    }
  } else if (hasLatest) {
    currency = latest.currency || (isProxy ? 'USD' : 'INR');
    unitLabel = latest.unit_label || (isProxy ? 'USD/bbl' : materialUnit);
    dataClass = latest.data_class || (isProxy ? 'MARKET_INDICATIVE' : 'SUPPLIER_QUOTE');
    providerName = latest.provider_name || (isProxy ? 'U.S. Energy Information Administration (EIA)' : 'Manual Entry');
    sourceUrl = latest.source_url || (isProxy ? 'https://www.eia.gov' : null);
    region = latest.region || (isProxy ? 'Cushing, OK' : 'Domestic (India)');
    grade = latest.grade || null;
    if (isProxy) {
      const sym = latest.grade || 'Crude Oil';
      const unitDisplay = formatSourceUnitDisplay(currency, unitLabel);
      disclaimer = `Price reflects a global commodity benchmark (${sym} in ${unitDisplay}) — not a direct local procurement cost for ${material.name}.`;
    }
  } else {
    currency = 'INR';
    unitLabel = materialUnit;
    dataClass = 'SUPPLIER_QUOTE';
    providerName = 'Manual Entry';
    sourceUrl = null;
    region = 'Domestic (India)';
    grade = null;
  }

  return {
    materialId: Number(materialId),
    materialName: material.name,
    materialUnit,
    externalSymbol,
    latestPrice: latest ? latest.price : null,
    recordedAt: latest ? latest.recorded_at : null,
    source: latest ? latest.source : null,
    currency,
    unitLabel,
    dataClass,
    providerName,
    sourceUrl,
    region,
    grade,
    isProxy,
    disclaimer,
  };
}

module.exports = { getLatestPrice, getPriceSourceInfo };
