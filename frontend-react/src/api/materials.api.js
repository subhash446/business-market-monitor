/**
 * Materials API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/materials.api.js (Vanilla JS v1.0)
 * Change: import path updated — client.js is now in the same directory.
 *
 * Doc 3 §3 — js/api/materials.api.js
 *
 * Endpoints (all mounted under /api/v1/):
 *
 *   GET  /materials
 *     Response: [{ id, rawMaterialId, name, unit, isTracked, isCustom, createdAt }]
 *
 *   POST /materials
 *     Body:     { customName: string, unitId: number }
 *     Response: { id, rawMaterialId, name, unit, isTracked, isCustom, createdAt }  (201)
 *     Errors:   400 VALIDATION_ERROR (invalid unitId), 409 CONFLICT (duplicate name)
 *
 *   PATCH /materials/:materialId
 *     Body:     { isTracked: boolean }  — ONLY this field; any other field → 400
 *     Response: { id, rawMaterialId, name, unit, isTracked, isCustom, createdAt }
 *     Errors:   400 VALIDATION_ERROR, 404 NOT_FOUND
 *
 *   GET  /units-of-measurement  (public — no auth required)
 *     Response: [{ id, name, abbreviation }]
 *
 * CONFIRMED from backend source (materialTracking.service.js toPublicMaterial):
 *   - `name`  = COALESCE(raw_materials.name, tracked_materials.custom_name)
 *   - `unit`  = units_of_measurement.abbreviation  (e.g. "kg", "t")
 *   - `isCustom` = rawMaterialId === null
 *   - NO `customName` field in responses
 *   - NO `significantChange` field
 *
 * IMPORTANT: The `id` returned is tracked_materials.id — this is the universal
 *   material ID used by all downstream endpoints (prices, trends, alerts).
 */

import { get, post, patch } from './client.js';

/**
 * Fetch all tracked materials for the authenticated business.
 * @returns {Promise<Array<{id:number, name:string, unit:string, isTracked:boolean, isCustom:boolean}>>}
 */
export async function getMaterials() {
  const { data } = await get('/materials');
  return data;
}

/**
 * Create a custom material.
 * POST /api/v1/materials
 * @param {{ customName: string, unitId: number }} body
 * @returns {Promise<{id, name, unit, isTracked, isCustom}>}
 * @throws 409 CONFLICT on duplicate name
 */
export async function createMaterial({ customName, unitId }) {
  const { data } = await post('/materials', { customName, unitId });
  return data;
}

/**
 * Toggle tracking state for a material.
 * PATCH /api/v1/materials/:materialId
 * Body: { isTracked: boolean } — the ONLY allowed field.
 * @param {number|string} materialId
 * @param {boolean} isTracked
 * @returns {Promise<{id, name, unit, isTracked, isCustom, externalSymbol}>}
 */
export async function updateMaterialTracking(materialId, isTracked) {
  const { data } = await patch(`/materials/${materialId}`, { isTracked });
  return data;
}

/**
 * Set or clear the external commodity symbol for a tracked material.
 * PATCH /api/v1/materials/:materialId/external-symbol
 *
 * Phase B endpoint — allows linking a tracked material to automatic price
 * ingestion from an external provider (EIA).
 *
 * @param {number|string} materialId  tracked_materials.id
 * @param {'WTI'|'BRENT'|null} externalSymbol  null clears the mapping
 * @returns {Promise<{id, name, unit, isTracked, isCustom, externalSymbol}>}
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
