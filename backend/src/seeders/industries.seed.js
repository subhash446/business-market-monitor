/**
 * Minimal industries seed — the 5 approved Version 1 industries (Document 1 §3).
 * Populated now, narrowly, because Business Profile cannot be tested without
 * at least one valid industryId to reference. This does NOT seed raw
 * materials, cost drivers, external factors, news keywords, or dependencies —
 * those remain untouched TODOs (Knowledge Base module, out of Phase 3 scope).
 */
const rows = [
  { name: 'Packaged Drinking Water', slug: 'packaged-drinking-water', isAnchor: true, isLightweightTemplate: false },
  { name: 'Plastic Manufacturing', slug: 'plastic-manufacturing', isAnchor: false, isLightweightTemplate: false },
  { name: 'Food & Beverage', slug: 'food-beverage', isAnchor: false, isLightweightTemplate: false },
  { name: 'Dairy', slug: 'dairy', isAnchor: false, isLightweightTemplate: false },
  { name: 'FMCG', slug: 'fmcg', isAnchor: false, isLightweightTemplate: true },
];

module.exports = { rows };
