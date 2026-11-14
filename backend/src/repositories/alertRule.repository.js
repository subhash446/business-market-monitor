/**
 * All queries against `alert_rules` (Document 4 §5.6).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Phase 2 enhancements:
 *   - threshold_type: ABSOLUTE | PERCENTAGE
 *   - cooldown_hours: integer (default 24)
 *   - last_triggered_at: datetime
 *   - updateLastTriggeredAt() for atomic cooldown tracking
 *   - listAllActive() for scheduled cron evaluation
 *
 * DELETE is soft-only: softDelete() sets deleted_at — there is no hard-
 * delete method here at all, by design (Document 4 §12.2, enforced further
 * by alert_events.alert_rule_id being ON DELETE RESTRICT).
 */
const { pool } = require('../database/connection');
const { isStrictPositiveInteger } = require('../utils/validationHelpers');

function assertBusinessId(businessId, operation) {
  if (!isStrictPositiveInteger(businessId)) {
    throw new Error(`businessId must be a positive integer for ${operation}`);
  }
}

// Newest-first, consistent with this project's other time-oriented lists
// (news, alert events) — Document 5 doesn't mandate a specific order here.
async function listActiveByBusinessId(businessId) {
  const [rows] = await pool.execute(
    `SELECT id, business_id, tracked_material_id, condition_type, threshold_price,
            threshold_type, cooldown_hours, notification_channel, destination_phone,
            last_triggered_at, is_active, created_at, updated_at
     FROM alert_rules
     WHERE business_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [businessId]
  );
  return rows;
}

// Excludes soft-deleted rows — a deleted rule "behaves as gone" (Document 5 §4.8).
async function findByIdForBusiness(ruleId, businessId) {
  const [rows] = await pool.execute(
    `SELECT id, business_id, tracked_material_id, condition_type, threshold_price,
            threshold_type, cooldown_hours, notification_channel, destination_phone,
            last_triggered_at, is_active, created_at, updated_at
     FROM alert_rules
     WHERE id = ? AND business_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [ruleId, businessId]
  );
  return rows[0] || null;
}

async function findById(ruleId) {
  const [rows] = await pool.execute(
    `SELECT id, business_id, tracked_material_id, condition_type, threshold_price,
            threshold_type, cooldown_hours, notification_channel, destination_phone,
            last_triggered_at, is_active, created_at, updated_at
     FROM alert_rules
     WHERE id = ? LIMIT 1`,
    [ruleId]
  );
  return rows[0] || null;
}

