/**
 * units_of_measurement table (Document 4 §5.3).
 */
const up = `
CREATE TABLE IF NOT EXISTS units_of_measurement (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_units_name (name),
  UNIQUE KEY uq_units_abbreviation (abbreviation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS units_of_measurement;`;
module.exports = { up, down };
