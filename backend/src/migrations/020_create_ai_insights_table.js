/**
 * Migration 020 - Phase H: AI Market Intelligence Agent.
 *
 * Two changes:
 *
 * 1. CREATE TABLE ai_insights -- stores one LLM-generated insight card per
 *    tracked material per job run. Columns typed individually (not JSON blob),
 *    consistent with alert_events, price_points, news_items. This enforces
 *    enum values at DB layer (outlook, confidence) and avoids JSON parsing
 *    on the read path.
 *
 *    business_id is denormalized (same rationale as alert_events.business_id,
 *    Document 4 para 2.2): dashboard reads need business_id without a join
 *    through tracked_materials.
 *
 *    evidence_* columns are computed server-side before the LLM call and
 *    stored independently, so they are verifiable and cannot be hallucinated.
 *
 *    Historical rows are retained (no UNIQUE per material) -- the read path
 *    uses ORDER BY generated_at DESC to fetch the latest. History is kept for
 *    Phase I forecasting (trend-of-insights analysis).
 *
 * 2. ALTER TABLE sync_statuses -- adds 'AI_INSIGHTS' to the job_type ENUM.
 *    In MySQL 8.0+ this is a fast metadata operation (no table rebuild).
 *    The AI insight job uses the same sync_status upsert pattern as the
 *    price and news ingestion jobs (syncStatus.repository.js).
 *
 * up(pool) follows the function-form pattern from migration 019 because two
 * DDL statements must run sequentially (migrate.js checks typeof up === 'function').
 */

async function up(pool) {
  await pool.execute(
    "CREATE TABLE IF NOT EXISTS ai_insights (" +
    "  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT," +
    "  tracked_material_id BIGINT UNSIGNED NOT NULL," +
    "  business_id         BIGINT UNSIGNED NOT NULL," +
    "  headline        VARCHAR(500) NOT NULL," +
    "  what_happened   TEXT NOT NULL," +
    "  why_it_happened TEXT NOT NULL," +
    "  business_impact TEXT NOT NULL," +
    "  outlook    ENUM('BEARISH','NEUTRAL','BULLISH','VOLATILE') NOT NULL," +
    "  confidence ENUM('LOW','MEDIUM','HIGH') NOT NULL," +
    "  evidence_price_range        VARCHAR(100) NULL," +
    "  evidence_price_points_count TINYINT UNSIGNED NOT NULL DEFAULT 0," +
    "  evidence_news_count         TINYINT UNSIGNED NOT NULL DEFAULT 0," +
    "  model_used   VARCHAR(100) NOT NULL," +
    "  generated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP," +
    "  PRIMARY KEY (id)," +
    "  KEY idx_ai_insights_material_generated (tracked_material_id, generated_at DESC)," +
    "  KEY idx_ai_insights_business_generated (business_id, generated_at DESC)," +
    "  CONSTRAINT fk_ai_insights_material" +
    "    FOREIGN KEY (tracked_material_id) REFERENCES tracked_materials(id) ON DELETE CASCADE," +
    "  CONSTRAINT fk_ai_insights_business" +
    "    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  );

  await pool.execute(
    "ALTER TABLE sync_statuses" +
    "  MODIFY COLUMN job_type" +
    "    ENUM('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS') NOT NULL"
  );
}

// down() receives pool for consistency but only needs it for the ALTER;
// DROP TABLE IF EXISTS is DDL that does not require a prior SELECT.
async function down(pool) {
  await pool.execute("DROP TABLE IF EXISTS ai_insights");
  await pool.execute(
    "ALTER TABLE sync_statuses" +
    "  MODIFY COLUMN job_type" +
    "    ENUM('PRICE_INGESTION','NEWS_INGESTION') NOT NULL"
  );
}

module.exports = { up, down };
