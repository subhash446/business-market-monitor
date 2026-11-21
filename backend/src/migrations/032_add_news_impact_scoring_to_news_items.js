'use strict';

/**
 * Migration 032 — V3 Milestone 2: News-to-Price Impact Scoring & 14/30-Day Directional Price Band Engine.
 *
 * Adds 6 structured impact scoring columns and an index to `news_items`:
 *   - impact_direction: ENUM('COST_UP', 'COST_DOWN', 'NEUTRAL') NULL DEFAULT NULL
 *   - severity_score: TINYINT UNSIGNED NULL DEFAULT NULL
 *   - expected_lag_days: SMALLINT UNSIGNED NULL DEFAULT NULL
 *   - impact_rationale: VARCHAR(500) NULL DEFAULT NULL
 *   - scoring_method: ENUM('DETERMINISTIC_HEURISTIC', 'AI_ASSISTED') NULL DEFAULT NULL
 *   - impact_scored_at: DATETIME NULL DEFAULT NULL
 *   - Index: idx_news_items_impact (impact_direction, severity_score, published_at DESC)
 *
 * Design decisions:
 *   - Additive & backward-compatible: all columns default to NULL.
 *   - Idempotent: checks information_schema.COLUMNS and information_schema.STATISTICS in both up() and down().
 */

const IMPACT_COLUMNS = [
  { name: 'impact_direction', sql: "ADD COLUMN impact_direction ENUM('COST_UP', 'COST_DOWN', 'NEUTRAL') NULL DEFAULT NULL AFTER published_at" },
  { name: 'severity_score', sql: 'ADD COLUMN severity_score TINYINT UNSIGNED NULL DEFAULT NULL AFTER impact_direction' },
  { name: 'expected_lag_days', sql: 'ADD COLUMN expected_lag_days SMALLINT UNSIGNED NULL DEFAULT NULL AFTER severity_score' },
  { name: 'impact_rationale', sql: 'ADD COLUMN impact_rationale VARCHAR(500) NULL DEFAULT NULL AFTER expected_lag_days' },
  { name: 'scoring_method', sql: "ADD COLUMN scoring_method ENUM('DETERMINISTIC_HEURISTIC', 'AI_ASSISTED') NULL DEFAULT NULL AFTER impact_rationale" },
  { name: 'impact_scored_at', sql: 'ADD COLUMN impact_scored_at DATETIME NULL DEFAULT NULL AFTER scoring_method' },
];

async function up(pool) {
  for (const col of IMPACT_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'news_items'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt === 0) {
      await pool.query(`ALTER TABLE news_items ${col.sql}`);
      console.log(`[migrate] Added column news_items.${col.name}`);
    } else {
      console.log(`[migrate] Column news_items.${col.name} already exists — skipping`);
    }
  }

  // Add index idx_news_items_impact if not present
  const [idxRows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'news_items'
       AND INDEX_NAME = 'idx_news_items_impact'`
  );
  if (idxRows[0].cnt === 0) {
    await pool.query('ALTER TABLE news_items ADD KEY idx_news_items_impact (impact_direction, severity_score, published_at DESC)');
    console.log('[migrate] Added index idx_news_items_impact to news_items');
  } else {
    console.log('[migrate] Index idx_news_items_impact already exists — skipping');
  }
}

async function down(pool) {
  // Drop index idx_news_items_impact if present
  const [idxRows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'news_items'
       AND INDEX_NAME = 'idx_news_items_impact'`
  );
  if (idxRows[0].cnt > 0) {
    await pool.query('ALTER TABLE news_items DROP KEY idx_news_items_impact');
    console.log('[migrate] Dropped index idx_news_items_impact from news_items');
  } else {
    console.log('[migrate] Index idx_news_items_impact already absent — skipping');
  }

  for (const col of [...IMPACT_COLUMNS].reverse()) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'news_items'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt > 0) {
      await pool.query(`ALTER TABLE news_items DROP COLUMN ${col.name}`);
      console.log(`[migrate] Dropped column news_items.${col.name}`);
    } else {
      console.log(`[migrate] Column news_items.${col.name} already absent — skipping`);
    }
  }
}

module.exports = { up, down, IMPACT_COLUMNS };
