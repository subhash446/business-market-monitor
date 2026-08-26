/**
 * All queries against `alert_rules` (Document 4 §5.6).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * DELETE is soft-only: softDelete() sets deleted_at — there is no hard-
 * delete method here at all, by design (Document 4 §12.2, enforced further
 * by alert_events.alert_rule_id being ON DELETE RESTRICT).
 */
const { pool } = require('../database/connection');

// Newest-first, consistent with this project's other time-oriented lists
// (news, alert events) — Document 5 doesn't mandate a specific order here.
async function listActiveByBusinessId(businessId) {
  const [rows] = await pool.execute(
    `SELECT * FROM alert_rules
     WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [businessId]
  );
  return rows;
}

// Excludes soft-deleted rows — a deleted rule "behaves as gone" (Document 5 §4.8).
async function findByIdForBusiness(ruleId, businessId) {
  const [rows] = await pool.execute(
    `SELECT * FROM alert_rules
     WHERE id = ? AND business_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [ruleId, businessId]
  );
  return rows[0] || null;
}

async function findById(ruleId) {
  const [rows] = await pool.execute('SELECT * FROM alert_rules WHERE id = ? LIMIT 1', [ruleId]);
  return rows[0] || null;
}

async function create({ businessId, trackedMaterialId, conditionType, thresholdPrice }) {
  const [result] = await pool.execute(
    `INSERT INTO alert_rules (business_id, tracked_material_id, condition_type, threshold_price)
     VALUES (?, ?, ?, ?)`,
    [businessId, trackedMaterialId, conditionType, thresholdPrice]
  );
  return findById(result.insertId);
}

async function update(ruleId, { conditionType, thresholdPrice, isActive }) {
  await pool.execute(
    `UPDATE alert_rules SET condition_type = ?, threshold_price = ?, is_active = ? WHERE id = ?`,
    [conditionType, thresholdPrice, isActive, ruleId]
  );
  return findById(ruleId);
}

async function softDelete(ruleId) {
  await pool.execute('UPDATE alert_rules SET deleted_at = NOW() WHERE id = ?', [ruleId]);
  const [rows] = await pool.execute('SELECT deleted_at FROM alert_rules WHERE id = ?', [ruleId]);
  return rows[0].deleted_at;
}

module.exports = { listActiveByBusinessId, findByIdForBusiness, findById, create, update, softDelete };
