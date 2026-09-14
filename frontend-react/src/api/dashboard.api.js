/**
 * Dashboard API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/dashboard.api.js (Vanilla JS v1.0)
 * Change: import path updated — client.js is now in the same directory.
 *
 * Doc 3 §3, §5.4 — js/api/dashboard.api.js
 *
 * Endpoint: GET /api/v1/dashboard
 * Auth: Required (JWT via authMiddleware)
 * Query params: None
 *
 * Response shape (confirmed from dashboardAggregation.service.js):
 * {
 *   trackedMaterials:  [{ id, name, latestPrice: number | null }],
 *   recentNews:        [{ id, title }],
 *   activeAlertRules:  [{ id, conditionType, thresholdPrice }],
 *   recentAlertEvents: [{ id, triggeredAt }],
 *   sync: { lastPriceSyncAt: string|null, lastNewsSyncAt: string|null }
 * }
 *
 * IMPORTANT:
 *   - latestPrice is a raw scalar number | null — NOT an object
 *   - significantChange is deliberately absent — do not reference it
 *   - recentNews/recentAlertEvents capped at 5 server-side
 *   - activeAlertRules: { id, conditionType, thresholdPrice } only — no materialName
 *   - recentAlertEvents: { id, triggeredAt } only — no materialName, no conditionType
 *   - sync timestamps may both be null in v1 — expected, not an error
 */

import { get } from './client.js';

/**
 * Fetch the dashboard aggregation data.
 *
 * GET /api/v1/dashboard — requires auth
 *
 * @returns {Promise<{
 *   trackedMaterials:  Array<{ id: number, name: string, latestPrice: number|null }>,
 *   recentNews:        Array<{ id: number, title: string }>,
 *   activeAlertRules:  Array<{ id: number, conditionType: string, thresholdPrice: number }>,
 *   recentAlertEvents: Array<{ id: number, triggeredAt: string }>,
 *   sync:              { lastPriceSyncAt: string|null, lastNewsSyncAt: string|null },
 * }>}
 * @throws {ApiError} — 401 auth, 404 business not found, 500 server error
 */
export async function getDashboard() {
  const { data } = await get('/dashboard');
  return data;
}
