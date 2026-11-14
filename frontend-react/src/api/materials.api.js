/**
 * Materials API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/materials.api.js (Vanilla JS v1.0)
 *
 * Doc 3 §3 — js/api/materials.api.js
 * Doc 5 §4.5 — Raw Material Tracking Module
 *
 * Endpoints (all mounted under /api/v1/):
 *
 *   GET  /materials[?trackedOnly=true]
 *     Response: [{ id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol, createdAt }]
 *
 *   POST /materials
 *     Body:     { customName: string, unitId: number }
 *     Response: { id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol, createdAt }  (201)
 *     Errors:   400 VALIDATION_ERROR (invalid unitId), 409 CONFLICT (duplicate name)
 *
 *   PATCH /materials/:materialId
 *     Body:     { isTracked?: boolean, customName?: string, unitId?: number }
 *     Response: { id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol, createdAt }
 *     Errors:   400 VALIDATION_ERROR, 404 NOT_FOUND, 409 CONFLICT
 *
 *   PATCH /materials/:materialId/external-symbol
 *     Body:     { externalSymbol: string|null }
 *
 *   GET  /units-of-measurement  (public — no auth required)
 *     Response: [{ id, name, abbreviation }]
 */

import { get, post, patch } from './client.js';

/**
 * Fetch materials for the authenticated business.
 * @param {boolean} [trackedOnly=false]
 * @returns {Promise<Array<{id:number, rawMaterialId:number|null, name:string, unit:string, isTracked:boolean, isCustom:boolean, externalSymbol:string|null}>>}
 */
export async function getMaterials(trackedOnly = false) {
  const query = trackedOnly ? '?trackedOnly=true' : '';
  const { data } = await get(`/materials${query}`);
  return data;
}

/**
 * Create a custom material.
 * POST /api/v1/materials
 * @param {{ customName: string, unitId: number }} body
 * @returns {Promise<{id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol}>}
 * @throws 409 CONFLICT on duplicate name
 */
export async function createMaterial({ customName, unitId }) {
  const { data } = await post('/materials', { customName, unitId });
  return data;
}

/**
 * Update material fields (isTracked, customName, unitId).
 * PATCH /api/v1/materials/:materialId
 * @param {number|string} materialId
 * @param {{ isTracked?: boolean, customName?: string, unitId?: number }} updates
 * @returns {Promise<{id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol}>}
 */
export async function updateMaterial(materialId, updates) {
  const { data } = await patch(`/materials/${materialId}`, updates);
  return data;
}

/**
 * Toggle tracking state for a material.
 * PATCH /api/v1/materials/:materialId
 * Body: { isTracked: boolean }
 * @param {number|string} materialId
 * @param {boolean} isTracked
 * @returns {Promise<{id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol}>}
 */
export async function updateMaterialTracking(materialId, isTracked) {
  return updateMaterial(materialId, { isTracked });
}

/**
 * Set or clear the external commodity symbol for a tracked material.
 * PATCH /api/v1/materials/:materialId/external-symbol
 *
 * @param {number|string} materialId  tracked_materials.id
 * @param {string|null} externalSymbol  null clears the mapping
 * @returns {Promise<{id, rawMaterialId, name, unit, isTracked, isCustom, externalSymbol}>}
 * @throws 400 VALIDATION_ERROR — unsupported symbol or wrong type
 * @throws 404 NOT_FOUND — material not found or belongs to another business
 */
export async function setExternalSymbol(materialId, externalSymbol) {
  const { data } = await patch(`/materials/${materialId}/external-symbol`, { externalSymbol });
  return data;
}

/**
 * Fetch all units of measurement (public endpoint — no auth needed).
 * GET /api/v1/units-of-measurement
 * @returns {Promise<Array<{id:number, name:string, abbreviation:string}>>}
 */
export async function getUnitsOfMeasurement() {
  const { data } = await get('/units-of-measurement');
  return data;
}

/**
 * Fetch supplier sourcing recommendations for a single tracked material (T-08).
 * GET /api/v1/materials/:materialId/supplier-recommendations
 *
 * @param {number|string} materialId
 * @returns {Promise<Object>}
 */
export async function getMaterialSupplierRecommendations(materialId) {
  const { data } = await get(`/materials/${materialId}/supplier-recommendations`);
  return data;
}
