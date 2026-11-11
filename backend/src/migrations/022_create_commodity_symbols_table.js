/**
 * Migration 022 - Phase 1: Reference table for Commodity Symbols.
 *
 * Creates the `commodity_symbols` catalog table to support multi-source
 * commodity indicators with explicit classifications, currencies, units,
 * and proxy notes.
 */

async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commodity_symbols (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      symbol        VARCHAR(50)  NOT NULL,
      display_name  VARCHAR(100) NOT NULL,
      provider      ENUM('EIA','MANUAL','GOVT_DATA','PLACEHOLDER') NOT NULL DEFAULT 'EIA',
      unit_label    VARCHAR(30)  NOT NULL,
      currency      CHAR(3)      NOT NULL DEFAULT 'USD',
      data_class    ENUM('OFFICIAL_BENCHMARK','MARKET_INDICATIVE','SUPPLIER_QUOTE') NOT NULL,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      notes         VARCHAR(500) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_symbol (symbol)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Seed reference data (idempotent via INSERT IGNORE)
  await pool.query(`
    INSERT IGNORE INTO commodity_symbols
      (symbol, display_name, provider, unit_label, currency, data_class, is_active, notes)
    VALUES
      ('WTI', 'WTI Crude Oil (Cushing, OK)', 'EIA', 'USD/bbl', 'USD', 'OFFICIAL_BENCHMARK', 1, 'Global crude oil benchmark in USD per barrel. Used as a feedstock/proxy indicator.'),
      ('BRENT', 'Brent Crude Oil (Europe Spot)', 'EIA', 'USD/bbl', 'USD', 'OFFICIAL_BENCHMARK', 1, 'International crude oil benchmark in USD per barrel.'),
      ('NAPHTHA_EIA', 'U.S. Naphtha Spot Price (EIA proxy)', 'EIA', 'USD/gal', 'USD', 'MARKET_INDICATIVE', 1, 'Petrochemical cracking feedstock proxy.'),
      ('WHEAT_GOI', 'Wheat MSP / Market Price (India, data.gov.in)', 'GOVT_DATA', 'INR/quintal', 'INR', 'OFFICIAL_BENCHMARK', 1, 'Official government procurement and market benchmark.'),
      ('SUGAR_GOI', 'Sugar (India, data.gov.in)', 'GOVT_DATA', 'INR/quintal', 'INR', 'MARKET_INDICATIVE', 1, 'Domestic wholesale price benchmark.'),
      ('EDIBLE_OIL_GOI', 'Edible Oil (India, data.gov.in)', 'GOVT_DATA', 'INR/L', 'INR', 'MARKET_INDICATIVE', 1, 'Domestic edible oil wholesale benchmark.')
  `);
}

async function down(pool) {
  await pool.query(`DROP TABLE IF EXISTS commodity_symbols;`);
}

module.exports = { up, down };
