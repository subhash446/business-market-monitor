/**
 * All queries against `tracked_materials` (Document 4 §5.4).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Phase 6A scope only: list + scoped find + update(isTracked). No create
 * (custom materials) and no delete — those are explicitly out of scope.
 *
 * Every method that touches a specific row scopes by business_id, never a
 * bare id alone — this is what enforces business isolation (Document 5 §2.4).
 */
const { pool } = require('../database/connection');

const BASE_SELECT = `
  SELECT tm.id, tm.raw_material_id, COALESCE(rm.name, tm.custom_name) AS name,
         u.abbreviation AS unit_abbreviation, tm.is_tracked, tm.external_symbol,
         tm.created_at
  FROM tracked_materials tm
  LEFT JOIN raw_materials rm ON rm.id = tm.raw_material_id
  JOIN units_of_measurement u ON u.id = tm.unit_id
`;

async function listByBusinessId(businessId) {
  const [rows] = await pool.execute(
    `${BASE_SELECT} WHERE tm.business_id = ? ORDER BY name ASC`,
    [businessId]
  );
  return rows;
}

// Scoped by business_id — a materialId belonging to another business returns
// nothing here, which the service layer turns into a 404 (Document 5 §2.4).
async function findByIdForBusiness(materialId, businessId) {
  const [rows] = await pool.execute(
    `${BASE_SELECT} WHERE tm.id = ? AND tm.business_id = ? LIMIT 1`,
    [materialId, businessId]
  );
  return rows[0] || null;
}

// Used only after ownership has already been confirmed via
// findByIdForBusiness() above — returns the same shape post-update.
async function findById(materialId) {
  const [rows] = await pool.execute(`${BASE_SELECT} WHERE tm.id = ? LIMIT 1`, [materialId]);
  return rows[0] || null;
}

async function updateTrackingStatus(materialId, isTracked) {
  await pool.execute('UPDATE tracked_materials SET is_tracked = ? WHERE id = ?', [isTracked, materialId]);
  return findById(materialId);
}

// Added in Phase 6B (Custom Materials) — purely additive, nothing above changed.

// Case-insensitive by explicit LOWER() comparison, not relying on the
// table's collation (utf8mb4_0900_ai_ci happens to already be
// case-insensitive, but this doesn't depend on that being true).
// Scoped to raw_material_id IS NULL — only custom materials can collide on
// name; a KB-linked material's name lives in raw_materials, not here.
async function findCustomByNameForBusiness(businessId, customName) {
  const [rows] = await pool.execute(
    `SELECT id FROM tracked_materials
     WHERE business_id = ? AND raw_material_id IS NULL AND LOWER(custom_name) = LOWER(?)
     LIMIT 1`,
    [businessId, customName]
  );
  return rows[0] || null;
}

// Narrow existence check against units_of_measurement — same pattern as
// business.repository.js's industryExists() (Phase 3): a small, self-
// contained check inside the module that needs it, rather than reaching
// into a sibling module's repository.
async function unitExists(unitId) {
  const [rows] = await pool.execute('SELECT id FROM units_of_measurement WHERE id = ? LIMIT 1', [unitId]);
  return rows.length > 0;
}

async function createCustom({ businessId, customName, unitId }) {
  const [result] = await pool.execute(
    `INSERT INTO tracked_materials (business_id, raw_material_id, custom_name, unit_id, is_tracked)
     VALUES (?, NULL, ?, ?, TRUE)`,
    [businessId, customName, unitId]
  );
  return findById(result.insertId);
}

