/**
 * Trends API module
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §3, Doc 4 §9.1 — js/api/trends.api.js
 *
 * Endpoints (mounted at /api/v1/materials alongside prices.routes.js):
 *
 *   GET  /materials/:materialId/prices/history
 *     Query params (all optional):
 *       from   : ISO date string — start of range
 *       to     : ISO date string — end of range
 *       page   : number (default 1)
 *       limit  : number (default 20, max server-determined)
 *     Response:
 *       data:  [{ price: number, recordedAt: string }]  — ASC by recordedAt
 *       meta:  { page, limit, total, totalPages }
 *     Errors:
 *       404 NOT_FOUND — materialId not found for this business
 *
 *   GET  /materials/prices/compare
 *     Query params:
 *       materialIds : string — comma-separated list of 1–5 numeric IDs (required)
 *       from        : ISO date string (optional)
 *       to          : ISO date string (optional)
 *     Response:
 *       data: [
 *         {
 *           materialId: number,
 *           name:       string,    -- use directly as chart legend label
 *           series:     [{ price: number, recordedAt: string }]
 *         }
 *       ]
 *     Errors:
 *       400 — materialIds missing/invalid/out-of-range (1–5)
 *       404 NOT_FOUND — any materialId not found for this business
 *
 * CONFIRMED from backend source (trendQuery.service.js):
 *   - getPriceHistory items: { price, recordedAt } — NO unit field in series
 *   - compareMaterials: array of { materialId, name, series: [{price, recordedAt}] }
 *   - name is COALESCE(raw_materials.name, custom_name) — ready to use as label
 *   - unit must come from the material object loaded via GET /materials
 */

import { get } from '../api/client.js';

/** How many history points to request per page (Doc 4 §9.1) */
export const HISTORY_LIMIT = 50;

/**
 * Get paginated price history for one material.
 *
 * @param {number|string} materialId
 * @param {{ from?: string, to?: string, page?: number }} opts
 * @returns {Promise<{ data: Array<{price,recordedAt}>, meta: {page,limit,total,totalPages} }>}
 */
export async function getPriceHistory(materialId, { from, to, page = 1 } = {}) {
  const params = new URLSearchParams({ page, limit: HISTORY_LIMIT });
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);

  const { data, meta } = await get(`/materials/${materialId}/prices/history?${params}`);
  return { data, meta };
}

/**
 * Compare price series for multiple materials.
 *
 * @param {Array<number|string>} materialIds — 1–5 ids
 * @param {{ from?: string, to?: string }} opts
 * @returns {Promise<Array<{materialId, name, series: Array<{price, recordedAt}>}>>}
 */
export async function comparePrices(materialIds, { from, to } = {}) {
  const params = new URLSearchParams({ materialIds: materialIds.join(',') });
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);

  const { data } = await get(`/materials/prices/compare?${params}`);
  return data; // array of { materialId, name, series }
}
