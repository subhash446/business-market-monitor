/**
 * Per-industry raw materials (Document 1 §4, Document 4 §5.3).
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
  { industrySlug: 'packaged-drinking-water', name: 'PET Resin', unitAbbr: 'kg' },
  { industrySlug: 'packaged-drinking-water', name: 'Bottle Caps', unitAbbr: 'pcs' },
  { industrySlug: 'packaged-drinking-water', name: 'Labels', unitAbbr: 'pcs' },
  { industrySlug: 'packaged-drinking-water', name: 'Cartons', unitAbbr: 'pcs' },
  { industrySlug: 'packaged-drinking-water', name: 'Shrink Film', unitAbbr: 'kg' },

  // Plastic Manufacturing
  { industrySlug: 'plastic-manufacturing', name: 'PET Resin', unitAbbr: 'kg' },
  { industrySlug: 'plastic-manufacturing', name: 'HDPE Granules', unitAbbr: 'kg' },
  { industrySlug: 'plastic-manufacturing', name: 'Polypropylene', unitAbbr: 'kg' },
  { industrySlug: 'plastic-manufacturing', name: 'Masterbatch', unitAbbr: 'kg' },
  { industrySlug: 'plastic-manufacturing', name: 'Recycled Plastic', unitAbbr: 'kg' },

  // Food & Beverage
  { industrySlug: 'food-beverage', name: 'Wheat', unitAbbr: 'MT' },
  { industrySlug: 'food-beverage', name: 'Sugar', unitAbbr: 'MT' },
  { industrySlug: 'food-beverage', name: 'Edible Oil', unitAbbr: 'L' },
  { industrySlug: 'food-beverage', name: 'Packaging Material', unitAbbr: 'pcs' },

  // Dairy
  { industrySlug: 'dairy', name: 'Raw Milk', unitAbbr: 'L' },
  { industrySlug: 'dairy', name: 'Packaging Material', unitAbbr: 'pcs' },
  { industrySlug: 'dairy', name: 'Preservatives', unitAbbr: 'kg' },

  // FMCG — intentionally empty (see file header)
];

module.exports = { rows };
