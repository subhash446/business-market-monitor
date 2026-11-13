'use strict';

/**
 * Migration 028 — V2-01C: Procurement Action Recommendations (Phase H Enhancement).
 *
 * Adds additive procurement decision-support columns to `ai_insights`:
 *   - action_recommendation: ENUM('ACCELERATE_PURCHASE', 'DELAY_PURCHASE', 'MAINTAIN_BUFFER', 'MONITOR_ONLY') NULL DEFAULT NULL
 *   - recommendation_rationale: TEXT NULL DEFAULT NULL
 *   - recommendation_horizon: ENUM('IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM') NULL DEFAULT NULL
 *   - is_downgraded: BOOLEAN NOT NULL DEFAULT FALSE
 *   - downgrade_reason: VARCHAR(100) NULL DEFAULT NULL
 *
 * Backward-compatibility:
 *   - All new columns are nullable or have safe defaults (is_downgraded = FALSE).
 *   - Existing historical rows from Migration 020 remain 100% valid with NULL recommendations.
 *   - Idempotent via information_schema.COLUMNS check.
 */

async function up(pool) {
  const [cols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ai_insights'
       AND COLUMN_NAME = 'action_recommendation'`
  );

  if (cols[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE ai_insights
        ADD COLUMN action_recommendation    ENUM('ACCELERATE_PURCHASE','DELAY_PURCHASE','MAINTAIN_BUFFER','MONITOR_ONLY') NULL DEFAULT NULL AFTER confidence,
        ADD COLUMN recommendation_rationale TEXT NULL DEFAULT NULL AFTER action_recommendation,
        ADD COLUMN recommendation_horizon   ENUM('IMMEDIATE','SHORT_TERM','MEDIUM_TERM') NULL DEFAULT NULL AFTER recommendation_rationale,
        ADD COLUMN is_downgraded            BOOLEAN NOT NULL DEFAULT FALSE AFTER recommendation_horizon,
        ADD COLUMN downgrade_reason         VARCHAR(100) NULL DEFAULT NULL AFTER is_downgraded
    `);
    console.log('[migrate] Added action_recommendation, recommendation_rationale, recommendation_horizon, is_downgraded, downgrade_reason to ai_insights');
  } else {
    console.log('[migrate] ai_insights procurement columns already present — skipping');
  }
}

async function down(pool) {
  const [cols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ai_insights'
       AND COLUMN_NAME = 'action_recommendation'`
  );

  if (cols[0].cnt > 0) {
    await pool.query(`
      ALTER TABLE ai_insights
        DROP COLUMN downgrade_reason,
        DROP COLUMN is_downgraded,
        DROP COLUMN recommendation_horizon,
        DROP COLUMN recommendation_rationale,
        DROP COLUMN action_recommendation
    `);
    console.log('[migrate] Rolled back ai_insights procurement columns');
  }
}

module.exports = { up, down };
