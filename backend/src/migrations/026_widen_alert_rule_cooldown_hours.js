/**
 * Migration 026 — Phase 14 Remediation: Widen alert_rules.cooldown_hours.
 *
 * Background:
 *   Migration 023 added `cooldown_hours` as TINYINT UNSIGNED (MySQL max 255),
 *   whereas application validators and UI permit values from 1 to 720 hours.
 *   This forward-only migration widens the column to SMALLINT UNSIGNED (0..65535)
 *   while preserving all existing values and the NOT NULL DEFAULT 24 constraint.
 *
 * Idempotency:
 *   Inspects information_schema.COLUMNS DATA_TYPE so re-running safely skips if
 *   already widened beyond TINYINT.
 *
 * Rollback limitation:
 *   down() checks for any rows where cooldown_hours > 255 before narrowing back
 *   to TINYINT UNSIGNED. If any exist, down() refuses to execute and throws an
 *   error rather than silently truncating/corrupting rule settings.
 */

'use strict';

async function up(pool) {
  const [cols] = await pool.query(
    `SELECT DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_rules'
       AND COLUMN_NAME = 'cooldown_hours'`
  );

  if (!cols || cols.length === 0) {
    console.log('[migrate] alert_rules.cooldown_hours column not found — skipping');
    return;
  }

  const dataType = String(cols[0].DATA_TYPE || '').toLowerCase();
  if (dataType !== 'tinyint') {
    console.log(`[migrate] alert_rules.cooldown_hours is already ${dataType} — skipping`);
    return;
  }

  await pool.query(`
    ALTER TABLE alert_rules
      MODIFY COLUMN cooldown_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24
  `);
  console.log('[migrate] Widened alert_rules.cooldown_hours from TINYINT UNSIGNED to SMALLINT UNSIGNED');
}

/**
 * Narrow alert_rules.cooldown_hours back to TINYINT UNSIGNED ONLY when no rows exceed 255.
 * Fails safely if any row has cooldown_hours > 255 to prevent silent truncation.
 */
async function down(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM alert_rules
     WHERE cooldown_hours > 255`
  );

  const countAbove255 = Number(rows?.[0]?.cnt || 0);
  if (countAbove255 > 0) {
    throw new Error(
      `[migrate] Cannot roll back alert_rules.cooldown_hours to TINYINT UNSIGNED: ` +
      `${countAbove255} row(s) have cooldown_hours > 255 and would be truncated.`
    );
  }

  await pool.query(`
    ALTER TABLE alert_rules
      MODIFY COLUMN cooldown_hours TINYINT UNSIGNED NOT NULL DEFAULT 24
  `);
  console.log('[migrate] Rolled back alert_rules.cooldown_hours to TINYINT UNSIGNED');
}

module.exports = { up, down };
