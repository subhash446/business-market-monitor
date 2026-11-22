/**
 * Analytics & ROI API module (V3-M5).
 * Business Market Monitor — React frontend
 */

import { get } from './client.js';

/**
 * Fetch procurement savings ROI calculation.
 * GET /api/v1/analytics/savings-roi
 * @returns {Promise<Object>}
 */
export async function getSavingsRoi() {
  const { data } = await get('/analytics/savings-roi');
  return data;
}
