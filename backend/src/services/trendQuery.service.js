/**
 * Historical Trends business logic (Document 2 §5.10 FR-HIST-01–03,
 * Document 3 §5 TrendQueryService — "reuses PriceRepository"). Framework-
 * agnostic — no req/res, no SQL (Document 3 §3).
 */
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const { buildMeta } = require('../utils/pagination');
const AppError = require('../utils/AppError');

async function getPriceHistory(businessId, materialId, { from, to, page, limit, offset }) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const [rows, total] = await Promise.all([
    priceRepository.findHistoryForMaterial(materialId, { from, to, limit, offset }),
    priceRepository.countHistoryForMaterial(materialId, { from, to }),
  ]);

  return {
    items: rows.map((row) => ({ price: row.price, recordedAt: row.recorded_at })),
    meta: buildMeta({ page, limit, total }),
  };
}

async function compareMaterials(businessId, materialIds, { from, to }) {
  // Normalize to numbers up front — materialIds arrives here as strings
  // (split from the query string, e.g. "3,1" -> ["3","1"]), but
  // row.tracked_material_id from MySQL is always a number. Without this,
  // the Map below is keyed by string while lookups use numbers, and every
  // lookup silently misses. Normalizing once, here, means every use below
  // (Map keys, Map lookups, and the ownership check) is consistently numeric.
  const normalizedIds = materialIds.map((id) => Number(id));

  // Every material must belong to the caller's business — checked one by
  // one, reusing the exact same ownership check used everywhere else in
  // this project (Document 5 §2.4). Not batched into a single query,
  // matching the existing findByIdForBusiness contract rather than adding
  // a new bulk-ownership method for a request capped at 5 materials.
  const materials = await Promise.all(
    normalizedIds.map(async (id) => {
      const material = await materialRepository.findByIdForBusiness(id, businessId);
      if (!material) {
        throw new AppError(404, 'NOT_FOUND', `Material not found: ${id}`);
      }
      return material;
    })
  );

  const seriesRows = await priceRepository.findSeriesForMaterials(normalizedIds, { from, to });

  const seriesByMaterialId = new Map();
  normalizedIds.forEach((id) => seriesByMaterialId.set(id, []));
  seriesRows.forEach((row) => {
    seriesByMaterialId.get(Number(row.tracked_material_id)).push({
      price: row.price,
      recordedAt: row.recorded_at,
    });
  });

  return materials.map((material) => ({
    materialId: material.id,
    name: material.name,
    series: seriesByMaterialId.get(Number(material.id)),
  }));
}

module.exports = { getPriceHistory, compareMaterials };
