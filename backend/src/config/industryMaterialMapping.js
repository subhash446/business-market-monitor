/**
 * Single source of truth for business category (industry) to material mapping.
 * Phase 5 — Automatic Business-to-Material Mapping.
 *
 * Details the approved mapping for every supported business category:
 *   1. Packaged Drinking Water (slug: 'packaged-drinking-water')
 *   2. Plastic Manufacturing   (slug: 'plastic-manufacturing')
 *   3. Food & Beverage         (slug: 'food-beverage')
 *   4. Dairy                   (slug: 'dairy')
 *   5. FMCG                    (slug: 'fmcg' — lightweight template, 0 seeded)
 *
 * For each material:
 *   - name: string
 *   - defaultUnit: string (unit abbreviation: 'kg', 'pcs', 'MT', 'L')
 *   - defaultExternalSymbol: string | null (one of SUPPORTED_SYMBOLS or null)
 *   - sourceType: 'OFFICIAL_BENCHMARK' | 'MARKET_INDICATIVE' | 'SUPPLIER_QUOTE'
 *   - sourceName: string
 *   - isProxy: boolean
 *   - hasAutomatedFeed: boolean
 *   - disclaimer: string
 */

'use strict';

const { SUPPORTED_SYMBOLS } = require('./commodityMapping');

const INDUSTRY_MATERIAL_MAPPING = Object.freeze({
  'packaged-drinking-water': {
    id: 1,
    name: 'Packaged Drinking Water',
    slug: 'packaged-drinking-water',
    isAnchor: true,
    isLightweightTemplate: false,
    description: 'Commercial bottled water, beverage packaging, and purification facilities.',
    materials: [
      {
        name: 'PET Resin',
        defaultUnit: 'kg',
        defaultExternalSymbol: SUPPORTED_SYMBOLS.WTI,
        sourceType: 'MARKET_INDICATIVE',
        sourceName: 'U.S. Energy Information Administration (EIA)',
        isProxy: true,
        hasAutomatedFeed: true,
        disclaimer: 'Global crude oil benchmark (USD/bbl) acting as upstream indicative proxy for PET polymer resin. Not a direct local purchase transaction.',
      },
      {
        name: 'Bottle Caps',
        defaultUnit: 'pcs',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Direct local supplier quote in INR/pcs.',
      },
      {
        name: 'Labels',
        defaultUnit: 'pcs',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Direct printed packaging quote in INR/pcs.',
      },
      {
        name: 'Cartons',
        defaultUnit: 'pcs',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Corrugated box converter quote in INR/pcs.',
      },
      {
        name: 'Shrink Film',
        defaultUnit: 'kg',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Direct secondary packaging film quote in INR/kg.',
      },
    ],
  },

  'plastic-manufacturing': {
    id: 2,
    name: 'Plastic Manufacturing',
    slug: 'plastic-manufacturing',
    isAnchor: false,
    isLightweightTemplate: false,
    description: 'Injection molding, extrusion, polymer compounding, and blow molding.',
    materials: [
      {
        name: 'PET Resin',
        defaultUnit: 'kg',
        defaultExternalSymbol: SUPPORTED_SYMBOLS.WTI,
        sourceType: 'MARKET_INDICATIVE',
        sourceName: 'U.S. Energy Information Administration (EIA)',
        isProxy: true,
        hasAutomatedFeed: true,
        disclaimer: 'Global crude oil benchmark (USD/bbl) acting as upstream indicative proxy for PET polymer resin. Not a direct local purchase transaction.',
      },
      {
        name: 'HDPE Granules',
        defaultUnit: 'kg',
        defaultExternalSymbol: SUPPORTED_SYMBOLS.BRENT,
        sourceType: 'MARKET_INDICATIVE',
        sourceName: 'U.S. Energy Information Administration (EIA)',
        isProxy: true,
        hasAutomatedFeed: true,
        disclaimer: 'Global crude oil benchmark (USD/bbl) acting as upstream indicative proxy for polyethylene feedstock. Not a direct local purchase transaction.',
      },
      {
        name: 'Polypropylene',
        defaultUnit: 'kg',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Direct polymer manufacturer/distributor quote in INR/kg.',
      },
      {
        name: 'Masterbatch',
        defaultUnit: 'kg',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Colorant and additive concentrate quote in INR/kg.',
      },
      {
        name: 'Recycled Plastic',
        defaultUnit: 'kg',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Local post-industrial regrind quote in INR/kg.',
      },
    ],
  },

  'food-beverage': {
    id: 3,
    name: 'Food & Beverage',
    slug: 'food-beverage',
    isAnchor: false,
    isLightweightTemplate: false,
    description: 'Food processing, grain milling, confectioneries, and packaged food manufacturing.',
    materials: [
      {
        name: 'Wheat',
        defaultUnit: 'MT',
        defaultExternalSymbol: SUPPORTED_SYMBOLS.WHEAT_GOI,
        sourceType: 'MARKET_INDICATIVE',
        sourceName: 'Data.gov.in (Agmarknet / MoAFW)',
        isProxy: false,
        hasAutomatedFeed: true,
        disclaimer: 'Wholesale agricultural mandi modal price for raw unmilled wheat grain (FAQ grade) in INR/quintal. Not packaged commercial flour.',
      },
      {
        name: 'Sugar',
        defaultUnit: 'MT',
        defaultExternalSymbol: SUPPORTED_SYMBOLS.SUGAR_GOI,
        sourceType: 'MARKET_INDICATIVE',
        sourceName: 'Data.gov.in (Agmarknet / MoAFW)',
        isProxy: false,
        hasAutomatedFeed: true,
        disclaimer: 'Domestic wholesale mill delivery/mandi spot price for bulk commercial sugar (M-30 grade) in INR/quintal. Not packaged consumer retail sugar.',
      },
      {
        name: 'Edible Oil',
        defaultUnit: 'L',
        defaultExternalSymbol: SUPPORTED_SYMBOLS.EDIBLE_OIL_GOI,
        sourceType: 'MARKET_INDICATIVE',
        sourceName: 'Data.gov.in (Agmarknet / MoAFW)',
        isProxy: false,
        hasAutomatedFeed: true,
        disclaimer: 'Domestic wholesale benchmark for refined/packed mustard edible oil in INR/quintal. Specific regional varieties and retail bottle packings may vary.',
      },
      {
        name: 'Packaging Material',
        defaultUnit: 'pcs',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Food-grade packaging quote in INR/pcs.',
      },
    ],
  },

  'dairy': {
    id: 4,
    name: 'Dairy',
    slug: 'dairy',
    isAnchor: false,
    isLightweightTemplate: false,
    description: 'Milk processing, dairy cooperatives, curd/butter/ghee manufacturing.',
    materials: [
      {
        name: 'Raw Milk',
        defaultUnit: 'L',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Farm-gate procurement quote based on FAT/SNF content in INR/L.',
      },
      {
        name: 'Packaging Material',
        defaultUnit: 'pcs',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Pouch/bottle converter quote in INR/pcs.',
      },
      {
        name: 'Preservatives',
        defaultUnit: 'kg',
        defaultExternalSymbol: null,
        sourceType: 'SUPPLIER_QUOTE',
        sourceName: 'Direct Supplier Quote',
        isProxy: false,
        hasAutomatedFeed: false,
        disclaimer: 'No automated feed. Food-grade cultures/preservatives quote in INR/kg.',
      },
    ],
  },

  'fmcg': {
    id: 5,
    name: 'FMCG',
    slug: 'fmcg',
    isAnchor: false,
    isLightweightTemplate: true,
    description: 'Fast-Moving Consumer Goods (flexible lightweight template; custom materials configured per brand).',
    materials: [],
  },
});

