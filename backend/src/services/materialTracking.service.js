/**
 * Raw Material Tracking business logic (Document 2 §5.5 FR-MAT-01, 02, 03, 04,
 * Document 3 §5 MaterialTrackingService, Document 5 §4.5).
 * Framework-agnostic — no req/res, no SQL (Document 3 §3).
 *
 * Phase 6A scope:
 *   - listMaterials: list materials for a business, optional trackedOnly filter.
 *   - updateMaterial: toggle isTracked, or edit custom material customName/unitId.
 * Phase 6B scope:
 *   - createCustomMaterial: add custom raw material with duplicate prevention (FR-MAT-02).
 *
 * Tenant isolation: businessId is resolved from authenticated user by controller
 * and passed explicitly. All reads and writes are strictly scoped to businessId.
 */
const materialRepository = require('../repositories/material.repository');
const AppError = require('../utils/AppError');

async function listMaterials(businessId, trackedOnly = false) {
  const rows = await materialRepository.listByBusinessId(businessId, trackedOnly);
  return rows.map(toPublicMaterial);
}

async function updateMaterial(businessId, materialId, { isTracked, customName, unitId }) {
  const existing = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  // Attempting to change customName or unitId on a KB-linked material (rawMaterialId not null)
  const hasCustomField = customName !== undefined || unitId !== undefined;
  if (hasCustomField && existing.raw_material_id !== null) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Attempting to change customName/unitId on a KB-linked material'
    );
  }

  let trimmedCustomName;
  if (customName !== undefined) {
    trimmedCustomName = String(customName).trim();
    const duplicate = await materialRepository.findCustomByNameForBusiness(businessId, trimmedCustomName);
    if (duplicate && duplicate.id !== Number(materialId)) {
      throw new AppError(
        409,
        'CONFLICT',
        'A custom material with this name already exists for this business'
      );
    }
  }

  if (unitId !== undefined) {
    const unitValid = await materialRepository.unitExists(unitId);
    if (!unitValid) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'unitId does not reference a known unit of measurement'
      );
    }
  }

  let updated;
  if (trimmedCustomName !== undefined || unitId !== undefined) {
    updated = await materialRepository.updateMaterial(materialId, {
      isTracked,
      customName: trimmedCustomName,
      unitId,
    });
  } else {
    updated = await materialRepository.updateTrackingStatus(materialId, isTracked);
  }

  return toPublicMaterial(updated);
}

// Phase 6B (Custom Materials, FR-MAT-02) — reuses toPublicMaterial()
async function createCustomMaterial(businessId, { customName, unitId }) {
  const unitValid = await materialRepository.unitExists(unitId);
  if (!unitValid) {
    throw new AppError(400, 'VALIDATION_ERROR', 'unitId does not reference a known unit of measurement');
  }

  const trimmedName = String(customName).trim();
  const existing = await materialRepository.findCustomByNameForBusiness(businessId, trimmedName);
  if (existing) {
    throw new AppError(409, 'CONFLICT', 'A custom material with this name already exists for this business');
  }

  const material = await materialRepository.createCustom({
    businessId,
    customName: trimmedName,
    unitId,
  });
  return toPublicMaterial(material);
}

// Added in Phase B (External Symbol Management) — purely additive.
async function setExternalSymbol(businessId, materialId, externalSymbol) {
  const existing = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const updated = await materialRepository.updateExternalSymbol(materialId, externalSymbol);
  return toPublicMaterial(updated);
}

function toPublicMaterial(row) {
  return {
    id: row.id,
    rawMaterialId: row.raw_material_id,
    name: row.name,
    unit: row.unit_abbreviation,
    isTracked: !!row.is_tracked,
    isCustom: row.raw_material_id === null,
    externalSymbol: row.external_symbol || null,
    createdAt: row.created_at,
  };
}

module.exports = {
  listMaterials,
  updateMaterial,
  createCustomMaterial,
  setExternalSymbol,
};
