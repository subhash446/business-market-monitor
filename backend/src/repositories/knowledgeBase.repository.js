/**
 * All queries against the Knowledge Base tables (Document 4 §5.3, §7):
 * industries, units_of_measurement, raw_materials, cost_drivers,
 * external_factors, news_keywords, knowledge_base_dependencies.
 *
 * Read-only (OI-1 — no write methods exist here; KB data enters only via
 * seeders/). Parameterized queries only (Document 3 §13, NFR-SEC-04).
 */
const { pool } = require('../database/connection');
const { isStrictPositiveInteger } = require('../utils/validationHelpers');

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
  try {
    const [rows] = await pool.execute(
      `SELECT rm.id, rm.name, rm.description, rm.default_external_symbol,
              u.abbreviation AS unit_abbreviation, u.name AS unit_name
       FROM raw_materials rm
       JOIN units_of_measurement u ON u.id = rm.default_unit_id
       WHERE rm.industry_id = ?
       ORDER BY rm.name`,
      [industryId]
    );
    return rows;
  } catch {
    const [rows] = await pool.execute(
      `SELECT rm.id, rm.name, rm.description,
              u.abbreviation AS unit_abbreviation, u.name AS unit_name
       FROM raw_materials rm
       JOIN units_of_measurement u ON u.id = rm.default_unit_id
       WHERE rm.industry_id = ?
       ORDER BY rm.name`,
      [industryId]
    );
    return rows;
  }
}