async function create({
  businessId,
  trackedMaterialId,
  conditionType,
  thresholdPrice,
  thresholdType = 'ABSOLUTE',
  cooldownHours = 24,
  notificationChannel = 'EMAIL',
  destinationPhone = null,
}) {
  const [result] = await pool.execute(
    `INSERT INTO alert_rules (
       business_id, tracked_material_id, condition_type, threshold_price,
       threshold_type, cooldown_hours, notification_channel, destination_phone
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      trackedMaterialId,
      conditionType,
      thresholdPrice,
      thresholdType,
      cooldownHours,
      notificationChannel,
      destinationPhone,
    ]
  );
  return findById(result.insertId);
}

async function update(ruleId, {
  conditionType,
  thresholdPrice,
  thresholdType = 'ABSOLUTE',
  cooldownHours = 24,
  isActive,
  notificationChannel = 'EMAIL',
  destinationPhone = null,
}, businessId) {
  assertBusinessId(businessId, 'update');
  const [result] = await pool.execute(
    `UPDATE alert_rules
     SET condition_type = ?, threshold_price = ?, threshold_type = ?,
         cooldown_hours = ?, is_active = ?, notification_channel = ?, destination_phone = ?
     WHERE id = ? AND business_id = ? AND deleted_at IS NULL`,
    [
      conditionType,
      thresholdPrice,
      thresholdType,
      cooldownHours,
      isActive,
      notificationChannel,
      destinationPhone,
      ruleId,
      businessId,
    ]
  );
  if (result && result.affectedRows === 0) {
    return null;
  }
  return findByIdForBusiness(ruleId, businessId);
}

async function updateLastTriggeredAt(ruleId, timestamp = new Date(), businessId) {
  assertBusinessId(businessId, 'updateLastTriggeredAt');
  const [result] = await pool.execute(
    `UPDATE alert_rules SET last_triggered_at = ? WHERE id = ? AND business_id = ?`,
    [timestamp, ruleId, businessId]
  );
  if (result && result.affectedRows !== undefined) {
    return result.affectedRows === 1;
  }
  return true;
}

/**
 * Atomically claim trigger cooldown for an alert rule using conditional UPDATE.
 * Prevents concurrent workers from creating duplicate alert events/emails for the same trigger window.
 * Strictly scoped by business_id alongside active/non-deleted predicates.
 * Returns true strictly if this invocation updated the row (affectedRows === 1).
 *
 * Timezone consistency note:
 *   Intentionally uses parameterized Node Date (`timestamp`) in both SET and TIMESTAMPDIFF rather
 *   than DB-side `UTC_TIMESTAMP()`, because `connection.js` does not set `timezone: 'Z'` and
 *   `alert_rules.last_triggered_at` is a timezone-naive DATETIME column read back into JS Date in
 *   the connection's local timezone. Switching only SQL to UTC_TIMESTAMP() would introduce clock
 *   skew against JS Date pre-checks and serialized API timestamps on non-UTC hosts.
 */
async function claimTriggerCooldown(ruleId, timestamp = new Date(), businessId) {
  assertBusinessId(businessId, 'claimTriggerCooldown');
  const [result] = await pool.execute(
    `UPDATE alert_rules
     SET last_triggered_at = ?
     WHERE id = ?
       AND business_id = ?
       AND is_active = TRUE
       AND deleted_at IS NULL
       AND (
         last_triggered_at IS NULL
         OR TIMESTAMPDIFF(SECOND, last_triggered_at, ?) >= COALESCE(cooldown_hours, 24) * 3600
       )`,
    [timestamp, ruleId, businessId, timestamp]
  );
  return Boolean(result && result.affectedRows === 1);
}

async function softDelete(ruleId, businessId) {
  assertBusinessId(businessId, 'softDelete');
  const [result] = await pool.execute(
    'UPDATE alert_rules SET deleted_at = NOW() WHERE id = ? AND business_id = ? AND deleted_at IS NULL',
    [ruleId, businessId]
  );
  if (result && result.affectedRows === 0) {
    return null;
  }
  const [rows] = await pool.execute(
    'SELECT deleted_at FROM alert_rules WHERE id = ? AND business_id = ? LIMIT 1',
    [ruleId, businessId]
  );
  return rows[0]?.deleted_at ?? null;
}

/**
 * List all active rules across all businesses for materials that are tracked.
 * Intentionally cross-tenant read-only scheduler query: includes `ar.business_id` on every
 * returned row so `alertEvaluationService.evaluateAllActive()` delegates into strictly
 * business-scoped `evaluateMaterial(businessId, trackedMaterialId)` execution.
 */
async function listAllActive() {
  const [rows] = await pool.execute(
    `SELECT ar.id, ar.business_id, ar.tracked_material_id, ar.condition_type,
            ar.threshold_price, ar.threshold_type, ar.cooldown_hours,
            ar.notification_channel, ar.destination_phone,
            ar.last_triggered_at, ar.is_active,
            tm.external_symbol
     FROM alert_rules ar
     JOIN tracked_materials tm ON ar.tracked_material_id = tm.id
     WHERE ar.is_active = TRUE AND ar.deleted_at IS NULL AND tm.is_tracked = TRUE
     ORDER BY ar.business_id ASC, ar.tracked_material_id ASC, ar.id ASC`
  );
  return rows;
}

module.exports = {
  listActiveByBusinessId,
  findByIdForBusiness,
  findById,
  create,
  update,
  updateLastTriggeredAt,
  claimTriggerCooldown,
  softDelete,
  listAllActive,
};
