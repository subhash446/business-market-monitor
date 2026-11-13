/**
 * Migration 027 — T-02.2: Reconcile `commodity_symbols` catalog metadata with
 * canonical `commodityMapping.js` and verified external provider contracts.
 *
 * Background:
 *   Migration 022 was written prior to Phase 4 Agmarknet integration and seeded:
 *     - WHEAT_GOI as data_class='OFFICIAL_BENCHMARK' ('Wheat MSP / Market Price ...')
 *       whereas data.gov.in Agmarknet returns daily wholesale mandi modal prices
 *       (MARKET_INDICATIVE).
 *     - EDIBLE_OIL_GOI with unit_label='INR/L' whereas Agmarknet returns Mustard Oil
 *       wholesale modal prices in 'INR/quintal' (~14,000 INR/quintal).
 *     - NAPHTHA_EIA as is_active=1 even though neither SUPPORTED_SYMBOLS nor
 *       eia.provider.js implements a Naphtha EIA series mapping.
 *
 * Safety:
 *   - Forward-only correction; never modifies already-applied migration 022.
 *   - Idempotent updates scoped by unique symbol keys.
 *   - Does not alter historical `price_points` rows.
 */

'use strict';

async function up(pool) {
  const [tables] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'commodity_symbols'`
  );

  if (!tables || Number(tables[0]?.cnt || 0) === 0) {
    console.log('[migrate] commodity_symbols table not found — skipping');
    return;
  }

  await pool.query(
    `UPDATE commodity_symbols
     SET display_name = 'Wheat Wholesale Mandi (India, Agmarknet)',
         data_class   = 'MARKET_INDICATIVE',
         notes        = 'Wholesale agricultural mandi modal price for raw unmilled wheat grain (FAQ grade) in INR/quintal.'
     WHERE symbol = 'WHEAT_GOI'`
  );

  await pool.query(
    `UPDATE commodity_symbols
     SET display_name = 'Sugar Wholesale Mandi (India, Agmarknet)',
         data_class   = 'MARKET_INDICATIVE',
         notes        = 'Domestic wholesale mill delivery/mandi spot price for bulk commercial sugar (M-30 grade) in INR/quintal.'
     WHERE symbol = 'SUGAR_GOI'`
  );

  await pool.query(
    `UPDATE commodity_symbols
     SET display_name = 'Mustard Oil Wholesale (India, Agmarknet)',
         unit_label   = 'INR/quintal',
         data_class   = 'MARKET_INDICATIVE',
         notes        = 'Domestic wholesale benchmark for refined/packed mustard edible oil in INR/quintal.'
     WHERE symbol = 'EDIBLE_OIL_GOI'`
  );

  await pool.query(
    `UPDATE commodity_symbols
     SET is_active = FALSE,
         notes     = 'Inactive: not mapped in SUPPORTED_SYMBOLS or eia.provider.js (no verified EIA series code).'
     WHERE symbol = 'NAPHTHA_EIA'`
  );

  console.log('[migrate] Reconciled commodity_symbols metadata for WHEAT_GOI, SUGAR_GOI, EDIBLE_OIL_GOI, NAPHTHA_EIA');
}

async function down(pool) {
  const [tables] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'commodity_symbols'`
  );

  if (!tables || Number(tables[0]?.cnt || 0) === 0) {
    return;
  }

  await pool.query(
    `UPDATE commodity_symbols
     SET display_name = 'Wheat MSP / Market Price (India, data.gov.in)',
         data_class   = 'OFFICIAL_BENCHMARK',
         notes        = 'Official government procurement and market benchmark.'
     WHERE symbol = 'WHEAT_GOI'`
  );

  await pool.query(
    `UPDATE commodity_symbols
     SET display_name = 'Sugar (India, data.gov.in)',
         data_class   = 'MARKET_INDICATIVE',
         notes        = 'Domestic wholesale price benchmark.'
     WHERE symbol = 'SUGAR_GOI'`
  );

  await pool.query(
    `UPDATE commodity_symbols
     SET display_name = 'Edible Oil (India, data.gov.in)',
         unit_label   = 'INR/L',
         data_class   = 'MARKET_INDICATIVE',
         notes        = 'Domestic edible oil wholesale benchmark.'
     WHERE symbol = 'EDIBLE_OIL_GOI'`
  );

  await pool.query(
    `UPDATE commodity_symbols
     SET is_active = TRUE,
         notes     = 'Petrochemical cracking feedstock proxy.'
     WHERE symbol = 'NAPHTHA_EIA'`
  );
}

module.exports = { up, down };
