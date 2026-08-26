/**
 * Per-industry operational cost drivers (Document 1 §4, Document 4 §5.3).
 */
const rows = [
  // Packaged Drinking Water — Document 1 §4 exact example
  { industrySlug: 'packaged-drinking-water', name: 'Electricity' },
  { industrySlug: 'packaged-drinking-water', name: 'Diesel' },
  { industrySlug: 'packaged-drinking-water', name: 'Transportation' },
  { industrySlug: 'packaged-drinking-water', name: 'Labor Cost' },
  { industrySlug: 'packaged-drinking-water', name: 'Packaging Cost' },

  // Plastic Manufacturing
  { industrySlug: 'plastic-manufacturing', name: 'Electricity' },
  { industrySlug: 'plastic-manufacturing', name: 'Diesel' },
  { industrySlug: 'plastic-manufacturing', name: 'Labor Cost' },
  { industrySlug: 'plastic-manufacturing', name: 'Machine Maintenance' },

  // Food & Beverage
  { industrySlug: 'food-beverage', name: 'Electricity' },
  { industrySlug: 'food-beverage', name: 'Transportation' },
  { industrySlug: 'food-beverage', name: 'Labor Cost' },
  { industrySlug: 'food-beverage', name: 'Cold Storage Cost' },

  // Dairy
  { industrySlug: 'dairy', name: 'Electricity' },
  { industrySlug: 'dairy', name: 'Cold Chain / Refrigeration Cost' },
  { industrySlug: 'dairy', name: 'Transportation' },
  { industrySlug: 'dairy', name: 'Labor Cost' },

  // FMCG — lightweight template (Document 1 §3): shared cost drivers only
  { industrySlug: 'fmcg', name: 'Packaging Cost' },
  { industrySlug: 'fmcg', name: 'Transportation' },
  { industrySlug: 'fmcg', name: 'Electricity' },
];

module.exports = { rows };
