/**
 * knowledge_base_dependencies table (Document 4 §5.3, §7).
 * Polymorphic edges between raw_materials / cost_drivers / external_factors
 * (FR-IKB-02, FR-IKB-05). source/target entity_id are NOT native FKs — MySQL
 * cannot enforce a single FK across three conditionally-different target
 * tables (Document 4 §7.2). Integrity is enforced at the application layer
 * (knowledgeBase.service.js validates existence during seeding).
 * Multi-level traversal strategy: Adjacency List + Recursive CTEs, no
 * closure table in V1 (Document 4 §7.3, final decision).
 */
const up = `
CREATE TABLE IF NOT EXISTS knowledge_base_dependencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  industry_id BIGINT UNSIGNED NOT NULL,
  source_entity_type ENUM('RAW_MATERIAL','COST_DRIVER','EXTERNAL_FACTOR') NOT NULL,
  source_entity_id BIGINT UNSIGNED NOT NULL,
  target_entity_type ENUM('RAW_MATERIAL','COST_DRIVER','EXTERNAL_FACTOR') NOT NULL,
  target_entity_id BIGINT UNSIGNED NOT NULL,
  dependency_type ENUM('DRIVES_COST','INFLUENCES','CORRELATES_WITH') NOT NULL DEFAULT 'INFLUENCES',
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kb_dependencies_edge (source_entity_type, source_entity_id, target_entity_type, target_entity_id, dependency_type),
  KEY idx_kb_dependencies_source (source_entity_type, source_entity_id),
  KEY idx_kb_dependencies_target (target_entity_type, target_entity_id),
  KEY idx_kb_dependencies_industry (industry_id),
  CONSTRAINT fk_kb_dependencies_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS knowledge_base_dependencies;`;
module.exports = { up, down };
