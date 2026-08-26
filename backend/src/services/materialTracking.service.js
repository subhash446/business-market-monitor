/**
 * Raw Material Tracking business logic (Document 2 §5.5 FR-MAT-01, 03,
 * Document 3 §5 MaterialTrackingService). Framework-agnostic — no req/res,
 * no SQL (Document 3 §3).
 *
 * Phase 6A scope only: list materials for a business, and toggle isTracked.
 * Adding custom materials (FR-MAT-02) is explicitly out of scope.
 *
 * businessId is resolved by the caller via businessRepository.findByUserId()
 * (see material.controller.js) — NOT from the JWT's businessId claim, which
 * is still always null (a gap flagged in Phase 3, never closed back in
 * Authentication). This service takes businessId as a plain argument either
 * way, so it doesn't care how the caller obtained it.
 */
const materialRepository = require('../repositories/material.repository');
const AppError = require('../utils/AppError');

async function listMaterials(businessId) {
  const rows = await materialRepository.listByBusinessId(businessId);
  return rows.map(toPublicMaterial);
}

async function updateMaterial(businessId, materialId, { isTracked }) {
  const existing = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const updated = await materialRepository.updateTrackingStatus(materialId, isTracked);
  return toPublicMaterial(updated);
}

// Added in Phase 6B (Custom Materials, FR-MAT-02) — reuses toPublicMaterial()
// below, no response-shaping code duplicated from listMaterials/updateMaterial.
async function createCustomMaterial(businessId, { customName, unitId }) {
  const unitValid = await materialRepository.unitExists(unitId);
  if (!unitValid) {
    throw new AppError(400, 'VALIDATION_ERROR', 'unitId does not reference a known unit of measurement');
  }

  const existing = await materialRepository.findCustomByNameForBusiness(businessId, customName);
  if (existing) {
    throw new AppError(409, 'CONFLICT', 'A custom material with this name already exists for this business');
  }

  // Known limitation, stated plainly (same spirit as Document 4 §10.3):
  // there is no DB-level unique constraint backing this check — the frozen
  // schema (Document 4 §5.4) has none on (business_id, custom_name), and
  // adding one (e.g. via a generated column for case-insensitive uniqueness)
  // would be a schema change, which this phase is not authorized to make.
  // A narrow race condition exists: two simultaneous requests with the same
  // name could both pass this check. Acceptable for V1 at this scale, not
  // silently assumed safe.
  const material = await materialRepository.createCustom({ businessId, customName, unitId });
  return toPublicMaterial(material);
}

function toPublicMaterial(row) {
  return {
    id: row.id,
    rawMaterialId: row.raw_material_id,
    name: row.name,
    unit: row.unit_abbreviation,
    isTracked: !!row.is_tracked,
    isCustom: row.raw_material_id === null,
    createdAt: row.created_at,
  };
}

module.exports = { listMaterials, updateMaterial, createCustomMaterial };
