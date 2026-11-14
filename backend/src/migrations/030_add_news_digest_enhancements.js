'use strict';

/**
 * Migration 030 — T-08: Supplier Recommendations & Periodic News Digest (FR-ALERT-06).
 *
 * Adds news digest and procurement schema enhancements:
 *   1. `businesses`:
 *      - news_digest_channel: ENUM('EMAIL', 'WHATSAPP', 'BOTH') NOT NULL DEFAULT 'EMAIL'
 *      - last_digest_sent_at: DATETIME NULL DEFAULT NULL
 *
 *   2. `sync_statuses`:
 *      - job_type ENUM widened to include 'NEWS_DIGEST'
 *
 * Backward-compatibility:
 *   - Existing businesses default to 'EMAIL' and NULL last_digest_sent_at.
 *   - Idempotent via information_schema.COLUMNS checks.
 */

async function up(pool) {
  // 1. businesses: add news_digest_channel and last_digest_sent_at if not present
  const [bizCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'businesses'
       AND COLUMN_NAME = 'news_digest_channel'`
  );

  if (bizCols[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE businesses
        ADD COLUMN news_digest_channel ENUM('EMAIL','WHATSAPP','BOTH') NOT NULL DEFAULT 'EMAIL' AFTER news_digest_frequency,
        ADD COLUMN last_digest_sent_at DATETIME NULL DEFAULT NULL AFTER news_digest_channel
    `);
    console.log('[migrate] Added news_digest_channel and last_digest_sent_at to businesses');
  } else {
    console.log('[migrate] businesses news digest columns already present — skipping');
  }

  // 2. sync_statuses: widen job_type ENUM to include NEWS_DIGEST
  await pool.query(`
    ALTER TABLE sync_statuses
      MODIFY COLUMN job_type ENUM('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS','ALERT_EVALUATION','NEWS_DIGEST') NOT NULL
  `);
  console.log('[migrate] Widened sync_statuses.job_type to include NEWS_DIGEST');
}

async function down(pool) {
  // 1. businesses: drop last_digest_sent_at and news_digest_channel
  const [bizCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'businesses'
       AND COLUMN_NAME = 'news_digest_channel'`
  );

  if (bizCols[0].cnt > 0) {
    await pool.query(`
      ALTER TABLE businesses
        DROP COLUMN last_digest_sent_at,
        DROP COLUMN news_digest_channel
    `);
    console.log('[migrate] Rolled back businesses news_digest_channel and last_digest_sent_at');
  }

  // 2. sync_statuses: revert job_type ENUM
  try {
    await pool.query(`
      ALTER TABLE sync_statuses
        MODIFY COLUMN job_type ENUM('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS','ALERT_EVALUATION') NOT NULL
    `);
    console.log('[migrate] Reverted sync_statuses.job_type to exclude NEWS_DIGEST');
  } catch (err) {
    console.warn('[migrate] Reverting sync_statuses.job_type failed (may have active NEWS_DIGEST records):', err.message);
  }
}

module.exports = { up, down };
