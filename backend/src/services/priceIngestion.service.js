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
 *
 * Phase A addition: ingestFromProvider() — handles one normalized MarketPrice
 * for one tracked material. Reuses the same priceRepository.create() +
 * alertEvaluationService.evaluateMaterial() pipeline as addManualPrice();
 * no duplication of insertion or alert logic.
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
  const { price, recordedAt } = marketPrice;

  // recordedAt from provider is 'YYYY-MM-DD'; stored as midnight DATETIME
  // e.g. '2026-09-09' → '2026-09-09 00:00:00' in MySQL DATETIME column.
  const recordedAtDateTime = `${recordedAt} 00:00:00`;

  try {
    // Application-layer dedup check (belt-and-suspenders with DB constraint).
    const alreadyExists = await priceRepository.existsByMaterialDateSource(
      trackedMaterialId,
      recordedAtDateTime,
      'THIRD_PARTY_API'
    );

    if (alreadyExists) {
      return { status: 'skipped', trackedMaterialId, businessId, reason: 'duplicate' };
    }

    // Reuse the exact same repository method the manual path uses.
    await priceRepository.create({
      trackedMaterialId,
      price,
      recordedAt: recordedAtDateTime,
      source: 'THIRD_PARTY_API',
    });

    // Evaluate alert rules immediately — exactly as addManualPrice() does.
    await alertEvaluationService.evaluateMaterial(businessId, trackedMaterialId);

    return { status: 'inserted', trackedMaterialId, businessId };
  } catch (error) {
    return { status: 'error', trackedMaterialId, businessId, error };
  }
}

module.exports = { addManualPrice, ingestFromProvider };

