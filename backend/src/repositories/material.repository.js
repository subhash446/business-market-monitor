/**
 * All queries against `tracked_materials` (Document 4 §5.4).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Phase 6A: list (with optional trackedOnly filter) + scoped find + update(isTracked, customName, unitId).
 * Phase 6B: createCustom (custom materials, FR-MAT-02) with duplicate prevention.
 * No delete endpoint — stopping tracking via isTracked = false preserves price history (FR-MAT-03).
 *
 * Every method that touches a specific row scopes by business_id, never a
 * bare id alone — this is what enforces business isolation (Document 5 §2.4).
 */
const { pool } = require('../database/connection');
const { isStrictPositiveInteger } = require('../utils/validationHelpers');

function assertBusinessId(businessId, operation) {
  if (!isStrictPositiveInteger(businessId)) {
    throw new Error(`businessId must be a positive integer for ${operation}`);
  }
}

const BASE_SELECT = `
  SELECT tm.id, tm.raw_material_id, tm.unit_id, COALESCE(rm.name, tm.custom_name) AS name,
         u.abbreviation AS unit_abbreviation, tm.is_tracked, tm.external_symbol,
         tm.current_stock_qty, tm.daily_consumption_rate, tm.supplier_lead_time_days,
         tm.max_storage_days, tm.inventory_updated_at,
         tm.landed_unit_factor, tm.landed_duty_freight_pct, tm.landed_fixed_spread_inr,
         tm.landed_config_updated_at,
         tm.created_at
  FROM tracked_materials tm
  LEFT JOIN raw_materials rm ON rm.id = tm.raw_material_id
  JOIN units_of_measurement u ON u.id = tm.unit_id
`;