// Added in Production Hardening Phase B (finding A1) — moved here from
// templateGeneration.service.js, which previously ran this transaction
// directly against `pool`, bypassing the repository layer. The transaction
// logic itself (begin/check-existing/insert-new/commit/rollback) is
// unchanged — only its location moved, per A1's explicit instruction to
// preserve transaction safety while relocating the SQL.
//
// rawMaterials: [{ id, default_unit_id }, ...] — the exact shape returned
// by knowledgeBaseRepository.getRawMaterialsForTemplateGeneration().
async function bulkCreateFromTemplate(businessId, rawMaterials) {
  if (!rawMaterials || rawMaterials.length === 0) {
    return { materialsGenerated: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Never generate duplicates, and safe to call more than once for the
    // same business (idempotent) — check what's already tracked first,
    // inside this same transaction/connection. Document 4 §10.3 notes MySQL
    // can't enforce "one row per (business_id, raw_material_id)" natively,
    // so this is an application-level check.
    const [existingRows] = await connection.execute(
      'SELECT raw_material_id FROM tracked_materials WHERE business_id = ? AND raw_material_id IS NOT NULL',
      [businessId]
    );
    const alreadyTracked = new Set(existingRows.map((row) => row.raw_material_id));
    const toInsert = rawMaterials.filter((rm) => !alreadyTracked.has(rm.id));

    for (const rawMaterial of toInsert) {
      await connection.execute(
        `INSERT INTO tracked_materials (business_id, raw_material_id, custom_name, unit_id, is_tracked)
         VALUES (?, ?, NULL, ?, TRUE)`,
        [businessId, rawMaterial.id, rawMaterial.default_unit_id]
      );
    }

    await connection.commit();
    return { materialsGenerated: toInsert.length };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Added in Phase A (Automatic Price Ingestion) — purely additive, nothing
// above changed.
//
// Find all actively-tracked materials that have opted into automatic price
// ingestion for a given external commodity symbol (e.g. 'WTI', 'BRENT').
// Returns (id, business_id) only — the minimal set needed to call
// priceRepository.create() and alertEvaluationService.evaluateMaterial().
//
// custom materials (raw_material_id IS NULL) are included if they
// happen to have external_symbol set — this is intentional: a user
// can track a custom "Crude Oil" material and link it to WTI.
async function findTrackedByExternalSymbol(symbol) {
  const [rows] = await pool.execute(
    `SELECT id, business_id
     FROM tracked_materials
     WHERE external_symbol = ? AND is_tracked = TRUE`,
    [symbol]
  );
  return rows;
}

// Added in Phase B (External Symbol Management) — purely additive.
//
// Sets or clears the external_symbol for a tracked material. Ownership MUST
// have already been confirmed via findByIdForBusiness() before calling this —
// same contract as updateTrackingStatus(). Never updates a row by id alone.
async function updateExternalSymbol(materialId, externalSymbol) {
  await pool.execute(
    'UPDATE tracked_materials SET external_symbol = ? WHERE id = ?',
    [externalSymbol, materialId]   // externalSymbol may be null (clears the column)
  );
  return findById(materialId);
}

// Added in Phase H (AI Insights Job) -- purely additive, nothing above changed.
//
// Returns ALL actively-tracked materials across ALL businesses, with the
// minimum columns the AI insights job needs:
//   id, business_id, name (resolved), industry_id (from the business row).
//
// industry_id is joined from `businesses` (not tracked_materials) because
// materials are categorised by their owner's industry -- the same association
// the news tagging system uses (news_item_tags.industry_id = businesses.industry_id).
//
// Job-only: this method is NOT called from any controller or route.
// Business isolation for API reads is enforced by findByIdForBusiness() and
// listByBusinessId() which are the only methods exposed to user requests.
async function findAllTracked() {
  const [rows] = await pool.execute(
    `SELECT tm.id,
            tm.business_id,
            tm.raw_material_id,
            COALESCE(rm.name, tm.custom_name) AS name,
            b.industry_id
     FROM tracked_materials tm
     LEFT JOIN raw_materials rm ON rm.id = tm.raw_material_id
     JOIN businesses b ON b.id = tm.business_id
     WHERE tm.is_tracked = TRUE
     ORDER BY tm.business_id ASC, tm.id ASC`
  );
  return rows;
}

module.exports = {
  listByBusinessId,
  findByIdForBusiness,
  findById,
  updateTrackingStatus,
  findCustomByNameForBusiness,
  unitExists,
  createCustom,
  bulkCreateFromTemplate,
  findTrackedByExternalSymbol,
  updateExternalSymbol,
  findAllTracked,
};

