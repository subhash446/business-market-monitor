/**
 * alert_rules table (Document 4 §5.6) — user-defined alert conditions
 * (FR-ALERT-01, 05). Soft-delete only (deleted_at) — Document 4 §12.2:
 * hard deletion is intentionally unsupported, to keep alert_events history
 * intact via ON DELETE RESTRICT on that table's FK to this one.
 */
const up = `
CREATE TABLE IF NOT EXISTS alert_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  tracked_material_id BIGINT UNSIGNED NOT NULL,
  condition_type ENUM('PRICE_ABOVE','PRICE_BELOW') NOT NULL,
  threshold_price DECIMAL(12,4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alert_rules_material_active (tracked_material_id, is_active),
  KEY idx_alert_rules_business (business_id),
  CONSTRAINT fk_alert_rules_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_rules_material FOREIGN KEY (tracked_material_id) REFERENCES tracked_materials(id) ON DELETE RESTRICT,
  CONSTRAINT chk_alert_rules_threshold_positive CHECK (threshold_price > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS alert_rules;`;
module.exports = { up, down };
