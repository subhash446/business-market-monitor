/**
 * Migration 021 - Phase 1: Data Integrity & Price Metadata.
 *
 * Adds metadata columns to `price_points` to eliminate proxy benchmark
 * mislabelling (e.g. WTI/Brent crude USD/bbl recorded as Indian packaging prices).
 *
 * Added columns:
 *   - currency:        CHAR(3) NULL (e.g. 'USD', 'INR')
 *   - unit_label:      VARCHAR(30) NULL (e.g. 'USD/bbl', 'kg', 'pcs')
 *   - region:          VARCHAR(100) NULL (e.g. 'Cushing, OK', 'Domestic (India)')
 *   - grade:           VARCHAR(100) NULL (specification or grade)
 *   - provider_name:   VARCHAR(100) NULL (e.g. 'U.S. Energy Information Administration (EIA)')
 *   - source_url:      VARCHAR(500) NULL (provenance link)
 *   - data_class:      ENUM('OFFICIAL_BENCHMARK','MARKET_INDICATIVE','SUPPLIER_QUOTE') NULL
 *   - is_valid:        BOOLEAN NOT NULL DEFAULT TRUE
 *   - invalid_reason:  VARCHAR(200) NULL
 *
 * Backward-compatibility:
 *   - All new columns default to NULL or TRUE.
 *   - Existing rows are backfilled safely based on source:
 *     * THIRD_PARTY_API rows -> MARKET_INDICATIVE, USD, USD/bbl, EIA provider
 *     * MANUAL rows -> SUPPLIER_QUOTE, INR, material unit
 *
 * Idempotent via information_schema check.
 */

async function up(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'price_points'
       AND COLUMN_NAME = 'currency'`
  );
  if (rows[0].cnt > 0) {
    console.log('[migrate] price_points metadata columns already exist — skipping ADD COLUMN');
    return;
  }

  await pool.query(`
    ALTER TABLE price_points
      ADD COLUMN currency        CHAR(3)      NULL DEFAULT NULL AFTER price,
      ADD COLUMN unit_label      VARCHAR(30)  NULL DEFAULT NULL AFTER currency,
      ADD COLUMN region          VARCHAR(100) NULL DEFAULT NULL AFTER unit_label,
      ADD COLUMN grade           VARCHAR(100) NULL DEFAULT NULL AFTER region,
      ADD COLUMN provider_name   VARCHAR(100) NULL DEFAULT NULL AFTER grade,
      ADD COLUMN source_url      VARCHAR(500) NULL DEFAULT NULL AFTER provider_name,
      ADD COLUMN data_class      ENUM('OFFICIAL_BENCHMARK','MARKET_INDICATIVE','SUPPLIER_QUOTE') NULL DEFAULT NULL AFTER source_url,
      ADD COLUMN is_valid        BOOLEAN NOT NULL DEFAULT TRUE AFTER data_class,
      ADD COLUMN invalid_reason  VARCHAR(200) NULL DEFAULT NULL AFTER is_valid
  `);

  // Backfill existing rows with appropriate metadata based on source
  await pool.query(`
    UPDATE price_points p
    JOIN tracked_materials tm ON tm.id = p.tracked_material_id
    SET p.currency = 'USD',
        p.unit_label = 'USD/bbl',
        p.data_class = 'MARKET_INDICATIVE',
        p.provider_name = 'U.S. Energy Information Administration (EIA)',
        p.source_url = 'https://www.eia.gov',
        p.region = IF(tm.external_symbol = 'WTI', 'Cushing, OK', 'Europe'),
        p.grade = IF(tm.external_symbol = 'WTI', 'Light Sweet Crude Oil', 'Brent Crude Oil')
    WHERE p.source = 'THIRD_PARTY_API' AND p.currency IS NULL
  `);

  await pool.query(`
    UPDATE price_points p
    JOIN tracked_materials tm ON tm.id = p.tracked_material_id
    JOIN units_of_measurement u ON u.id = tm.unit_id
    SET p.currency = 'INR',
        p.unit_label = u.abbreviation,
        p.data_class = 'SUPPLIER_QUOTE',
        p.provider_name = 'Manual Supplier Entry'
    WHERE p.source = 'MANUAL' AND p.currency IS NULL
  `);
}

async function down(pool) {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'price_points'
       AND COLUMN_NAME IN ('currency','unit_label','region','grade','provider_name','source_url','data_class','is_valid','invalid_reason')`
  );
  for (const col of cols) {
    await pool.query(`ALTER TABLE price_points DROP COLUMN ${col.COLUMN_NAME}`);
  }
}

module.exports = { up, down };
