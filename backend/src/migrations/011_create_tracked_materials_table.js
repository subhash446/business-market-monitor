/**
 * tracked_materials table (Document 4 §5.4) — a business's actual monitored
 * materials. This table IS the materialized Industry Template (FR-TPL-01–03)
 * as well as the future Material Tracking list (FR-MAT-01–04) — there is no
 * separate "template" table, by design (Document 4 §5.4).
 *
 * Implemented now (Phase 5, Template Generation) because generation writes
 * directly to this table. The CHECK constraint mirrors Document 4 §10.4
 * exactly (raw_material_id OR custom_name must be set).
 */
const up = `
CREATE TABLE IF NOT EXISTS tracked_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  raw_material_id BIGINT UNSIGNED NULL,
  custom_name VARCHAR(150) NULL,
  unit_id BIGINT UNSIGNED NOT NULL,
  is_tracked BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tracked_materials_business_tracked (business_id, is_tracked),
  KEY idx_tracked_materials_raw_material (raw_material_id),
  CONSTRAINT fk_tracked_materials_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_tracked_materials_raw_material FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tracked_materials_unit FOREIGN KEY (unit_id) REFERENCES units_of_measurement(id) ON DELETE RESTRICT,
  CONSTRAINT chk_tracked_materials_source CHECK (raw_material_id IS NOT NULL OR custom_name IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS tracked_materials;`;
module.exports = { up, down };
