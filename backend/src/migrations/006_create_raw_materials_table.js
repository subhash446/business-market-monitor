/**
 * raw_materials table (Document 4 §5.3) — KB master list per industry.
 */
const up = `
CREATE TABLE IF NOT EXISTS raw_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  industry_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  default_unit_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_raw_materials_industry_name (industry_id, name),
  CONSTRAINT fk_raw_materials_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT,
  CONSTRAINT fk_raw_materials_unit FOREIGN KEY (default_unit_id) REFERENCES units_of_measurement(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS raw_materials;`;
module.exports = { up, down };
