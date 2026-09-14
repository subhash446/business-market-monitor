/**
 * Phase A (Automatic Price Ingestion): add external_symbol column to
 * tracked_materials so a business can explicitly link a tracked material
 * to a commodity symbol supported by an external price provider (e.g.
 * 'WTI', 'BRENT').
 *
 * Design decisions:
 * - Nullable VARCHAR — most materials have no external symbol (custom
 *   materials, packaging, resins, etc.). NULL means "no external ingestion."
 * - Not a DB-enforced enum — supported symbols are defined in
 *   src/config/commodityMapping.js and validated at the application layer,
 *   so adding a new provider symbol never requires a schema migration.
 * - No UNIQUE constraint on (business_id, external_symbol): a business
 *   can track the same commodity in multiple units — both would receive the
 *   same external price. Not forbidden.
 * - Backward compatible: default NULL means all existing rows are
 *   unchanged and unaffected. No data migration required.
 *
 * Idempotency: exported as an async function so the migration runner passes
 * the pool directly. We check information_schema before altering, which is
 * the correct MySQL 8.0 pattern (ADD COLUMN IF NOT EXISTS is MariaDB-only).
 * Safe to run multiple times.
 */

async function up(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tracked_materials'
       AND COLUMN_NAME = 'external_symbol'`
  );
  if (rows[0].cnt > 0) {
    console.log('[migrate] external_symbol column already exists — skipping ADD COLUMN');
    return;
  }
  await pool.query(`
    ALTER TABLE tracked_materials
      ADD COLUMN external_symbol VARCHAR(50) NULL DEFAULT NULL
      AFTER custom_name
  `);
}

const down = `
ALTER TABLE tracked_materials
  DROP COLUMN IF EXISTS external_symbol;
`;

module.exports = { up, down };
