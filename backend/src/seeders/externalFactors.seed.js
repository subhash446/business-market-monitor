/**
 * Per-industry external market factors (Document 1 §4, Document 4 §5.3).
 */
const rows = [
  // Packaged Drinking Water — Document 1 §4 exact example
  { industrySlug: 'packaged-drinking-water', name: 'Crude Oil Prices' },
  { industrySlug: 'packaged-drinking-water', name: 'Plastic Industry Trends' },
  { industrySlug: 'packaged-drinking-water', name: 'Government Policies' },
  { industrySlug: 'packaged-drinking-water', name: 'GST / Regulatory Changes' },
  { industrySlug: 'packaged-drinking-water', name: 'Fuel Price Changes' },
  { industrySlug: 'packaged-drinking-water', name: 'Import / Export Restrictions' },

  // Plastic Manufacturing
  { industrySlug: 'plastic-manufacturing', name: 'Crude Oil Prices' },
  { industrySlug: 'plastic-manufacturing', name: 'Naphtha Prices' },
  { industrySlug: 'plastic-manufacturing', name: 'Government Policies' },
  { industrySlug: 'plastic-manufacturing', name: 'Import / Export Restrictions' },

  // Food & Beverage
  { industrySlug: 'food-beverage', name: 'Monsoon / Agri Season' },
  { industrySlug: 'food-beverage', name: 'Government Policies' },
  { industrySlug: 'food-beverage', name: 'Import / Export Restrictions' },
  { industrySlug: 'food-beverage', name: 'Fuel Price Changes' },

  // Dairy
  { industrySlug: 'dairy', name: 'Monsoon / Agri Season' },
  { industrySlug: 'dairy', name: 'Government Policies' },
  { industrySlug: 'dairy', name: 'Fuel Price Changes' },
  { industrySlug: 'dairy', name: 'Import / Export Restrictions' },

  // FMCG — lightweight template (Document 1 §3)
  { industrySlug: 'fmcg', name: 'GST / Regulatory Changes' },
  { industrySlug: 'fmcg', name: 'Fuel Price Changes' },
];

module.exports = { rows };
