/**
 * Price Tracking read-path business logic (Document 2 §5.6 FR-PRICE-04,
 * Document 3 §5 PriceQueryService). Framework-agnostic — no req/res, no
 * SQL (Document 3 §3).
 *
 * Range/comparison queries (FR-HIST-01–03) belong to Historical Trends
 * (trendQuery.service.js) — a separate module, not implemented here.
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

  const latest = await priceRepository.findLatestByMaterialId(materialId);
  if (!latest) {
    throw new AppError(404, 'NOT_FOUND', 'No price recorded yet for this material');
  }

  return {
    price: latest.price,
    recordedAt: latest.recorded_at,
    source: latest.source,
  };
}

module.exports = { getLatestPrice };
