/**
 * price_points table (Document 4 §5.4) — immutable time-series price history
 * (FR-PRICE-01–05). No application-level UPDATE/DELETE is ever permitted on
 * this table (FR-PRICE-05); enforced by convention in price.repository.js,
 * not by a DB trigger (Document 4 §12.2, confirmed decision).
 */
const up = `
CREATE TABLE IF NOT EXISTS price_points (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tracked_material_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(12,4) NOT NULL,
  recorded_at DATETIME NOT NULL,
  source ENUM('MANUAL','GOVERNMENT_DATASET','THIRD_PARTY_API','SUPPLIER_INTEGRATION','WEB_SCRAPE') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_price_points_material_recorded (tracked_material_id, recorded_at DESC),
  CONSTRAINT fk_price_points_tracked_material FOREIGN KEY (tracked_material_id) REFERENCES tracked_materials(id) ON DELETE RESTRICT,
  CONSTRAINT chk_price_points_price_positive CHECK (price > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS price_points;`;
module.exports = { up, down };
