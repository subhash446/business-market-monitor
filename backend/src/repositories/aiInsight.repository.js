/**
 * All queries against `ai_insights` (migration 020, Phase H).
 * Parameterized queries only (Document 3 para 13, NFR-SEC-04).
 *
 * Business-scoped by design: every read method requires business_id from
 * req.auth (never from request body). The job (write path) supplies
 * both tracked_material_id and business_id together so a single INSERT
 * captures the denormalized business reference used by the dashboard.
 *
 * Methods:
 *   create(fields)                                   -- insert one insight row
 *   findLatestByMaterial(trackedMaterialId, businessId)
 *                                                    -- latest insight or null
 *   findLatestByBusiness(businessId, limit)          -- dashboard: top N latest
 *   listByMaterial(trackedMaterialId, businessId, { limit, offset })
 *                                                    -- paginated history
 *   countByMaterial(trackedMaterialId, businessId)   -- total rows for pagination
 *
 * LIMIT/OFFSET note: mysql2 prepared statements (execute()) do not support
 * LIMIT/OFFSET as bound ? placeholders (ER_WRONG_ARGUMENTS). limit/offset are
 * always server-computed integers from pagination.js -- never raw user input --
 * so inlining them is safe. Same pattern as news.repository.js and
 * alertEvent.repository.js.
 */
const { pool } = require('../database/connection');

// Full column list returned on reads.  Matches exactly the ai_insights
// columns defined in migration 020.  No SELECT * -- explicit column list
// ensures column order is stable across schema changes.
const SELECT_COLS = [
  'id',
  'tracked_material_id',
  'business_id',
  'headline',
  'what_happened',
  'why_it_happened',
  'business_impact',
  'outlook',
  'confidence',
  'evidence_price_range',
  'evidence_price_points_count',
  'evidence_news_count',
  'model_used',
  'generated_at',
].join(', ');

/**
 * Insert one AI insight row.
 *
 * The caller (aiInsight.service.js) is responsible for prompt-building,
 * LLM invocation, and post-validation before calling this method.
 * This function only stores -- it does no validation of its own.
 *
 * @param {{
 *   trackedMaterialId: number,
 *   businessId:        number,
 *   headline:          string,
 *   whatHappened:      string,
 *   whyItHappened:     string,
 *   businessImpact:    string,
 *   outlook:           'BEARISH'|'NEUTRAL'|'BULLISH'|'VOLATILE',
 *   confidence:        'LOW'|'MEDIUM'|'HIGH',
 *   evidencePriceRange:         string|null,
 *   evidencePricePointsCount:   number,
 *   evidenceNewsCount:          number,
 *   modelUsed:         string,
 * }} fields
 * @returns {Promise<object>} - The newly inserted row (full SELECT_COLS set)
 */
async function create({
  trackedMaterialId,
  businessId,
  headline,
  whatHappened,
  whyItHappened,
  businessImpact,
  outlook,
  confidence,
  evidencePriceRange       = null,
  evidencePricePointsCount = 0,
  evidenceNewsCount        = 0,
  modelUsed,
}) {
  const [result] = await pool.execute(
    `INSERT INTO ai_insights (
       tracked_material_id,
       business_id,
       headline,
       what_happened,
       why_it_happened,
       business_impact,
       outlook,
       confidence,
       evidence_price_range,
       evidence_price_points_count,
       evidence_news_count,
       model_used
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trackedMaterialId,
      businessId,
      headline,
      whatHappened,
      whyItHappened,
      businessImpact,
      outlook,
      confidence,
      evidencePriceRange,
      evidencePricePointsCount,
      evidenceNewsCount,
      modelUsed,
    ]
  );

  const [rows] = await pool.execute(
    `SELECT ${SELECT_COLS} FROM ai_insights WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0] || null;
}

/**
 * Fetch the single most-recent insight for a specific tracked material,
 * scoped to the owning business.
 *
 * Uses the (tracked_material_id, generated_at DESC) composite index
 * -- confirmed by EXPLAIN as type=ref, rows=1.
 *
 * Returns null if no insight has been generated yet for this material.
 *
 * @param {number} trackedMaterialId
 * @param {number} businessId
 * @returns {Promise<object|null>}
 */
async function findLatestByMaterial(trackedMaterialId, businessId) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_COLS}
     FROM ai_insights
     WHERE tracked_material_id = ?
       AND business_id = ?
     ORDER BY generated_at DESC
     LIMIT 1`,
    [trackedMaterialId, businessId]
  );
  return rows[0] || null;
}

/**
 * Fetch the most-recent insight for each of the business's tracked materials,
 * up to `limit` rows (default 3 -- used by dashboard panel).
 *
 * Uses the (business_id, generated_at DESC) composite index for the outer
 * filter, then returns the top-N rows sorted by generation time.
 * This is a simplification appropriate for MVP: for a business with many
 * materials it returns the N most-recently generated insights across all
 * materials, not one per material. The dashboard only shows a summary panel
 * so this is intentional and sufficient.
 *
 * @param {number} businessId
 * @param {number} [limit=3]
 * @returns {Promise<object[]>}
 */
async function findLatestByBusiness(businessId, limit = 3) {
  const parsed = parseInt(limit, 10);
  const safeLimit = Number.isInteger(parsed) && parsed > 0 ? parsed : 3;
  const [rows] = await pool.execute(
    `SELECT ${SELECT_COLS}
     FROM ai_insights
     WHERE business_id = ?
     ORDER BY generated_at DESC
     LIMIT ${safeLimit}`,
    [businessId]
  );
  return rows;
}

/**
 * Paginated history of insights for one tracked material, business-scoped.
 *
 * Ordered newest-first so callers can render a timeline.
 *
 * @param {number} trackedMaterialId
 * @param {number} businessId
 * @param {{ limit: number, offset: number }} pagination
 * @returns {Promise<object[]>}
 */
async function listByMaterial(trackedMaterialId, businessId, { limit, offset }) {
  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);
  const safeLimit  = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const [rows] = await pool.execute(
    `SELECT ${SELECT_COLS}
     FROM ai_insights
     WHERE tracked_material_id = ?
       AND business_id = ?
     ORDER BY generated_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [trackedMaterialId, businessId]
  );
  return rows;
}

/**
 * Total count of insight rows for a tracked material (for pagination).
 *
 * @param {number} trackedMaterialId
 * @param {number} businessId
 * @returns {Promise<number>}
 */
async function countByMaterial(trackedMaterialId, businessId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM ai_insights
     WHERE tracked_material_id = ?
       AND business_id = ?`,
    [trackedMaterialId, businessId]
  );
  return rows[0].total;
}

module.exports = {
  create,
  findLatestByMaterial,
  findLatestByBusiness,
  listByMaterial,
  countByMaterial,
};
