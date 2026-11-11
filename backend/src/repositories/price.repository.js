/**
 * All queries against `price_points` (Document 4 §5.4).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Insert-only, by design (FR-PRICE-05): no UPDATE or DELETE method exists
 * here at all — not because it was forgotten, but because the schema's
 * immutability guarantee (Document 4 §12.2: application-layer enforcement,
 * no DB trigger) means those operations must never be written, not just
 * never called.
 *
 * Business-ownership scoping (materialId belongs to the caller's business)
 * is the caller's responsibility (materialRepository.findByIdForBusiness,
 * reused from Phase 6A) — these queries only need a tracked_material_id
 * that's already been verified.
 *
 * Phase 1 & Phase 7 (Price Tracking & Data Integrity):
 *   - includes price metadata (currency, unit_label, region, grade, provider_name,
 *     source_url, data_class, is_valid, invalid_reason).
 *   - findLatestByMaterialId(trackedMaterialId, validOnly): selects latest valid
 *     point, ensuring invalid outlier records never leak into latest prices.
 */
const { pool } = require('../database/connection');

const PRICE_METADATA_COLS = `id, price, recorded_at, source, currency, unit_label, region, grade, provider_name, source_url, data_class, is_valid, invalid_reason`;

// Uses the (tracked_material_id, recorded_at DESC) index (Document 4 §9) —
// the single most important index in the schema, exactly as documented.
async function findLatestByMaterialId(trackedMaterialId, validOnly = false) {
  let query = `SELECT ${PRICE_METADATA_COLS} FROM price_points WHERE tracked_material_id = ?`;
  if (validOnly) {
    query += ' AND is_valid = TRUE';
  }
  query += ' ORDER BY recorded_at DESC, id DESC LIMIT 1';

  const [rows] = await pool.execute(query, [trackedMaterialId]);
  return rows[0] || null;
}

async function findLatestValidByMaterialId(trackedMaterialId) {
  return findLatestByMaterialId(trackedMaterialId, true);
}

async function create({
  trackedMaterialId,
  price,
  recordedAt,
  source,
  currency = null,
  unitLabel = null,
  region = null,
  grade = null,
  providerName = null,
  sourceUrl = null,
  dataClass = null,
  isValid = true,
  invalidReason = null,
}) {
  const [result] = await pool.execute(
    `INSERT INTO price_points (
       tracked_material_id, price, recorded_at, source,
       currency, unit_label, region, grade, provider_name, source_url, data_class, is_valid, invalid_reason
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trackedMaterialId,
      price,
      recordedAt,
      source,
      currency,
      unitLabel,
      region,
      grade,
      providerName,
      sourceUrl,
      dataClass,
      isValid,
      invalidReason,
    ]
  );
  const [rows] = await pool.execute(
    `SELECT ${PRICE_METADATA_COLS} FROM price_points WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0];
}

// Bulk equivalent of findLatestByMaterialId() for N materials in one query
// (avoids N+1 on the dashboard's aggregated read, NFR-PERF-01).
// Defaults to validOnly = true so the dashboard always renders authentic, validated prices.
async function findLatestPricesByMaterialIds(materialIds, validOnly = true) {
  if (!materialIds || materialIds.length === 0) {
    return [];
  }
  const placeholders = materialIds.map(() => '?').join(', ');
  const validCondition = validOnly ? 'AND is_valid = TRUE' : '';

  const [rows] = await pool.execute(
    `SELECT tracked_material_id, ${PRICE_METADATA_COLS}
     FROM (
       SELECT tracked_material_id, ${PRICE_METADATA_COLS},
              ROW_NUMBER() OVER (PARTITION BY tracked_material_id ORDER BY recorded_at DESC, id DESC) AS rn
       FROM price_points
       WHERE tracked_material_id IN (${placeholders}) ${validCondition}
     ) ranked
     WHERE rn = 1`,
    materialIds
  );
  return rows;
}