async function listByBusinessId(businessId, trackedOnly = false) {
  let query = `${BASE_SELECT} WHERE tm.business_id = ?`;
  const params = [businessId];

  if (trackedOnly) {
    query += ' AND tm.is_tracked = TRUE';
  }

  query += ' ORDER BY name ASC';

  const [rows] = await pool.execute(query, params);
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

async function updateMaterial(materialId, { isTracked, customName, unitId }, businessId) {
  assertBusinessId(businessId, 'updateMaterial');
  const updates = [];
  const params = [];

  if (isTracked !== undefined) {
    updates.push('is_tracked = ?');
    params.push(isTracked);
  }
  if (customName !== undefined) {
    updates.push('custom_name = ?');
    params.push(customName);
  }
  if (unitId !== undefined) {
    updates.push('unit_id = ?');
    params.push(unitId);
  }

  if (updates.length > 0) {
    params.push(materialId, businessId);
    const [result] = await pool.execute(
      `UPDATE tracked_materials SET ${updates.join(', ')} WHERE id = ? AND business_id = ?`,
      params
    );
    if (result && result.affectedRows === 0) {
      return null;
    }
  }

  return findByIdForBusiness(materialId, businessId);
}

async function updateTrackingStatus(materialId, isTracked, businessId) {
  assertBusinessId(businessId, 'updateTrackingStatus');
  const [result] = await pool.execute(
    'UPDATE tracked_materials SET is_tracked = ? WHERE id = ? AND business_id = ?',
    [isTracked, materialId, businessId]
  );
  if (result && result.affectedRows === 0) {
    return null;
  }
  return findByIdForBusiness(materialId, businessId);
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

// Added in Production Hardening Phase B (finding A1) and updated in Phase 5
// (Automatic Business-to-Material Mapping).
//
// rawMaterials: [{ id, default_unit_id, default_external_symbol, external_symbol }, ...]
//
// Returns { materialsGenerated: count, createdMaterials: [{ id, rawMaterialId, businessId, unitId, externalSymbol }] }
async function bulkCreateFromTemplate(businessId, rawMaterials) {
  if (!rawMaterials || rawMaterials.length === 0) {
    return { materialsGenerated: 0, createdMaterials: [] };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Never generate duplicates, and safe to call more than once for the
    // same business (idempotent) — check what's already tracked first,
    // inside this same transaction/connection.
    const [existingRows] = await connection.execute(
      'SELECT raw_material_id FROM tracked_materials WHERE business_id = ? AND raw_material_id IS NOT NULL',
      [businessId]
    );
    const alreadyTracked = new Set(existingRows.map((row) => row.raw_material_id));
    const toInsert = rawMaterials.filter((rm) => !alreadyTracked.has(rm.id));

    const createdMaterials = [];
    for (const rawMaterial of toInsert) {
      const externalSymbol = rawMaterial.external_symbol || rawMaterial.default_external_symbol || null;
      const [insertResult] = await connection.execute(
        `INSERT INTO tracked_materials (business_id, raw_material_id, custom_name, unit_id, is_tracked, external_symbol)
         VALUES (?, ?, NULL, ?, TRUE, ?)`,
        [businessId, rawMaterial.id, rawMaterial.default_unit_id, externalSymbol]
      );
      createdMaterials.push({
        id: insertResult.insertId,
        rawMaterialId: rawMaterial.id,
        businessId,
        unitId: rawMaterial.default_unit_id,
        externalSymbol,
      });
    }

    await connection.commit();
    return { materialsGenerated: toInsert.length, createdMaterials };
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
// Intentionally system-wide read-only discovery query for scheduled price ingestion:
// returns (id, business_id) so downstream ingestion & alert evaluation remain tenant-scoped.
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
// Sets or clears the external_symbol for a tracked material, strictly scoped by business_id.
async function updateExternalSymbol(materialId, externalSymbol, businessId) {
  assertBusinessId(businessId, 'updateExternalSymbol');
  const [result] = await pool.execute(
    'UPDATE tracked_materials SET external_symbol = ? WHERE id = ? AND business_id = ?',
    [externalSymbol, materialId, businessId] // externalSymbol may be null (clears the column)
  );
  if (result && result.affectedRows === 0) {
    return null;
  }
  return findByIdForBusiness(materialId, businessId);
}

// Intentionally system-wide read-only discovery query for scheduled AI insight generation:
// returns material.business_id + industry_id per row so generated insights are strictly tenant-scoped.

// Added in Phase H (AI Insights Job) -- purely additive, nothing above changed.
//
// Returns ALL actively-tracked materials across ALL businesses, with the
// minimum columns the AI insights job needs:
//   id, business_id, name (resolved), industry_id (from the business row).
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

// Added in V3-M1 (Inventory Profile Management) — purely additive.
async function updateInventoryProfile(materialId, inventoryData, businessId) {
  assertBusinessId(businessId, 'updateInventoryProfile');
  const updates = [];
  const params = [];

  if (inventoryData.currentStockQty !== undefined) {
    updates.push('current_stock_qty = ?');
    params.push(inventoryData.currentStockQty);
  }
  if (inventoryData.dailyConsumptionRate !== undefined) {
    updates.push('daily_consumption_rate = ?');
    params.push(inventoryData.dailyConsumptionRate);
  }
  if (inventoryData.supplierLeadTimeDays !== undefined) {
    updates.push('supplier_lead_time_days = ?');
    params.push(inventoryData.supplierLeadTimeDays);
  }
  if (inventoryData.maxStorageDays !== undefined) {
    updates.push('max_storage_days = ?');
    params.push(inventoryData.maxStorageDays);
  }

  // Refinement 2: Set inventory_updated_at = NOW() when inventory values are saved with non-null currentStockQty,
  // and reset to NULL if currentStockQty is explicitly cleared to null.
  if (inventoryData.currentStockQty !== undefined) {
    if (inventoryData.currentStockQty !== null) {
      updates.push('inventory_updated_at = NOW()');
    } else {
      updates.push('inventory_updated_at = NULL');
    }
  }

  if (updates.length > 0) {
    params.push(materialId, businessId);
    const [result] = await pool.execute(
      `UPDATE tracked_materials SET ${updates.join(', ')} WHERE id = ? AND business_id = ?`,
      params
    );
    if (result && result.affectedRows === 0) {
      return null;
    }
  }

  return findByIdForBusiness(materialId, businessId);
}

// Added in V3-M3 (Landed Cost Configuration) — purely additive.
async function updateLandedCost(materialId, landedData, businessId) {
  assertBusinessId(businessId, 'updateLandedCost');
  const updates = [];
  const params = [];

  if (landedData.landedUnitFactor !== undefined) {
    updates.push('landed_unit_factor = ?');
    params.push(landedData.landedUnitFactor);
  }
  if (landedData.landedDutyFreightPct !== undefined) {
    updates.push('landed_duty_freight_pct = ?');
    params.push(landedData.landedDutyFreightPct);
  }
  if (landedData.landedFixedSpreadInr !== undefined) {
    updates.push('landed_fixed_spread_inr = ?');
    params.push(landedData.landedFixedSpreadInr);
  }

  // Refinement 3: Set landed_config_updated_at = NOW() on valid save, NULL when cleared.
  if (landedData.landedUnitFactor !== undefined) {
    if (landedData.landedUnitFactor !== null) {
      updates.push('landed_config_updated_at = NOW()');
    } else {
      updates.push('landed_config_updated_at = NULL');
    }
  }

  if (updates.length > 0) {
    params.push(materialId, businessId);
    const [result] = await pool.execute(
      `UPDATE tracked_materials SET ${updates.join(', ')} WHERE id = ? AND business_id = ?`,
      params
    );
    if (result && result.affectedRows === 0) {
      return null;
    }
  }

  return findByIdForBusiness(materialId, businessId);
}

async function findTrackedForBusiness(businessId) {
  return listByBusinessId(businessId, true);
}

module.exports = {
  listByBusinessId,
  findTrackedForBusiness,
  findByIdForBusiness,
  findById,
  updateMaterial,
  updateTrackingStatus,
  findCustomByNameForBusiness,
  unitExists,
  createCustom,
  bulkCreateFromTemplate,
  findTrackedByExternalSymbol,
  updateExternalSymbol,
  updateInventoryProfile,
  updateLandedCost,
  findAllTracked,
};
