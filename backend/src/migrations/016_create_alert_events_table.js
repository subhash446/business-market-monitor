/**
 * alert_events table (Document 4 §5.6) — immutable audit history of every
 * alert fired (FR-ALERT-03, 04, 08). business_id is a deliberate
 * denormalization (Document 4 §2.2) for the high-frequency "recent alerts
 * for business X" read path, avoiding a join through alert_rules.
 * alert_rule_id is ON DELETE RESTRICT, forcing soft-delete as the only
 * practical path for a rule with history (Document 4 §10.1).
 *
 * No rows are ever written by this phase — the evaluation engine that
 * would populate this table is explicitly out of scope (Phase 9 approved
 * decisions #5-8). The table exists so GET /alerts/events is real and
 * testable (correctly empty) now, ready for that engine later.
 */
const up = `
CREATE TABLE IF NOT EXISTS alert_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alert_rule_id BIGINT UNSIGNED NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  tracked_material_id BIGINT UNSIGNED NOT NULL,
  triggered_price DECIMAL(12,4) NOT NULL,
  threshold_price_snapshot DECIMAL(12,4) NOT NULL,
  condition_type_snapshot ENUM('PRICE_ABOVE','PRICE_BELOW') NOT NULL,
  notification_channel ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
  delivery_status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  delivery_attempted_at DATETIME NULL,
  triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alert_events_business_triggered (business_id, triggered_at DESC),
  KEY idx_alert_events_rule (alert_rule_id),
  CONSTRAINT fk_alert_events_rule FOREIGN KEY (alert_rule_id) REFERENCES alert_rules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_alert_events_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_events_material FOREIGN KEY (tracked_material_id) REFERENCES tracked_materials(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS alert_events;`;
module.exports = { up, down };