// Historical trends range query.
async function findHistoryForMaterial(trackedMaterialId, { from, to, limit, offset, validOnly = true }) {
  const conditions = ['tracked_material_id = ?'];
  const params = [trackedMaterialId];

  if (validOnly) {
    conditions.push('is_valid = TRUE');
  }
  if (from) {
    conditions.push('recorded_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('recorded_at <= ?');
    params.push(to);
  }

  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const [rows] = await pool.execute(
    `SELECT ${PRICE_METADATA_COLS}
     FROM price_points
     WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at ASC, id ASC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

async function countHistoryForMaterial(trackedMaterialId, { from, to, validOnly = true }) {
  const conditions = ['tracked_material_id = ?'];
  const params = [trackedMaterialId];

  if (validOnly) {
    conditions.push('is_valid = TRUE');
  }
  if (from) {
    conditions.push('recorded_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('recorded_at <= ?');
    params.push(to);
  }

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM price_points WHERE ${conditions.join(' AND ')}`,
    params
  );
  return rows[0].total;
}

async function findSeriesForMaterials(trackedMaterialIds, { from, to, validOnly = true }) {
  if (!trackedMaterialIds || trackedMaterialIds.length === 0) {
    return [];
  }

  const placeholders = trackedMaterialIds.map(() => '?').join(', ');
  const conditions = [`tracked_material_id IN (${placeholders})`];
  const params = [...trackedMaterialIds];

  if (validOnly) {
    conditions.push('is_valid = TRUE');
  }
  if (from) {
    conditions.push('recorded_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('recorded_at <= ?');
    params.push(to);
  }

  const [rows] = await pool.execute(
    `SELECT tracked_material_id, ${PRICE_METADATA_COLS}
     FROM price_points
     WHERE ${conditions.join(' AND ')}
     ORDER BY tracked_material_id ASC, recorded_at ASC, id ASC`,
    params
  );
  return rows;
}

async function existsByMaterialDateSource(trackedMaterialId, recordedAt, source) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM price_points
     WHERE tracked_material_id = ? AND recorded_at = ? AND source = ?
     LIMIT 1`,
    [trackedMaterialId, recordedAt, source]
  );
  return rows.length > 0;
}

/**
 * Find the most recent preceding valid price point for a tracked material.
 * Used by alert percentage calculation to compare like-for-like prices
 * (same currency, is_valid = 1).
 */
async function findPreviousValidPrice(trackedMaterialId, currentRecordedAt, currentPriceId = null, currency = null) {
  const conditions = [
    'tracked_material_id = ?',
    'is_valid = 1',
    'recorded_at <= ?',
  ];
  const params = [trackedMaterialId, currentRecordedAt];

  if (currentPriceId) {
    conditions.push('id != ?');
    params.push(currentPriceId);
  }
  if (currency) {
    conditions.push('(currency = ? OR (currency IS NULL AND ? = \'INR\'))');
    params.push(currency, currency);
  }

  const [rows] = await pool.execute(
    `SELECT id, ${PRICE_METADATA_COLS}
     FROM price_points
     WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at DESC, id DESC
     LIMIT 1`,
    params
  );
  return rows[0] || null;
}

/**
 * Find the latest valid public benchmark/indicative price point for a given external symbol.
 * Strictly excludes MANUAL and SUPPLIER_QUOTE rows so private tenant supplier quotes never leak across businesses.
 */
async function findLatestPriceByExternalSymbol(symbol) {
  if (!symbol) return null;
  const [rows] = await pool.execute(
    `SELECT pp.id, pp.price, pp.recorded_at, pp.source, pp.currency, pp.unit_label,
            pp.region, pp.grade, pp.provider_name, pp.source_url, pp.data_class,
            pp.is_valid, pp.invalid_reason
     FROM price_points pp
     JOIN tracked_materials tm ON tm.id = pp.tracked_material_id
     WHERE tm.external_symbol = ?
       AND pp.is_valid = TRUE
       AND pp.source IN ('THIRD_PARTY_API', 'GOVERNMENT_DATASET')
       AND pp.data_class IN ('OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE')
     ORDER BY pp.recorded_at DESC, pp.id DESC
     LIMIT 1`,
    [symbol]
  );
  return rows[0] || null;
}

module.exports = {
  findLatestByMaterialId,
  findLatestValidByMaterialId,
  create,
  findLatestPricesByMaterialIds,
  findHistoryForMaterial,
  countHistoryForMaterial,
  findSeriesForMaterials,
  existsByMaterialDateSource,
  findPreviousValidPrice,
  findLatestPriceByExternalSymbol,
};
