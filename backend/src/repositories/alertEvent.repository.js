/**
 * All queries against `alert_events` (Document 4 §5.6).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Read-only, by design (Phase 9 scope): no insert function exists here at
 * all — the AlertEvaluationService that would populate this table is
 * explicitly out of scope (approved decisions #5-8), not merely deferred.
 * Same pattern as news.repository.js in Phase 8.
 */
const { pool } = require('../database/connection');

// Uses the (business_id, triggered_at DESC) index (Document 4 §9) — the
// exact query pattern that index was designed for.
async function listByBusinessId(businessId, { limit, offset }) {
  // mysql2's execute() (prepared statements) doesn't support LIMIT/OFFSET
  // as bound `?` placeholders (Phase 8 finding, ER_WRONG_ARGUMENTS). limit/
  // offset are already validated, server-generated integers from
  // utils/pagination.js, never raw user input — safe to inline.
  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const [rows] = await pool.execute(
    `SELECT id, triggered_price, threshold_price_snapshot, condition_type_snapshot,
            notification_channel, delivery_status, triggered_at
     FROM alert_events
     WHERE business_id = ?
     ORDER BY triggered_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [businessId]
  );
  return rows;
}
async function create({
  alertRuleId,
  businessId,
  trackedMaterialId,
  triggeredPrice,
  thresholdPriceSnapshot,
  conditionTypeSnapshot,
  notificationChannel = 'EMAIL',
  deliveryStatus = 'PENDING',
}) {
  const [result] = await pool.execute(
    `INSERT INTO alert_events (
      alert_rule_id,
      business_id,
      tracked_material_id,
      triggered_price,
      threshold_price_snapshot,
      condition_type_snapshot,
      notification_channel,
      delivery_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alertRuleId,
      businessId,
      trackedMaterialId,
      triggeredPrice,
      thresholdPriceSnapshot,
      conditionTypeSnapshot,
      notificationChannel,
      deliveryStatus,
    ]
  );

  const [rows] = await pool.execute(
    `SELECT
      id,
      alert_rule_id,
      business_id,
      tracked_material_id,
      triggered_price,
      threshold_price_snapshot,
      condition_type_snapshot,
      notification_channel,
      delivery_status,
      delivery_attempted_at,
      triggered_at
     FROM alert_events
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );

  return rows[0] || null;
}
async function countByBusinessId(businessId) {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM alert_events WHERE business_id = ?',
    [businessId]
  );
  return rows[0].total;
}
async function updateDeliveryStatus(eventId, deliveryStatus) {
  await pool.execute(
    `UPDATE alert_events
     SET delivery_status = ?, delivery_attempted_at = NOW()
     WHERE id = ?`,
    [deliveryStatus, eventId]
  );

  const [rows] = await pool.execute(
    `SELECT
      id,
      alert_rule_id,
      business_id,
      tracked_material_id,
      triggered_price,
      threshold_price_snapshot,
      condition_type_snapshot,
      notification_channel,
      delivery_status,
      delivery_attempted_at,
      triggered_at
     FROM alert_events
     WHERE id = ?
     LIMIT 1`,
    [eventId]
  );

  return rows[0] || null;
}

module.exports = {
  listByBusinessId,
  countByBusinessId,
  create,
  updateDeliveryStatus,
};
