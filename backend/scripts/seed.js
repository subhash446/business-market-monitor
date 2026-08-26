/**
 * Seeder runner (Production Hardening Phase A — paired with H1's migration
 * runner; the Knowledge Base cannot be populated any other way in V1, per
 * OI-1: no admin UI, seed data only).
 *
 * Runs the 7 seeders in src/seeders/ in a fixed dependency order (industries
 * and units first; knowledge_base_dependencies last, since it references
 * rows created by every other seeder — exactly as
 * knowledgeBaseDependencies.seed.js's own header comment already documents).
 *
 * Each seeder file only exports declarative data ({ rows: [...] }), using
 * industry slugs / unit abbreviations / entity names rather than raw
 * database ids — this script resolves those references via lookup queries,
 * the same resolution this project's author did by hand via the MySQL CLI
 * during Phases 4–5 testing, now made repeatable.
 *
 * Idempotent: every insert uses INSERT IGNORE (all target tables have the
 * UNIQUE constraints from Document 4 §5.3 backing this), so re-running this
 * script after data already exists is safe and a no-op for existing rows.
 *
 * Stops immediately on the first real failure.
 */
const { pool } = require('../src/database/connection');

const industriesSeed = require('../src/seeders/industries.seed');
const unitsSeed = require('../src/seeders/unitsOfMeasurement.seed');
const rawMaterialsSeed = require('../src/seeders/rawMaterials.seed');
const costDriversSeed = require('../src/seeders/costDrivers.seed');
const externalFactorsSeed = require('../src/seeders/externalFactors.seed');
const newsKeywordsSeed = require('../src/seeders/newsKeywords.seed');
const dependenciesSeed = require('../src/seeders/knowledgeBaseDependencies.seed');

async function seedIndustries() {
  console.log('[seed] industries...');
  let count = 0;
  for (const row of industriesSeed.rows) {
    const [result] = await pool.execute(
      'INSERT IGNORE INTO industries (name, slug, is_anchor, is_lightweight_template) VALUES (?, ?, ?, ?)',
      [row.name, row.slug, row.isAnchor, row.isLightweightTemplate]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] industries: ${count} inserted, ${industriesSeed.rows.length - count} already existed`);
}

async function seedUnits() {
  console.log('[seed] units_of_measurement...');
  let count = 0;
  for (const row of unitsSeed.rows) {
    const [result] = await pool.execute(
      'INSERT IGNORE INTO units_of_measurement (name, abbreviation) VALUES (?, ?)',
      [row.name, row.abbreviation]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] units_of_measurement: ${count} inserted, ${unitsSeed.rows.length - count} already existed`);
}

async function getIndustryId(slug) {
  const [rows] = await pool.execute('SELECT id FROM industries WHERE slug = ? LIMIT 1', [slug]);
  if (!rows[0]) throw new Error(`Unknown industry slug in seed data: "${slug}"`);
  return rows[0].id;
}

async function getUnitId(abbreviation) {
  const [rows] = await pool.execute('SELECT id FROM units_of_measurement WHERE abbreviation = ? LIMIT 1', [abbreviation]);
  if (!rows[0]) throw new Error(`Unknown unit abbreviation in seed data: "${abbreviation}"`);
  return rows[0].id;
}

async function seedRawMaterials() {
  console.log('[seed] raw_materials...');
  let count = 0;
  for (const row of rawMaterialsSeed.rows) {
    const industryId = await getIndustryId(row.industrySlug);
    const unitId = await getUnitId(row.unitAbbr);
    const [result] = await pool.execute(
      'INSERT IGNORE INTO raw_materials (industry_id, name, default_unit_id) VALUES (?, ?, ?)',
      [industryId, row.name, unitId]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] raw_materials: ${count} inserted, ${rawMaterialsSeed.rows.length - count} already existed`);
}

async function seedCostDrivers() {
  console.log('[seed] cost_drivers...');
  let count = 0;
  for (const row of costDriversSeed.rows) {
    const industryId = await getIndustryId(row.industrySlug);
    const [result] = await pool.execute(
      'INSERT IGNORE INTO cost_drivers (industry_id, name) VALUES (?, ?)',
      [industryId, row.name]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] cost_drivers: ${count} inserted, ${costDriversSeed.rows.length - count} already existed`);
}

async function seedExternalFactors() {
  console.log('[seed] external_factors...');
  let count = 0;
  for (const row of externalFactorsSeed.rows) {
    const industryId = await getIndustryId(row.industrySlug);
    const [result] = await pool.execute(
      'INSERT IGNORE INTO external_factors (industry_id, name) VALUES (?, ?)',
      [industryId, row.name]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] external_factors: ${count} inserted, ${externalFactorsSeed.rows.length - count} already existed`);
}

async function seedNewsKeywords() {
  console.log('[seed] news_keywords...');
  let count = 0;
  for (const row of newsKeywordsSeed.rows) {
    const industryId = await getIndustryId(row.industrySlug);
    const [result] = await pool.execute(
      'INSERT IGNORE INTO news_keywords (industry_id, keyword) VALUES (?, ?)',
      [industryId, row.keyword]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] news_keywords: ${count} inserted, ${newsKeywordsSeed.rows.length - count} already existed`);
}

// Polymorphic resolution (Document 4 §7.2) — sourceType/targetType tell us
// which of the three tables to look the name up in.
const ENTITY_TABLE = {
  RAW_MATERIAL: 'raw_materials',
  COST_DRIVER: 'cost_drivers',
  EXTERNAL_FACTOR: 'external_factors',
};

async function getEntityId(entityType, industryId, name) {
  const table = ENTITY_TABLE[entityType];
  if (!table) throw new Error(`Unknown entity type in seed data: "${entityType}"`);
  const [rows] = await pool.execute(
    `SELECT id FROM ${table} WHERE industry_id = ? AND name = ? LIMIT 1`,
    [industryId, name]
  );
  if (!rows[0]) throw new Error(`Unknown ${entityType} "${name}" for industry_id ${industryId}`);
  return rows[0].id;
}

async function seedDependencies() {
  console.log('[seed] knowledge_base_dependencies...');
  let count = 0;
  for (const row of dependenciesSeed.rows) {
    const industryId = await getIndustryId(row.industrySlug);
    const sourceId = await getEntityId(row.sourceType, industryId, row.sourceName);
    const targetId = await getEntityId(row.targetType, industryId, row.targetName);
    const [result] = await pool.execute(
      `INSERT IGNORE INTO knowledge_base_dependencies
         (industry_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, dependency_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [industryId, row.sourceType, sourceId, row.targetType, targetId, row.dependencyType]
    );
    if (result.affectedRows > 0) count += 1;
  }
  console.log(`[seed] knowledge_base_dependencies: ${count} inserted, ${dependenciesSeed.rows.length - count} already existed`);
}

async function run() {
  const steps = [
    seedIndustries,
    seedUnits,
    seedRawMaterials,
    seedCostDrivers,
    seedExternalFactors,
    seedNewsKeywords,
    seedDependencies,
  ];

  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      console.error(`[seed] FAIL in ${step.name}: ${err.message}`);
      console.error('[seed] Stopping — later seeders may depend on this data.');
      await pool.end();
      process.exit(1);
    }
  }

  console.log('[seed] Done.');
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seed] Unexpected error:', err);
  process.exit(1);
});
