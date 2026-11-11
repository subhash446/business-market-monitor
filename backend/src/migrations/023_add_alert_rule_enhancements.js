/**
 * Migration 023 - Phase 2: Alert Rule Enhancements & Cooldown Pipeline.
 *
 * Enhancements:
 *   1. alert_rules:
 *      - threshold_type: ENUM('ABSOLUTE', 'PERCENTAGE') NOT NULL DEFAULT 'ABSOLUTE'
 *      - cooldown_hours: TINYINT UNSIGNED NOT NULL DEFAULT 24
 *      - last_triggered_at: DATETIME NULL DEFAULT NULL
 *
 *   2. alert_events:
 *      - threshold_type_snapshot: ENUM('ABSOLUTE', 'PERCENTAGE') NOT NULL DEFAULT 'ABSOLUTE'
 *      - triggered_change_percent: DECIMAL(8,4) NULL DEFAULT NULL
 *
 *   3. sync_statuses:
 *      - Extends job_type ENUM to include 'ALERT_EVALUATION' for the cron job.
 *
 * Backward-compatibility:
 *   - All new columns on alert_rules and alert_events have sensible defaults
 *     ('ABSOLUTE', 24 hours cooldown, NULL triggered percent).
 *   - Idempotent via information_schema check.
 */

async function up(pool) {
  // 1. alert_rules check
  const [ruleCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_rules'
       AND COLUMN_NAME = 'threshold_type'`
  );

  if (ruleCols[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE alert_rules
        ADD COLUMN threshold_type    ENUM('ABSOLUTE','PERCENTAGE') NOT NULL DEFAULT 'ABSOLUTE' AFTER threshold_price,
        ADD COLUMN cooldown_hours    TINYINT UNSIGNED NOT NULL DEFAULT 24 AFTER threshold_type,
        ADD COLUMN last_triggered_at DATETIME NULL DEFAULT NULL AFTER cooldown_hours
    `);
    console.log('[migrate] Added threshold_type, cooldown_hours, last_triggered_at to alert_rules');
  }

  // 2. alert_events check
  const [eventCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_events'
       AND COLUMN_NAME = 'threshold_type_snapshot'`
  );

  if (eventCols[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE alert_events
        ADD COLUMN threshold_type_snapshot   ENUM('ABSOLUTE','PERCENTAGE') NOT NULL DEFAULT 'ABSOLUTE' AFTER condition_type_snapshot,
        ADD COLUMN triggered_change_percent  DECIMAL(8,4) NULL DEFAULT NULL AFTER threshold_type_snapshot
    `);
    console.log('[migrate] Added threshold_type_snapshot, triggered_change_percent to alert_events');
  }

  // 3. sync_statuses job_type check & update
  await pool.query(`
    ALTER TABLE sync_statuses
      MODIFY COLUMN job_type ENUM('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS','ALERT_EVALUATION') NOT NULL
  `);
  console.log('[migrate] Updated sync_statuses.job_type to include ALERT_EVALUATION');
}

async function down(pool) {
  try {
    await pool.query(`
      ALTER TABLE alert_rules
        DROP COLUMN threshold_type,
        DROP COLUMN cooldown_hours,
        DROP COLUMN last_triggered_at
    `);
  } catch (_) {}

  try {
    await pool.query(`
      ALTER TABLE alert_events
        DROP COLUMN threshold_type_snapshot,
        DROP COLUMN triggered_change_percent
    `);
  } catch (_) {}

  try {
    await pool.query(`
      ALTER TABLE sync_statuses
        MODIFY COLUMN job_type ENUM('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS') NOT NULL
    `);
  } catch (_) {}
}

module.exports = { up, down };
