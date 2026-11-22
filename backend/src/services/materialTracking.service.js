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
    }, businessId);
  } else {
    updated = await materialRepository.updateTrackingStatus(materialId, isTracked, businessId);
  }

  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
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

  const updated = await materialRepository.updateExternalSymbol(materialId, externalSymbol, businessId);
  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }
  return toPublicMaterial(updated);
}

// Added in V3-M1 (Inventory Profile Management) — purely additive.
async function updateInventoryProfile(businessId, materialId, inventoryData) {
  const existing = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const updated = await materialRepository.updateInventoryProfile(materialId, inventoryData, businessId);
  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }
  return toPublicMaterial(updated);
}

// Added in V3-M3 (Landed Cost Configuration) — purely additive.
async function updateLandedCost(businessId, materialId, landedCostData) {
  const existing = await materialRepository.findByIdForBusiness(materialId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const updated = await materialRepository.updateLandedCost(materialId, landedCostData, businessId);
  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }
  return toPublicMaterial(updated);
}

function toPublicMaterial(row) {
  const result = {
    id: row.id,
    rawMaterialId: row.raw_material_id,
    name: row.name,
    unit: row.unit_abbreviation,
    isTracked: !!row.is_tracked,
    isCustom: row.raw_material_id === null,
    externalSymbol: row.external_symbol || null,
    createdAt: row.created_at,
  };

  // Include inventory profile fields whenever present in the DB row or update payload
  if (row.current_stock_qty !== undefined || row.daily_consumption_rate !== undefined) {
    let inventoryUpdatedAt = row.inventory_updated_at || null;
    if (inventoryUpdatedAt instanceof Date) {
      inventoryUpdatedAt = inventoryUpdatedAt.toISOString();
    }

    const currentStockQty = row.current_stock_qty != null ? Number(row.current_stock_qty) : null;
    const dailyConsumptionRate = row.daily_consumption_rate != null ? Number(row.daily_consumption_rate) : null;
    const supplierLeadTimeDays = row.supplier_lead_time_days != null ? Number(row.supplier_lead_time_days) : null;
    const maxStorageDays = row.max_storage_days != null ? Number(row.max_storage_days) : null;

    result.currentStockQty = currentStockQty;
    result.dailyConsumptionRate = dailyConsumptionRate;
    result.supplierLeadTimeDays = supplierLeadTimeDays;
    result.maxStorageDays = maxStorageDays;
    result.inventoryUpdatedAt = inventoryUpdatedAt;
    result.inventory = {
      currentStockQty,
      dailyConsumptionRate,
      supplierLeadTimeDays,
      maxStorageDays,
      inventoryUpdatedAt,
    };
  }

  // Include landed-cost fields whenever present in the DB row or update payload
  if (row.landed_unit_factor !== undefined || row.landed_duty_freight_pct !== undefined) {
    let landedConfigUpdatedAt = row.landed_config_updated_at || null;
    if (landedConfigUpdatedAt instanceof Date) {
      landedConfigUpdatedAt = landedConfigUpdatedAt.toISOString();
    }

    const landedUnitFactor = row.landed_unit_factor != null ? Number(row.landed_unit_factor) : null;
    const landedDutyFreightPct = row.landed_duty_freight_pct != null ? Number(row.landed_duty_freight_pct) : null;
    const landedFixedSpreadInr = row.landed_fixed_spread_inr != null ? Number(row.landed_fixed_spread_inr) : null;

    result.landedUnitFactor = landedUnitFactor;
    result.landedDutyFreightPct = landedDutyFreightPct;
    result.landedFixedSpreadInr = landedFixedSpreadInr;
    result.landedConfigUpdatedAt = landedConfigUpdatedAt;
    result.landedCost = {
      unitFactor: landedUnitFactor,
      dutyFreightPct: landedDutyFreightPct,
      fixedSpreadInr: landedFixedSpreadInr,
      updatedAt: landedConfigUpdatedAt,
    };
  }

  return result;
}

module.exports = {
  listMaterials,
  updateMaterial,
  createCustomMaterial,
  setExternalSymbol,
  updateInventoryProfile,
  updateLandedCost,
  toPublicMaterial,
};
