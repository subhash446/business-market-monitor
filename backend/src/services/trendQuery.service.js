/**
 * Historical Trends business logic (Document 2 §5.10 FR-HIST-01–03,
 * Document 3 §5 TrendQueryService — "reuses PriceRepository"). Framework-
 * agnostic — no req/res, no SQL (Document 3 §3).
 *
 * Phase 1 & Phase 7 (Data Integrity & Price Tracking):
 *   - includes price metadata (currency, unit_label, region, grade, provider_name,
 *     source_url, data_class, is_valid) so price charts and comparison tables can
 *     properly annotate proxy benchmarks.
 *   - queries validOnly = true by default so invalid spike anomalies are excluded
 *     from history trends and charts.
 */
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const { buildMeta } = require('../utils/pagination');
const AppError = require('../utils/AppError');

/**
 * Normalizes date-only `to` parameter ('YYYY-MM-DD') to end of day ('YYYY-MM-DD 23:59:59')
 * so that SQL datetime range queries (recorded_at <= to) inclusively capture all price points
 * recorded during that day (e.g. afternoon or intraday prices), satisfying FR-HIST-02.
 */
function normalizeEndDate(to) {
  if (to && typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
    return `${to.trim()} 23:59:59`;
  }
  return to;
}

async function getPriceHistory(businessId, materialId, { from, to, page, limit, offset, validOnly = true }) {
  const material = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const normalizedTo = normalizeEndDate(to);
  const [rows, total] = await Promise.all([
    priceRepository.findHistoryForMaterial(materialId, { from, to: normalizedTo, limit, offset, validOnly }),
    priceRepository.countHistoryForMaterial(materialId, { from, to: normalizedTo, validOnly }),
  ]);

  return {
    items: rows.map((row) => ({
      price: row.price,
      recordedAt: row.recorded_at,
      source: row.source,
      currency: row.currency || null,
      unitLabel: row.unit_label || null,
      region: row.region || null,
      grade: row.grade || null,
      providerName: row.provider_name || null,
      sourceUrl: row.source_url || null,
      dataClass: row.data_class || null,
      isValid: row.is_valid !== undefined ? !!row.is_valid : true,
    })),
    meta: buildMeta({ page, limit, total }),
  };
}

async function compareMaterials(businessId, materialIds, { from, to, validOnly = true }) {
  // Normalize to numbers up front — materialIds arrives here as strings
  // (split from the query string, e.g. "3,1" -> ["3","1"]), but
  // row.tracked_material_id from MySQL is always a number.
  const normalizedIds = materialIds.map((id) => Number(id));

  // Every material must belong to the caller's business — checked one by
  // one, reusing the exact same ownership check used everywhere else in
  // this project (Document 5 §2.4).
  const materials = await Promise.all(
    normalizedIds.map(async (id) => {
      const material = await materialRepository.findByIdForBusiness(id, businessId);
      if (!material) {
        throw new AppError(404, 'NOT_FOUND', `Material not found: ${id}`);
      }
      return material;
    })
  );

  const normalizedTo = normalizeEndDate(to);
  const seriesRows = await priceRepository.findSeriesForMaterials(normalizedIds, { from, to: normalizedTo, validOnly });

  const seriesByMaterialId = new Map();
  normalizedIds.forEach((id) => seriesByMaterialId.set(id, []));
  seriesRows.forEach((row) => {
    seriesByMaterialId.get(Number(row.tracked_material_id)).push({
      price: row.price,
      recordedAt: row.recorded_at,
      source: row.source,
      currency: row.currency || null,
      unitLabel: row.unit_label || null,
      dataClass: row.data_class || null,
      isValid: row.is_valid !== undefined ? !!row.is_valid : true,
    });
  });

  return materials.map((material) => ({
    materialId: material.id,
    name: material.name,
    series: seriesByMaterialId.get(Number(material.id)),
  }));
}

module.exports = { getPriceHistory, compareMaterials };
