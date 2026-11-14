/**
 * Prices API module
 * Business Market Monitor — React frontend
 *
 * Endpoints (all mounted at /api/v1/materials/:materialId/...):
 *
 *   GET  /materials/:materialId/prices/latest
 *     Response (200): { price, recordedAt, source, currency, unitLabel, dataClass, ... }
 *
 *   GET  /materials/:materialId/prices/source-info
 *     Response (200): { materialId, materialName, isProxy, disclaimer, dataClass, currency, ... }
 *
 *   POST /materials/:materialId/prices
 *     Body: { price, recordedAt, currency?, unitLabel?, region?, grade?, sourceUrl? }
 *     Response (201): { id, price, recordedAt, source, currency, unitLabel, dataClass, ... }
 */

import { get, post } from './client.js';

/**
 * Get the latest recorded price for a material.
 *
 * Returns null when the backend responds 404 with code 'NOT_FOUND'
 * (semantic "no price yet" state). Re-throws any other error.
 *
 * @param {number|string} materialId
 * @returns {Promise<object|null>}
 */
export async function getLatestPrice(materialId) {
  try {
    const { data } = await get(`/materials/${materialId}/prices/latest`);
    return data;
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

/**
 * Get detailed classification, provenance, and proxy disclaimer info.
 *
 * @param {number|string} materialId
 * @returns {Promise<object|null>}
 */
export async function getPriceSourceInfo(materialId) {
  try {
    const { data } = await get(`/materials/${materialId}/prices/source-info`);
    return data;
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
}

/**
 * Log a new price entry for a material.
 * POST /api/v1/materials/:materialId/prices
 *
 * @param {number|string} materialId
 * @param {object} priceData
 * @returns {Promise<object>}
 */
export async function logPrice(materialId, priceData) {
  const { data } = await post(`/materials/${materialId}/prices`, priceData);
  return data;
}

/**
 * Bulk upload price records for tracked materials.
 * POST /api/v1/materials/prices/bulk
 *
 * @param {Array<object>} prices
 * @returns {Promise<{ summary: { total: number, inserted: number, skipped: number, failed: number }, results: Array<object> }>}
 */
export async function bulkUploadPrices(prices) {
  const { data } = await post('/materials/prices/bulk', { prices });
  return data;
}
