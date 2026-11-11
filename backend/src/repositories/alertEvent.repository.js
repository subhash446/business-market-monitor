/**
 * All queries against `alert_events` (Document 4 §5.6).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Phase 2 enhancements:
 *   - threshold_type_snapshot
 *   - triggered_change_percent
 */
const { pool } = require('../database/connection');

async function listByBusinessId(businessId, { limit, offset }) {
  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const [rows] = await pool.execute(
    `SELECT id, alert_rule_id, business_id, tracked_material_id,
            triggered_price, threshold_price_snapshot, condition_type_snapshot,
            threshold_type_snapshot, triggered_change_percent,
            notification_channel, delivery_status, delivery_attempted_at, triggered_at
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
  thresholdTypeSnapshot = 'ABSOLUTE',
  triggeredChangePercent = null,
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
      threshold_type_snapshot,
      triggered_change_percent,
      notification_channel,
      delivery_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alertRuleId,
      businessId,
      trackedMaterialId,
      triggeredPrice,
      thresholdPriceSnapshot,
      conditionTypeSnapshot,
      thresholdTypeSnapshot,
      triggeredChangePercent,
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
      threshold_type_snapshot,
      triggered_change_percent,
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
      threshold_type_snapshot,
      triggered_change_percent,
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
