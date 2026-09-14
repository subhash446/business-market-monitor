/**
 * Raw Material Tracking module (Document 2 §5.5, Document 5 §4.5).
 * Also serves Industry Template review (FR-TPL-02) — no dedicated Template
 * endpoints exist (Document 5 §4.4).
 *
 * Phase 6A: listMaterials, updateMaterial. Phase 6B: addMaterial (custom
 * materials, FR-MAT-02).
 *
 * Production Hardening Phase B, finding A2: this file previously defined
 * its own local resolveBusinessId(), duplicating utils/resolveBusinessId.js
 * used by every other controller (dashboard, news, price, trend, alert).
 * Now uses the shared utility, matching the rest of the project.
 */
const materialTrackingService = require('../services/materialTracking.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/materials — FR-MAT-01, 02, 03, FR-TPL-02
async function listMaterials(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const materials = await materialTrackingService.listMaterials(businessId);
    sendSuccess(res, materials);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/materials/:materialId — FR-MAT-01, 03
async function updateMaterial(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { isTracked } = req.body;
    const material = await materialTrackingService.updateMaterial(businessId, req.params.materialId, { isTracked });
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
    const { externalSymbol } = req.body;   // null | 'WTI' | 'BRENT' — already validated
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
