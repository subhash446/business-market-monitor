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
  /** West Texas Intermediate crude oil, USD per barrel (EIA). */
  WTI: 'WTI',
  /** Brent crude oil (Europe), USD per barrel (EIA). */
  BRENT: 'BRENT',
  /** Wheat Wholesale Mandi Price (India, data.gov.in / Agmarknet). */
  WHEAT_GOI: 'WHEAT_GOI',
  /** Sugar Wholesale Mandi Price (India, data.gov.in / Agmarknet). */
  SUGAR_GOI: 'SUGAR_GOI',
  /** Edible Oil (Mustard Oil) Wholesale Price (India, data.gov.in / Agmarknet). */
  EDIBLE_OIL_GOI: 'EDIBLE_OIL_GOI',
});

/** Detailed metadata and provenance classification for each supported symbol. */
const COMMODITY_METADATA = Object.freeze({
  WTI: {
    symbol: 'WTI',
    displayName: 'WTI Crude Oil (Cushing, OK)',
    provider: 'U.S. Energy Information Administration (EIA)',
    sourceUrl: 'https://www.eia.gov',
    seriesCode: 'RWTC',
    unitLabel: 'USD/bbl',
    currency: 'USD',
    region: 'Cushing, OK',
    grade: 'Light Sweet Crude Oil',
    dataClass: 'OFFICIAL_BENCHMARK',
    isProxy: true,
    disclaimer: 'Global crude oil benchmark in USD/barrel. Not an actual local polymer resin price.',
  },
  BRENT: {
    symbol: 'BRENT',
    displayName: 'Brent Crude Oil (Europe Spot)',
    provider: 'U.S. Energy Information Administration (EIA)',
    sourceUrl: 'https://www.eia.gov',
    seriesCode: 'RBRTE',
    unitLabel: 'USD/bbl',
    currency: 'USD',
    region: 'Europe (North Sea)',
    grade: 'Brent Crude Oil',
    dataClass: 'OFFICIAL_BENCHMARK',
    isProxy: true,
    disclaimer: 'Global crude oil benchmark in USD/barrel. Not an actual local polymer resin price.',
  },
  WHEAT_GOI: {
    symbol: 'WHEAT_GOI',
    displayName: 'Wheat Wholesale Mandi (India, Agmarknet)',
    provider: 'Data.gov.in (Agmarknet / MoAFW)',
    sourceUrl: 'https://data.gov.in',
    seriesCode: 'Wheat',
    unitLabel: 'INR/quintal',
    currency: 'INR',
    region: 'National Mandi Average (India)',
    grade: 'FAQ (Fair Average Quality)',
    dataClass: 'MARKET_INDICATIVE',
    isProxy: false,
    disclaimer: 'Wholesale agricultural mandi modal price for raw unmilled wheat grain (FAQ grade) in INR/quintal. Not packaged commercial flour (Atta/Maida).',
  },
  SUGAR_GOI: {
    symbol: 'SUGAR_GOI',
    displayName: 'Sugar Wholesale Mandi (India, Agmarknet)',
    provider: 'Data.gov.in (Agmarknet / MoAFW)',
    sourceUrl: 'https://data.gov.in',
    seriesCode: 'Sugar',
    unitLabel: 'INR/quintal',
    currency: 'INR',
    region: 'National Mandi Average (India)',
    grade: 'Commercial Grade (M-30)',
    dataClass: 'MARKET_INDICATIVE',
    isProxy: false,
    disclaimer: 'Domestic wholesale mill delivery/mandi spot price for bulk commercial sugar (M-30 grade) in INR/quintal. Not retail packaged consumer sugar.',
  },
  EDIBLE_OIL_GOI: {
    symbol: 'EDIBLE_OIL_GOI',
    displayName: 'Mustard Oil Wholesale (India, Agmarknet)',
    provider: 'Data.gov.in (Agmarknet / MoAFW)',
    sourceUrl: 'https://data.gov.in',
    seriesCode: 'Mustard Oil',
    unitLabel: 'INR/quintal',
    currency: 'INR',
    region: 'National Mandi Average (India)',
    grade: 'Refined / Packed',
    dataClass: 'MARKET_INDICATIVE',
    isProxy: false,
    disclaimer: 'Domestic wholesale benchmark for refined/packed mustard edible oil in INR/quintal. Specific regional varieties and retail bottle packings may vary.',
  },
});

module.exports = { SUPPORTED_SYMBOLS, COMMODITY_METADATA };
