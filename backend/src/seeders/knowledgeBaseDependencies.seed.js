/**
 * Dependency relationships between raw materials / cost drivers / external
 * factors (FR-IKB-02, FR-IKB-05, Document 4 §5.3, §7). Must run AFTER
 * rawMaterials, costDrivers, and externalFactors seeders — resolves entity
 * ids by (industrySlug, entityType, entityName) rather than hardcoding ids.
 *
 * Packaged Drinking Water entries match Document 1 §4 / Document 3 §7's
 * worked example exactly; other industries follow the same pattern.
 */
const rows = [
  // Packaged Drinking Water
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Plastic Industry Trends', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Shrink Film', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Diesel', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Packaging Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Packaging Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'GST / Regulatory Changes', dependencyType: 'INFLUENCES' },

  // Plastic Manufacturing
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'HDPE Granules', targetType: 'EXTERNAL_FACTOR', targetName: 'Naphtha Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Polypropylene', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },

  // Food & Beverage
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Wheat', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Sugar', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Edible Oil', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },

  // Dairy
  { industrySlug: 'dairy', sourceType: 'RAW_MATERIAL', sourceName: 'Raw Milk', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'dairy', sourceType: 'COST_DRIVER', sourceName: 'Cold Chain / Refrigeration Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },

  // FMCG — lightweight template; only one dependency, no raw materials at all (see rawMaterials.seed.js)
  { industrySlug: 'fmcg', sourceType: 'COST_DRIVER', sourceName: 'Packaging Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'GST / Regulatory Changes', dependencyType: 'INFLUENCES' },
];

module.exports = { rows };
