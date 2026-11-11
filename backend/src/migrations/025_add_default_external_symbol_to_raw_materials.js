/**
 * Phase 5 (Automatic Business-to-Material Mapping):
 * Add default_external_symbol column to raw_materials table so that
 * standard industry template materials automatically carry their supported
 * external commodity symbol (e.g., 'WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI',
 * 'WTI', 'BRENT') upon business onboarding.
 *
 * Design decisions:
 * - Nullable VARCHAR(50) DEFAULT NULL: materials without automated external price
 *   feeds (e.g. Bottle Caps, Labels, Raw Milk) have NULL, meaning manual supplier quote.
 * - Idempotent: checks information_schema before adding the column.
 * - Updates existing seeded raw materials with their authentic external symbols.
 * - Reversible: drops column in down SQL.
 */

'use strict';

async function up(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'raw_materials'
       AND COLUMN_NAME = 'default_external_symbol'`
  );

  if (rows[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE raw_materials
        ADD COLUMN default_external_symbol VARCHAR(50) NULL DEFAULT NULL
        AFTER default_unit_id
    `);
    console.log('[migrate] Added default_external_symbol column to raw_materials');
  } else {
    console.log('[migrate] default_external_symbol column already exists on raw_materials — skipping ADD COLUMN');
  }

  // Populate default external symbols for authentic supported commodities
  // 1. Food & Beverage (Indian Government Agmarknet / data.gov.in)
  await pool.query(
    `UPDATE raw_materials SET default_external_symbol = 'WHEAT_GOI' WHERE name = 'Wheat'`
  );
  await pool.query(
    `UPDATE raw_materials SET default_external_symbol = 'SUGAR_GOI' WHERE name = 'Sugar'`
  );
  await pool.query(
    `UPDATE raw_materials SET default_external_symbol = 'EDIBLE_OIL_GOI' WHERE name = 'Edible Oil'`
  );

  // 2. Polymers / Plastics (EIA Upstream Crude Proxies)
  await pool.query(
    `UPDATE raw_materials SET default_external_symbol = 'WTI' WHERE name = 'PET Resin'`
  );
  await pool.query(
    `UPDATE raw_materials SET default_external_symbol = 'BRENT' WHERE name = 'HDPE Granules'`
  );
}

const down = `
ALTER TABLE raw_materials
  DROP COLUMN IF EXISTS default_external_symbol;
`;

module.exports = { up, down };
