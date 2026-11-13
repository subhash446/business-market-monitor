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
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Bottle Caps', targetType: 'COST_DRIVER', targetName: 'Packaging Cost', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Bottle Caps', targetType: 'EXTERNAL_FACTOR', targetName: 'Plastic Industry Trends', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Labels', targetType: 'COST_DRIVER', targetName: 'Packaging Cost', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Cartons', targetType: 'COST_DRIVER', targetName: 'Packaging Cost', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Shrink Film', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Shrink Film', targetType: 'COST_DRIVER', targetName: 'Packaging Cost', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'RAW_MATERIAL', sourceName: 'Shrink Film', targetType: 'EXTERNAL_FACTOR', targetName: 'Plastic Industry Trends', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'COST_DRIVER', targetName: 'Diesel', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Diesel', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Packaging Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Packaging Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'GST / Regulatory Changes', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'COST_DRIVER', sourceName: 'Electricity', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'EXTERNAL_FACTOR', sourceName: 'Fuel Price Changes', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'packaged-drinking-water', sourceType: 'EXTERNAL_FACTOR', sourceName: 'Plastic Industry Trends', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },

  // Plastic Manufacturing
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Naphtha Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'INFLUENCES' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'PET Resin', targetType: 'COST_DRIVER', targetName: 'Electricity', dependencyType: 'INFLUENCES' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'HDPE Granules', targetType: 'EXTERNAL_FACTOR', targetName: 'Naphtha Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'HDPE Granules', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'INFLUENCES' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Polypropylene', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Polypropylene', targetType: 'EXTERNAL_FACTOR', targetName: 'Naphtha Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Masterbatch', targetType: 'RAW_MATERIAL', targetName: 'PET Resin', dependencyType: 'CORRELATES_WITH' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Masterbatch', targetType: 'RAW_MATERIAL', targetName: 'Polypropylene', dependencyType: 'CORRELATES_WITH' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Recycled Plastic', targetType: 'RAW_MATERIAL', targetName: 'PET Resin', dependencyType: 'CORRELATES_WITH' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'RAW_MATERIAL', sourceName: 'Recycled Plastic', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'COST_DRIVER', sourceName: 'Electricity', targetType: 'COST_DRIVER', targetName: 'Diesel', dependencyType: 'INFLUENCES' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'COST_DRIVER', sourceName: 'Diesel', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'plastic-manufacturing', sourceType: 'EXTERNAL_FACTOR', sourceName: 'Naphtha Prices', targetType: 'EXTERNAL_FACTOR', targetName: 'Crude Oil Prices', dependencyType: 'DRIVES_COST' },

  // Food & Beverage
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Wheat', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Wheat', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Wheat', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Sugar', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Sugar', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Sugar', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Edible Oil', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Edible Oil', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Edible Oil', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'RAW_MATERIAL', sourceName: 'Packaging Material', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'COST_DRIVER', sourceName: 'Cold Storage Cost', targetType: 'COST_DRIVER', targetName: 'Electricity', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'food-beverage', sourceType: 'COST_DRIVER', sourceName: 'Electricity', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },
  { industrySlug: 'food-beverage', sourceType: 'EXTERNAL_FACTOR', sourceName: 'Import / Export Restrictions', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },

  // Dairy
  { industrySlug: 'dairy', sourceType: 'RAW_MATERIAL', sourceName: 'Raw Milk', targetType: 'EXTERNAL_FACTOR', targetName: 'Monsoon / Agri Season', dependencyType: 'INFLUENCES' },
  { industrySlug: 'dairy', sourceType: 'RAW_MATERIAL', sourceName: 'Raw Milk', targetType: 'COST_DRIVER', targetName: 'Cold Chain / Refrigeration Cost', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'dairy', sourceType: 'RAW_MATERIAL', sourceName: 'Raw Milk', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'dairy', sourceType: 'RAW_MATERIAL', sourceName: 'Packaging Material', targetType: 'COST_DRIVER', targetName: 'Transportation', dependencyType: 'INFLUENCES' },
  { industrySlug: 'dairy', sourceType: 'RAW_MATERIAL', sourceName: 'Preservatives', targetType: 'EXTERNAL_FACTOR', targetName: 'Import / Export Restrictions', dependencyType: 'INFLUENCES' },
  { industrySlug: 'dairy', sourceType: 'COST_DRIVER', sourceName: 'Cold Chain / Refrigeration Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'dairy', sourceType: 'COST_DRIVER', sourceName: 'Cold Chain / Refrigeration Cost', targetType: 'COST_DRIVER', targetName: 'Electricity', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'dairy', sourceType: 'COST_DRIVER', sourceName: 'Electricity', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },
  { industrySlug: 'dairy', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
  { industrySlug: 'dairy', sourceType: 'EXTERNAL_FACTOR', sourceName: 'Import / Export Restrictions', targetType: 'EXTERNAL_FACTOR', targetName: 'Government Policies', dependencyType: 'INFLUENCES' },

  // FMCG — lightweight template; no raw materials at all (see rawMaterials.seed.js)
  { industrySlug: 'fmcg', sourceType: 'COST_DRIVER', sourceName: 'Packaging Cost', targetType: 'EXTERNAL_FACTOR', targetName: 'GST / Regulatory Changes', dependencyType: 'INFLUENCES' },
  { industrySlug: 'fmcg', sourceType: 'COST_DRIVER', sourceName: 'Transportation', targetType: 'EXTERNAL_FACTOR', targetName: 'Fuel Price Changes', dependencyType: 'DRIVES_COST' },
];

module.exports = { rows };
