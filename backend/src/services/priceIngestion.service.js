/**
 * Price Tracking write-path business logic (Document 2 §5.6 FR-PRICE-01, 02,
 * 05, Document 3 §5 PriceIngestionService). Framework-agnostic — no req/res,
 * no SQL (Document 3 §3).
 *
 * Phase 7 scope only: manual entry (source = MANUAL), the V1 default per
 * the Document 3 ADR. Scheduled/government-dataset ingestion is a separate,
 * internal node-cron job (Document 3 §8) — not implemented here; no
 * PriceSourceAdapter abstraction is built for a single hardcoded source with
 * no second implementation yet (that pattern belongs to the jobs/ phase,
 * when it actually has more than one source to abstract over).
 */
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const alertEvaluationService = require('./alertEvaluation.service');
const AppError = require('../utils/AppError');

async function addManualPrice(businessId, materialId, { price, recordedAt }) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }
  if (!material.is_tracked) {
    // Document 5 §4.6: "materialId doesn't exist for this business, or is
    // not currently tracked" — both are 404, not distinguished to the caller.
    throw new AppError(404, 'NOT_FOUND', 'Material is not currently tracked');
  }

  const created = await priceRepository.create({
    trackedMaterialId: materialId,
    price,
    recordedAt,
    source: 'MANUAL',
  });
// Evaluate active alert rules immediately after recording the price.
await alertEvaluationService.evaluateMaterial(businessId, materialId);
  return {
    id: created.id,
    price: created.price,
    recordedAt: created.recorded_at,
    source: created.source,
  };
}

module.exports = { addManualPrice };
