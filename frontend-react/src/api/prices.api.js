/**
 * Prices API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/prices.api.js (Vanilla JS v1.0)
 * Change: import path updated — client.js is now in the same directory.
 *
 * Doc 3 §3 — js/api/prices.api.js
 *
 * Endpoints (all mounted at /api/v1/materials/:materialId/...):
 *
 *   GET  /materials/:materialId/prices/latest
 *     Response (200): { price: number, recordedAt: string, source: string }
 *     Error (404):    "No price recorded yet for this material" — semantic empty,
 *                     NOT a generic application failure. Handle as informational state.
 *     Error (404):    "Material not found" — genuine not-found error.
 *     NOTE: response does NOT contain a `unit` field. Unit comes from the material object.
 *
 *   POST /materials/:materialId/prices
 *     Body (required):
 *       { price: number (>0), recordedAt: string (ISO date, not future) }
 *     Response (201): { id: number, price: number, recordedAt: string, source: "MANUAL" }
 *     Error (400):    price ≤ 0, recordedAt missing/invalid/future
 *     Error (404):    material not found or is not currently tracked
 *
 * CONFIRMED from backend source:
 *   - priceQuery.service.js: getLatestPrice → { price, recordedAt, source }
 *   - priceIngestion.service.js: addManualPrice → { id, price, recordedAt, source }
 *   - price.repository.js: findLatestByMaterialId returns null when no price → service throws 404
 *   - No history pagination on prices page (that is Trends/phase 4B-3)
 */

import { get, post } from './client.js';

/**
 * Get the latest recorded price for a material.
 *
 * Returns null when the backend responds 404 with code 'NOT_FOUND'
 * (semantic "no price yet" state). Re-throws any other error.
 *
 * @param {number|string} materialId
 * @returns {Promise<{price: number, recordedAt: string, source: string}|null>}
 */
export async function getLatestPrice(materialId) {
  try {
    const { data } = await get(`/materials/${materialId}/prices/latest`);
    return data;
  } catch (err) {
    // 404 means "no price recorded yet" — return null for semantic empty state
    // (Doc 4 §5.1: "do not render the error-state component")
    if (err?.status === 404) return null;
    throw err;
  }
}

/**
 * Log a new price entry for a material.
 * POST /api/v1/materials/:materialId/prices
 *
 * @param {number|string} materialId
 * @param {{ price: number, recordedAt: string }} body
 * @returns {Promise<{id: number, price: number, recordedAt: string, source: string}>}
 */
export async function logPrice(materialId, { price, recordedAt }) {
  const { data } = await post(`/materials/${materialId}/prices`, { price, recordedAt });
  return data;
}
