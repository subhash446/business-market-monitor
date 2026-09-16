/**
 * AI Market Intelligence API module
 * Business Market Monitor — React frontend
 *
 * Phase H — Step 6B
 *
 * Endpoints (all require JWT auth):
 *
 *   GET /api/v1/materials/:materialId/ai-insights/latest
 *     Returns the most-recent AI insight for one tracked material.
 *     Response: data: InsightRow | null  (null = no insight generated yet)
 *
 *   GET /api/v1/materials/:materialId/ai-insights?page=&limit=
 *     Returns paginated insight history for one tracked material.
 *     Response: data: InsightRow[], meta: { page, limit, total, totalPages }
 *
 *   GET /api/v1/ai-insights/business/latest?limit=N
 *     Returns up to N most-recent insights across all tracked materials.
 *     Used by the dashboard panel. Default N=3, max N=10.
 *     Response: data: InsightRow[]
 *
 * InsightRow shape (confirmed from aiInsightQuery.service.js formatInsight):
 * {
 *   id:                          number,
 *   tracked_material_id:         number,
 *   headline:                    string,
 *   what_happened:               string,
 *   why_it_happened:             string,
 *   business_impact:             string,
 *   outlook:                     'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE',
 *   confidence:                  'LOW' | 'MEDIUM' | 'HIGH',
 *   evidence_price_range:        string | null,
 *   evidence_price_points_count: number,
 *   evidence_news_count:         number,
 *   model_used:                  string,
 *   generated_at:                string,  -- ISO datetime
 * }
 *
 * SECURITY: This module only reads stored insights. It never triggers
 * AI generation. The Gemini API key never appears here.
 */

import { get } from './client.js';

/**
 * Fetch the latest AI insight for one tracked material.
 * Returns null if no insight has been generated yet (not an error).
 *
 * @param {number|string} materialId  — tracked_materials.id
 * @returns {Promise<object|null>}
 */
export async function getLatestInsight(materialId) {
  const { data } = await get(`/materials/${materialId}/ai-insights/latest`);
  return data; // null when no insight exists yet
}

/**
 * Fetch paginated AI insight history for one tracked material.
 *
 * @param {number|string} materialId
 * @param {{ page?: number, limit?: number }} opts
 * @returns {Promise<{ data: object[], meta: object }>}
 */
export async function getInsightHistory(materialId, { page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  const { data, meta } = await get(`/materials/${materialId}/ai-insights?${params}`);
  return { data, meta };
}

/**
 * Fetch the most-recent AI insights across all of the business's tracked
 * materials. Used by the dashboard panel.
 *
 * @param {number} [limit=3]  — 1–10 (server-side cap)
 * @returns {Promise<object[]>}
 */
export async function getBusinessLatestInsights(limit = 3) {
  const params = new URLSearchParams({ limit });
  const { data } = await get(`/ai-insights/business/latest?${params}`);
  return data ?? [];
}
