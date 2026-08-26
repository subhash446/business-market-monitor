/**
 * Configurable per-industry news keyword sets (FR-NEWS-05, Document 4 §5.3).
 */
const rows = [
  { industrySlug: 'packaged-drinking-water', keyword: 'PET resin price' },
  { industrySlug: 'packaged-drinking-water', keyword: 'crude oil price India' },
  { industrySlug: 'packaged-drinking-water', keyword: 'packaging industry' },
  { industrySlug: 'packaged-drinking-water', keyword: 'GST update' },

  { industrySlug: 'plastic-manufacturing', keyword: 'plastic granule price' },
  { industrySlug: 'plastic-manufacturing', keyword: 'polymer price India' },
  { industrySlug: 'plastic-manufacturing', keyword: 'petrochemical industry' },

  { industrySlug: 'food-beverage', keyword: 'wheat price India' },
  { industrySlug: 'food-beverage', keyword: 'sugar price' },
  { industrySlug: 'food-beverage', keyword: 'edible oil price' },
  { industrySlug: 'food-beverage', keyword: 'monsoon forecast' },

  { industrySlug: 'dairy', keyword: 'milk price India' },
  { industrySlug: 'dairy', keyword: 'dairy industry news' },
  { industrySlug: 'dairy', keyword: 'cold chain logistics' },

  { industrySlug: 'fmcg', keyword: 'FMCG industry news' },
  { industrySlug: 'fmcg', keyword: 'retail price trends' },
];

module.exports = { rows };
