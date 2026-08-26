/**
 * industries table (Document 4 §5.3).
 *
 * Implemented narrowly in Phase 3 (Business Profile) because
 * businesses.industry_id has a hard FK dependency on it, and "validate
 * industryId exists" is explicitly in this phase's scope. This does NOT
 * mean the Knowledge Base module is implemented — raw_materials,
 * cost_drivers, external_factors, news_keywords, and
 * knowledge_base_dependencies (migrations 006-010) remain untouched TODOs.
 */
const up = `
CREATE TABLE IF NOT EXISTS industries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  is_anchor BOOLEAN NOT NULL DEFAULT FALSE,
  is_lightweight_template BOOLEAN NOT NULL DEFAULT FALSE,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_industries_name (name),
  UNIQUE KEY uq_industries_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const down = `DROP TABLE IF EXISTS industries;`;

module.exports = { up, down };
