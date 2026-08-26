/**
 * external_factors table (Document 4 §5.3) — KB master list per industry.
 */
const up = `
CREATE TABLE IF NOT EXISTS external_factors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  industry_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_external_factors_industry_name (industry_id, name),
  CONSTRAINT fk_external_factors_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS external_factors;`;
module.exports = { up, down };