/**
 * Resolves an industry mapping by numeric id or slug string.
 *
 * @param {string|number} identifier
 * @returns {object|null}
 */
function getIndustryMapping(identifier) {
  if (!identifier) return null;
  const strId = String(identifier).toLowerCase().trim();

  // Try slug match
  if (INDUSTRY_MATERIAL_MAPPING[strId]) {
    return INDUSTRY_MATERIAL_MAPPING[strId];
  }

  // Try numeric ID match
  const numId = Number(identifier);
  if (!isNaN(numId)) {
    for (const key of Object.keys(INDUSTRY_MATERIAL_MAPPING)) {
      if (INDUSTRY_MATERIAL_MAPPING[key].id === numId) {
        return INDUSTRY_MATERIAL_MAPPING[key];
      }
    }
  }

  // Try name match
  for (const key of Object.keys(INDUSTRY_MATERIAL_MAPPING)) {
    if (INDUSTRY_MATERIAL_MAPPING[key].name.toLowerCase() === strId) {
      return INDUSTRY_MATERIAL_MAPPING[key];
    }
  }

  return null;
}

/**
 * Resolves the default external symbol for a material name within an industry.
 *
 * @param {string} materialName
 * @param {string|number} industryIdentifier
 * @returns {string|null}
 */
function resolveExternalSymbol(materialName, industryIdentifier) {
  if (!materialName) return null;
  const industry = getIndustryMapping(industryIdentifier);
  if (!industry) return null;

  const trimMatName = materialName.trim().toLowerCase();
  const found = industry.materials.find(
    (m) => m.name.toLowerCase() === trimMatName
  );

  return found ? (found.defaultExternalSymbol || null) : null;
}

/**
 * Returns the list of standard mapped materials for an industry.
 *
 * @param {string|number} industryIdentifier
 * @returns {Array<object>}
 */
function getMaterialsForIndustry(industryIdentifier) {
  const industry = getIndustryMapping(industryIdentifier);
  return industry ? industry.materials : [];
}

module.exports = {
  INDUSTRY_MATERIAL_MAPPING,
  getIndustryMapping,
  resolveExternalSymbol,
  getMaterialsForIndustry,
};