// Added in Phase 5 (Template Generation) — returns id, name, default_unit_id,
// and default_external_symbol needed to write tracked_materials rows.
async function getRawMaterialsForTemplateGeneration(industryId) {
  try {
    const [rows] = await pool.execute(
      `SELECT rm.id, rm.name, rm.default_unit_id, rm.default_external_symbol, ind.slug AS industry_slug
       FROM raw_materials rm
       JOIN industries ind ON ind.id = rm.industry_id
       WHERE rm.industry_id = ?
       ORDER BY rm.name`,
      [industryId]
    );
    return rows;
  } catch {
    const [rows] = await pool.execute(
      `SELECT rm.id, rm.name, rm.default_unit_id, ind.slug AS industry_slug
       FROM raw_materials rm
       JOIN industries ind ON ind.id = rm.industry_id
       WHERE rm.industry_id = ?
       ORDER BY rm.name`,
      [industryId]
    );
    return rows;
  }
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

function clampPositiveInt(value, fallback, min, max) {
  if (!isStrictPositiveInteger(value)) {
    return fallback;
  }
  const num = Number(value);
  return Math.min(max, Math.max(min, num));
}

/**
 * Traverses directed upstream Knowledge Base dependencies starting at
 * (RAW_MATERIAL, rawMaterialId) within a single industry using MySQL 8.0+
 * WITH RECURSIVE CTE.
 *
 * Safeguards:
 * - Strict industry_id isolation on both recursive step and entity joins.
 * - Cycle detection via visited_path token check (`|TYPE:ID|`).
 * - Bounded depth (default 3, hard ceiling 4) and deterministic breadth-first
 *   ordering (`depth ASC, edge_path ASC`) with row cap.
 */
async function getMultiHopImpactEdges(rawMaterialId, industryId, options = {}) {
  if (!isStrictPositiveInteger(rawMaterialId) || !isStrictPositiveInteger(industryId)) {
    return [];
  }

  const safeMaterialId = Number(rawMaterialId);
  const safeIndustryId = Number(industryId);
  const safeMaxDepth = clampPositiveInt(options.maxDepth, 3, 1, 4);
  const safeMaxPaths = clampPositiveInt(options.maxPaths, 25, 1, 25);
  const safeRowLimit = safeMaxPaths * safeMaxDepth;

  const [rows] = await pool.execute(
    `WITH RECURSIVE kb_walk AS (
       SELECT
         kbd.id AS dependency_id,
         kbd.industry_id,
         1 AS depth,
         kbd.source_entity_type,
         kbd.source_entity_id,
         kbd.target_entity_type,
         kbd.target_entity_id,
         kbd.dependency_type,
         kbd.description,
         CAST(CONCAT(
           '|', kbd.source_entity_type, ':', kbd.source_entity_id, '|',
           kbd.target_entity_type, ':', kbd.target_entity_id, '|'
         ) AS CHAR(1000)) AS visited_path,
         CAST(kbd.id AS CHAR(500)) AS edge_path
       FROM knowledge_base_dependencies kbd
       WHERE kbd.industry_id = ?
         AND kbd.source_entity_type = 'RAW_MATERIAL'
         AND kbd.source_entity_id = ?

       UNION ALL

       SELECT
         kbd.id AS dependency_id,
         kbd.industry_id,
         kw.depth + 1 AS depth,
         kbd.source_entity_type,
         kbd.source_entity_id,
         kbd.target_entity_type,
         kbd.target_entity_id,
         kbd.dependency_type,
         kbd.description,
         CAST(CONCAT(
           kw.visited_path,
           kbd.target_entity_type, ':', kbd.target_entity_id, '|'
         ) AS CHAR(1000)) AS visited_path,
         CAST(CONCAT(kw.edge_path, '>', kbd.id) AS CHAR(500)) AS edge_path
       FROM kb_walk kw
       JOIN knowledge_base_dependencies kbd
         ON kbd.industry_id = ?
        AND kbd.source_entity_type = kw.target_entity_type
        AND kbd.source_entity_id = kw.target_entity_id
       WHERE kw.depth < ${safeMaxDepth}
         AND LOCATE(
           CONCAT('|', kbd.target_entity_type, ':', kbd.target_entity_id, '|'),
           kw.visited_path
         ) = 0
     )
     SELECT
       kw.dependency_id,
       kw.depth,
       kw.source_entity_type,
       kw.source_entity_id,
       COALESCE(srm.name, scd.name, sef.name) AS source_entity_name,
       kw.target_entity_type,
       kw.target_entity_id,
       COALESCE(trm.name, tcd.name, tef.name) AS target_entity_name,
       kw.dependency_type,
       COALESCE(
         NULLIF(TRIM(kw.description), ''),
         NULLIF(TRIM(tcd.description), ''),
         NULLIF(TRIM(tef.description), '')
       ) AS description,
       kw.visited_path,
       kw.edge_path
     FROM kb_walk kw
     LEFT JOIN raw_materials srm
       ON kw.source_entity_type = 'RAW_MATERIAL'
      AND srm.id = kw.source_entity_id
      AND srm.industry_id = kw.industry_id
     LEFT JOIN cost_drivers scd
       ON kw.source_entity_type = 'COST_DRIVER'
      AND scd.id = kw.source_entity_id
      AND scd.industry_id = kw.industry_id
     LEFT JOIN external_factors sef
       ON kw.source_entity_type = 'EXTERNAL_FACTOR'
      AND sef.id = kw.source_entity_id
      AND sef.industry_id = kw.industry_id
     LEFT JOIN raw_materials trm
       ON kw.target_entity_type = 'RAW_MATERIAL'
      AND trm.id = kw.target_entity_id
      AND trm.industry_id = kw.industry_id
     LEFT JOIN cost_drivers tcd
       ON kw.target_entity_type = 'COST_DRIVER'
      AND tcd.id = kw.target_entity_id
      AND tcd.industry_id = kw.industry_id
     LEFT JOIN external_factors tef
       ON kw.target_entity_type = 'EXTERNAL_FACTOR'
      AND tef.id = kw.target_entity_id
      AND tef.industry_id = kw.industry_id
     WHERE COALESCE(srm.name, scd.name, sef.name) IS NOT NULL
       AND COALESCE(trm.name, tcd.name, tef.name) IS NOT NULL
     ORDER BY kw.depth ASC, kw.edge_path ASC
     LIMIT ${safeRowLimit}`,
    [safeIndustryId, safeMaterialId, safeIndustryId]
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
  getMultiHopImpactEdges,
  listUnitsOfMeasurement,
};