/**
 * All queries against the Knowledge Base tables (Document 4 §5.3, §7):
 * industries, units_of_measurement, raw_materials, cost_drivers,
 * external_factors, news_keywords, knowledge_base_dependencies.
 *
 * Read-only (OI-1 — no write methods exist here; KB data enters only via
 * seeders/). Parameterized queries only (Document 3 §13, NFR-SEC-04).
 */
const { pool } = require('../database/connection');

async function listIndustries() {
  const [rows] = await pool.execute('SELECT * FROM industries ORDER BY id');
  return rows;
}

async function findIndustryById(industryId) {
  const [rows] = await pool.execute(
    'SELECT * FROM industries WHERE id = ? LIMIT 1',
    [industryId]
  );
  return rows[0] || null;
}

async function getRawMaterialsByIndustry(industryId) {
  const [rows] = await pool.execute(
    `SELECT rm.id, rm.name, rm.description, u.abbreviation AS unit_abbreviation, u.name AS unit_name
     FROM raw_materials rm
     JOIN units_of_measurement u ON u.id = rm.default_unit_id
     WHERE rm.industry_id = ?
     ORDER BY rm.name`,
    [industryId]
  );
  return rows;
}

// Added in Phase 5 (Template Generation) — purely additive, no existing
// function above was changed. Returns the raw default_unit_id (not just its
// display abbreviation) needed to write tracked_materials.unit_id;
// the existing getRawMaterialsByIndustry() above stays exactly as Phase 4
// left it, for the read-only KB API response shape (Document 5 §4.3).
async function getRawMaterialsForTemplateGeneration(industryId) {
  const [rows] = await pool.execute(
    'SELECT id, default_unit_id FROM raw_materials WHERE industry_id = ? ORDER BY name',
    [industryId]
  );
  return rows;
}

async function getCostDriversByIndustry(industryId) {
  const [rows] = await pool.execute(
    'SELECT id, name, description FROM cost_drivers WHERE industry_id = ? ORDER BY name',
    [industryId]
  );
  return rows;
}

async function getExternalFactorsByIndustry(industryId) {
  const [rows] = await pool.execute(
    'SELECT id, name, description FROM external_factors WHERE industry_id = ? ORDER BY name',
    [industryId]
  );
  return rows;
}

async function getNewsKeywordsByIndustry(industryId) {
  const [rows] = await pool.execute(
    'SELECT id, keyword FROM news_keywords WHERE industry_id = ? ORDER BY keyword',
    [industryId]
  );
  return rows;
}

async function getDependenciesByIndustry(industryId) {
  const [rows] = await pool.execute(
    `SELECT source_entity_type, source_entity_id, target_entity_type, target_entity_id, dependency_type, description
     FROM knowledge_base_dependencies
     WHERE industry_id = ?
     ORDER BY id`,
    [industryId]
  );
  return rows;
}

/**
 * Returns external-factor dependencies for a specific raw material.
 *
 * Used by the AI market-intelligence layer to determine which external
 * factors are relevant to a material before selecting news evidence.
 *
 * Only RAW_MATERIAL -> EXTERNAL_FACTOR relationships are returned.
 * This keeps the query focused on the material-to-market-factor path
 * required for news relevance.
 *
 * The industry_id constraint protects against accidentally resolving a
 * dependency belonging to another industry.
 */
async function getDependenciesForRawMaterial(rawMaterialId, industryId) {
  const [rows] = await pool.execute(
    `SELECT
       kbd.target_entity_type,
       kbd.target_entity_id,
       kbd.dependency_type,
       kbd.description,
       ef.name AS external_factor_name
     FROM knowledge_base_dependencies kbd
     JOIN external_factors ef
       ON ef.id = kbd.target_entity_id
      AND kbd.target_entity_type = 'EXTERNAL_FACTOR'
      AND ef.industry_id = kbd.industry_id
     WHERE kbd.industry_id = ?
       AND kbd.source_entity_type = 'RAW_MATERIAL'
       AND kbd.source_entity_id = ?
       AND kbd.target_entity_type = 'EXTERNAL_FACTOR'
     ORDER BY kbd.id`,
    [industryId, rawMaterialId]
  );

  return rows;
}

async function listUnitsOfMeasurement() {
  const [rows] = await pool.execute(
    'SELECT * FROM units_of_measurement ORDER BY name'
  );
  return rows;
}

module.exports = {
  listIndustries,
  findIndustryById,
  getRawMaterialsByIndustry,
  getRawMaterialsForTemplateGeneration,
  getCostDriversByIndustry,
  getExternalFactorsByIndustry,
  getNewsKeywordsByIndustry,
  getDependenciesByIndustry,
  getDependenciesForRawMaterial,
  listUnitsOfMeasurement,
};