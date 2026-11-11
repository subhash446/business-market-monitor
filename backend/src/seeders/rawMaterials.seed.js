/**
 * Per-industry raw materials (Document 1 §4, Document 4 §5.3, Phase 5 Category Mapping).
 * Referenced by industry slug + unit abbreviation (resolved to real ids at
 * seed-apply time) so this file has no hardcoded foreign ids.
 *
 * FMCG deliberately has ZERO raw materials — per Document 1 §3's explicit
 * architect note, FMCG ships as a lightweight/generic template in V1
 * (cost drivers only, no exhaustive material list). This is intentional,
 * not a gap.
 */
const rows = [
  // Packaged Drinking Water (anchor) — Document 1 §4 exact example
  { industrySlug: 'packaged-drinking-water', name: 'PET Resin', unitAbbr: 'kg', defaultExternalSymbol: 'WTI' },
  { industrySlug: 'packaged-drinking-water', name: 'Bottle Caps', unitAbbr: 'pcs', defaultExternalSymbol: null },
  { industrySlug: 'packaged-drinking-water', name: 'Labels', unitAbbr: 'pcs', defaultExternalSymbol: null },
  { industrySlug: 'packaged-drinking-water', name: 'Cartons', unitAbbr: 'pcs', defaultExternalSymbol: null },
  { industrySlug: 'packaged-drinking-water', name: 'Shrink Film', unitAbbr: 'kg', defaultExternalSymbol: null },

  // Plastic Manufacturing
  { industrySlug: 'plastic-manufacturing', name: 'PET Resin', unitAbbr: 'kg', defaultExternalSymbol: 'WTI' },
  { industrySlug: 'plastic-manufacturing', name: 'HDPE Granules', unitAbbr: 'kg', defaultExternalSymbol: 'BRENT' },
  { industrySlug: 'plastic-manufacturing', name: 'Polypropylene', unitAbbr: 'kg', defaultExternalSymbol: null },
  { industrySlug: 'plastic-manufacturing', name: 'Masterbatch', unitAbbr: 'kg', defaultExternalSymbol: null },
  { industrySlug: 'plastic-manufacturing', name: 'Recycled Plastic', unitAbbr: 'kg', defaultExternalSymbol: null },

  // Food & Beverage
  { industrySlug: 'food-beverage', name: 'Wheat', unitAbbr: 'MT', defaultExternalSymbol: 'WHEAT_GOI' },
  { industrySlug: 'food-beverage', name: 'Sugar', unitAbbr: 'MT', defaultExternalSymbol: 'SUGAR_GOI' },
  { industrySlug: 'food-beverage', name: 'Edible Oil', unitAbbr: 'L', defaultExternalSymbol: 'EDIBLE_OIL_GOI' },
  { industrySlug: 'food-beverage', name: 'Packaging Material', unitAbbr: 'pcs', defaultExternalSymbol: null },

  // Dairy
  { industrySlug: 'dairy', name: 'Raw Milk', unitAbbr: 'L', defaultExternalSymbol: null },
  { industrySlug: 'dairy', name: 'Packaging Material', unitAbbr: 'pcs', defaultExternalSymbol: null },
  { industrySlug: 'dairy', name: 'Preservatives', unitAbbr: 'kg', defaultExternalSymbol: null },

  // FMCG — intentionally empty (see file header)
];

module.exports = { rows };
