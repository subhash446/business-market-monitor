'use strict';

/**
 * Migration 033 — V3 Milestone 3: Live USD/INR FX & Landed-Cost Normalization Engine.
 *
 * Adds:
 *   1. `fx_rates` table:
 *      - Stores daily base/quote exchange rates (e.g. USD/INR from Frankfurter / ECB).
 *      - Unique constraint on (base_currency, quote_currency, rate_date).
 *   2. Landed-cost columns on `tracked_materials`:
 *      - landed_unit_factor: DECIMAL(14, 6) NULL DEFAULT NULL
 *      - landed_duty_freight_pct: DECIMAL(6, 2) NULL DEFAULT NULL
 *      - landed_fixed_spread_inr: DECIMAL(12, 2) NULL DEFAULT NULL
 *      - landed_config_updated_at: DATETIME NULL DEFAULT NULL
 *   3. Widens `sync_statuses.job_type` ENUM to include 'FX_INGESTION'.
 *
 * Tech Lead Refinements Enforced:
 *   - Idempotent up() and down() using information_schema checks.
 *   - down() safely purges sync_statuses rows with job_type = 'FX_INGESTION' before narrowing ENUM.
 */

const LANDED_COLUMNS = [
  { name: 'landed_unit_factor', sql: 'ADD COLUMN landed_unit_factor DECIMAL(14, 6) NULL DEFAULT NULL AFTER inventory_updated_at' },
  { name: 'landed_duty_freight_pct', sql: 'ADD COLUMN landed_duty_freight_pct DECIMAL(6, 2) NULL DEFAULT NULL AFTER landed_unit_factor' },
  { name: 'landed_fixed_spread_inr', sql: 'ADD COLUMN landed_fixed_spread_inr DECIMAL(12, 2) NULL DEFAULT NULL AFTER landed_duty_freight_pct' },
  { name: 'landed_config_updated_at', sql: 'ADD COLUMN landed_config_updated_at DATETIME NULL DEFAULT NULL AFTER landed_fixed_spread_inr' },
];

async function up(pool) {
  // 1. Create fx_rates table if not exists
  const [fxTable] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'fx_rates'`
  );

  if (fxTable[0].cnt === 0) {
    await pool.query(`
      CREATE TABLE fx_rates (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        base_currency VARCHAR(3) NOT NULL,
        quote_currency VARCHAR(3) NOT NULL,
        rate DECIMAL(12, 6) NOT NULL,
        rate_date DATE NOT NULL,
        source VARCHAR(64) NOT NULL DEFAULT 'FRANKFURTER_ECB',
        fetched_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_fx_rates_pair_date (base_currency, quote_currency, rate_date),
        KEY idx_fx_rates_quote_date (quote_currency, rate_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[migrate] Created fx_rates table');
  } else {
    console.log('[migrate] fx_rates table already exists — skipping');
  }

  // 2. Add landed-cost columns to tracked_materials
  for (const col of LANDED_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tracked_materials'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt === 0) {
      await pool.query(`ALTER TABLE tracked_materials ${col.sql}`);
      console.log(`[migrate] Added column tracked_materials.${col.name}`);
    } else {
      console.log(`[migrate] Column tracked_materials.${col.name} already exists — skipping`);
    }
  }

  // 3. Widen sync_statuses.job_type ENUM to include 'FX_INGESTION'
  const [syncCols] = await pool.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'sync_statuses'
       AND COLUMN_NAME = 'job_type'`
  );

  if (syncCols.length > 0 && !syncCols[0].COLUMN_TYPE.includes('FX_INGESTION')) {
    await pool.query(`
      ALTER TABLE sync_statuses
        MODIFY COLUMN job_type ENUM(
          'PRICE_INGESTION',
          'NEWS_INGESTION',
          'AI_INSIGHTS',
          'ALERT_EVALUATION',
          'NEWS_DIGEST',
          'FX_INGESTION'
        ) NOT NULL
    `);
    console.log('[migrate] Widened sync_statuses.job_type to include FX_INGESTION');
  } else {
    console.log('[migrate] sync_statuses.job_type already includes FX_INGESTION — skipping');
  }
}

async function down(pool) {
  // 1. Purge FX_INGESTION rows before narrowing sync_statuses.job_type
  try {
    await pool.query(`DELETE FROM sync_statuses WHERE job_type = 'FX_INGESTION'`);
    console.log('[migrate] Purged sync_statuses records for FX_INGESTION');
  } catch (err) {
    console.warn('[migrate] Deleting sync_statuses FX_INGESTION records warning:', err.message);
  }

  // 2. Revert sync_statuses.job_type ENUM
  try {
    await pool.query(`
      ALTER TABLE sync_statuses
        MODIFY COLUMN job_type ENUM(
          'PRICE_INGESTION',
          'NEWS_INGESTION',
          'AI_INSIGHTS',
          'ALERT_EVALUATION',
          'NEWS_DIGEST'
        ) NOT NULL
    `);
    console.log('[migrate] Reverted sync_statuses.job_type to exclude FX_INGESTION');
  } catch (err) {
    console.warn('[migrate] Reverting sync_statuses.job_type warning:', err.message);
  }

  // 3. Drop landed-cost columns from tracked_materials
  for (const col of [...LANDED_COLUMNS].reverse()) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tracked_materials'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt > 0) {
      await pool.query(`ALTER TABLE tracked_materials DROP COLUMN ${col.name}`);
      console.log(`[migrate] Dropped column tracked_materials.${col.name}`);
    } else {
      console.log(`[migrate] Column tracked_materials.${col.name} already absent — skipping`);
    }
  }

  // 4. Drop fx_rates table if exists
  const [fxTable] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'fx_rates'`
  );

  if (fxTable[0].cnt > 0) {
    await pool.query(`DROP TABLE IF EXISTS fx_rates`);
    console.log('[migrate] Dropped fx_rates table');
  } else {
    console.log('[migrate] fx_rates table already absent — skipping');
  }
}

module.exports = { up, down, LANDED_COLUMNS };
