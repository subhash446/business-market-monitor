/**
 * Raw Material Tracking module (Document 2 §5.5, Document 5 §4.5).
 * Also serves Industry Template review (FR-TPL-02) — no dedicated Template
 * endpoints exist (Document 5 §4.4).
 *
 * Phase 6A: listMaterials (supports ?trackedOnly=true), updateMaterial (isTracked, customName, unitId).
 * Phase 6B: addMaterial (custom materials, FR-MAT-02).
 *
 * Uses shared resolveBusinessId utility for tenant isolation.
 */
const materialTrackingService = require('../services/materialTracking.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/materials — FR-MAT-01, 02, 03, FR-TPL-02
async function listMaterials(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const trackedOnly = req.query.trackedOnly === 'true';
    const materials = await materialTrackingService.listMaterials(businessId, trackedOnly);
    sendSuccess(res, materials);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/materials/:materialId — FR-MAT-01, 03
async function updateMaterial(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { isTracked, customName, unitId } = req.body;
    const material = await materialTrackingService.updateMaterial(
      businessId,
      req.params.materialId,
      { isTracked, customName, unitId }
    );
    sendSuccess(res, material);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/materials — FR-MAT-02
async function addMaterial(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { customName, unitId } = req.body;
    const material = await materialTrackingService.createCustomMaterial(businessId, { customName, unitId });
    sendSuccess(res, material, undefined, 201);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/materials/:materialId/external-symbol — Phase B
async function setExternalSymbol(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { externalSymbol } = req.body; // null | 'WTI' | 'BRENT' — already validated
    const material = await materialTrackingService.setExternalSymbol(
      businessId,
      req.params.materialId,
      externalSymbol
    );
    sendSuccess(res, material);
  } catch (err) {
    next(err);
  }
}

module.exports = { listMaterials, updateMaterial, addMaterial, setExternalSymbol };
