/**
 * sync_statuses table (Document 4 §5.7) — last attempted/successful run of
 * each scheduled ingestion job (FR-DASH-04). Global, not per-business.
 * Populated by PriceIngestionService/NewsIngestionService (Document 3 §8,
 * §9) — both explicitly out of scope through Phase 10. This table will
 * exist but stay empty until those jobs are implemented in a later phase.
 */
const up = `
CREATE TABLE IF NOT EXISTS sync_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type ENUM('PRICE_INGESTION','NEWS_INGESTION') NOT NULL,
  last_run_at DATETIME NULL,
  last_success_at DATETIME NULL,
  last_status ENUM('SUCCESS','FAILED') NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sync_statuses_job_type (job_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS sync_statuses;`;
module.exports = { up, down };
