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
 */
const { pool } = require('../database/connection');

// Uses the (tracked_material_id, recorded_at DESC) index (Document 4 §9) —
// the single most important index in the schema, exactly as documented.
async function findLatestByMaterialId(trackedMaterialId) {
  const [rows] = await pool.execute(
    `SELECT price, recorded_at, source
     FROM price_points
     WHERE tracked_material_id = ?
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [trackedMaterialId]
  );
  return rows[0] || null;
}

async function create({ trackedMaterialId, price, recordedAt, source }) {
  const [result] = await pool.execute(
    `INSERT INTO price_points (tracked_material_id, price, recorded_at, source)
     VALUES (?, ?, ?, ?)`,
    [trackedMaterialId, price, recordedAt, source]
  );
  const [rows] = await pool.execute(
    'SELECT id, price, recorded_at, source FROM price_points WHERE id = ? LIMIT 1',
    [result.insertId]
  );
  return rows[0];
}

// Added in Phase 10 (Dashboard) — purely additive, nothing above changed.
// Bulk equivalent of findLatestByMaterialId() for N materials in one query,
// instead of N sequential calls to the function above (avoids N+1 on the
// dashboard's aggregated read, NFR-PERF-01). Uses ROW_NUMBER() (MySQL
// 8.0.16+, per Document 4 §2.1's confirmed version target — the same
// capability already relied on for Knowledge Base recursive CTEs).
async function findLatestPricesByMaterialIds(materialIds) {
  if (!materialIds || materialIds.length === 0) {
    return [];
  }
  const placeholders = materialIds.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT tracked_material_id, price, recorded_at, source
     FROM (
       SELECT tracked_material_id, price, recorded_at, source,
              ROW_NUMBER() OVER (PARTITION BY tracked_material_id ORDER BY recorded_at DESC, id DESC) AS rn
       FROM price_points
       WHERE tracked_material_id IN (${placeholders})
     ) ranked
     WHERE rn = 1`,
    materialIds
  );
  return rows;
}

// Added in Phase 11 (Historical Trends) — purely additive, nothing above
// changed. Document 3 §5 explicitly names this module as reusing
// PriceRepository, so extending this file (rather than a new one) is the
// design-intended approach, not a deviation.

// FR-HIST-01, 02. Chronological ASC (opposite of findLatestByMaterialId's
// DESC) — Document 5 §4.10: "chart-ready without client-side re-sorting."
// from/to are optional (design interpretation, see Phase 11 report — no
// existing precedent in this project for a date-range filter; absence is
// treated as "no date filtering," consistent with how optional query
// params are already handled elsewhere, e.g. pagination's own defaults).
async function findHistoryForMaterial(trackedMaterialId, { from, to, limit, offset }) {
  const conditions = ['tracked_material_id = ?'];
  const params = [trackedMaterialId];

  if (from) {
    conditions.push('recorded_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('recorded_at <= ?');
    params.push(to);
  }

  // LIMIT/OFFSET can't be bound `?` placeholders under mysql2's execute()
  // (Phase 8 finding, ER_WRONG_ARGUMENTS). limit/offset are already
  // validated, server-generated integers from utils/pagination.js, never
  // raw user input — safe to inline.
  const safeLimit = Number(limit);
  const safeOffset = Number(offset);

  const [rows] = await pool.execute(
    `SELECT price, recorded_at
     FROM price_points
     WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at ASC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );
  return rows;
}

async function countHistoryForMaterial(trackedMaterialId, { from, to }) {
  const conditions = ['tracked_material_id = ?'];
  const params = [trackedMaterialId];

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

// FR-HIST-03. Not paginated — Document 5 §4.10's compare endpoint lists no
// page/limit params, unlike the single-material history endpoint; capped
// at 5 materials (validated upstream), so a full series per material is
// acceptable at V1 scale.
async function findSeriesForMaterials(trackedMaterialIds, { from, to }) {
  if (!trackedMaterialIds || trackedMaterialIds.length === 0) {
    return [];
  }

  const placeholders = trackedMaterialIds.map(() => '?').join(', ');
  const conditions = [`tracked_material_id IN (${placeholders})`];
  const params = [...trackedMaterialIds];

  if (from) {
    conditions.push('recorded_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('recorded_at <= ?');
    params.push(to);
  }

  const [rows] = await pool.execute(
    `SELECT tracked_material_id, price, recorded_at
     FROM price_points
     WHERE ${conditions.join(' AND ')}
     ORDER BY tracked_material_id ASC, recorded_at ASC`,
    params
  );
  return rows;
}

// Added in Phase A (Automatic Price Ingestion) — purely additive, nothing
// above changed.
//
// Application-layer duplicate check: returns true if a price_point for this
// (tracked_material_id, recorded_at, source) already exists.
//
// Used as a belt-and-suspenders guard before calling create() so that
// repeated ingestion runs on the same day silently skip already-stored
// prices rather than hitting the DB unique constraint added in migration
// 019 and propagating a constraint-violation error up the call stack.
// Both layers (app check + DB constraint) are intentional: the app check
// makes the normal case fast and log-friendly; the DB constraint is the
// safety net for concurrent processes or future workers.
//
// recorded_at is compared as a DATE-only match because automatic ingestion
// always stores prices at midnight (YYYY-MM-DD 00:00:00).
async function existsByMaterialDateSource(trackedMaterialId, recordedAt, source) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM price_points
     WHERE tracked_material_id = ? AND recorded_at = ? AND source = ?
     LIMIT 1`,
    [trackedMaterialId, recordedAt, source]
  );
  return rows.length > 0;
}

module.exports = {
  findLatestByMaterialId,
  create,
  findLatestPricesByMaterialIds,
  findHistoryForMaterial,
  countHistoryForMaterial,
  findSeriesForMaterials,
  existsByMaterialDateSource,
};

