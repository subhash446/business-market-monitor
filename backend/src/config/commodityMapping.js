/**
 * Supported commodity symbols for automatic external price ingestion.
 *
 * This constant is the single source of truth for which symbols the
 * application can ingest automatically. Providers use these same symbols
 * in their own way (EIA series codes, FRED series IDs, etc.) — the
 * translation is the provider's concern; this file only names the symbols
 * the application understands.
 *
 * To add a new commodity:
 *   1. Add an entry here with the display name and supported flag.
 *   2. Add the corresponding series code in the provider client(s).
 *   3. Set external_symbol on the relevant tracked_materials rows via SQL
 *      or a future admin UI.
 *
 * Schema relationship:
 *   tracked_materials.external_symbol = one of SUPPORTED_SYMBOLS below
 *   (or NULL, meaning "no automatic ingestion for this material").
 */

/** The set of commodity symbols the application can ingest from external providers. */
const SUPPORTED_SYMBOLS = Object.freeze({
  /** West Texas Intermediate crude oil, USD per barrel. */
  WTI: 'WTI',
  /** Brent crude oil (Europe), USD per barrel. */
  BRENT: 'BRENT',
});

module.exports = { SUPPORTED_SYMBOLS };
