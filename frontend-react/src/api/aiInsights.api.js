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
 * SECURITY: This module only reads stored insights and structural impact analyses.
 * It never triggers AI generation. The Gemini API key never appears here.
 */

import { ApiError, get } from './client.js';

export const DEFAULT_IMPACT_MAX_DEPTH = 3;
export const HARD_IMPACT_MAX_DEPTH = 4;

/**
 * Fetch read-only multi-hop Knowledge Base impact analysis, empirical evidence,
 * and latest stored AI insight for one tracked material.
 *
 * GET /api/v1/materials/:materialId/impact-analysis[?maxDepth=1..4]
 *
 * @param {number|string} materialId — tracked_materials.id
 * @param {{ maxDepth?: number|string }} [options]
 * @returns {Promise<object>}
 */
export async function getMaterialImpactAnalysis(materialId, { maxDepth } = {}) {
  const matStr = String(materialId ?? '').trim();
  if (!/^[1-9]\d*$/.test(matStr)) {
    throw new ApiError('Invalid material ID.', 'VALIDATION_ERROR', 400);
  }

  let resolvedDepth = DEFAULT_IMPACT_MAX_DEPTH;
  if (maxDepth !== undefined) {
    const rawStr = typeof maxDepth === 'string' ? maxDepth.trim() : maxDepth;
    if (maxDepth === null || typeof maxDepth === 'boolean' || rawStr === '') {
      throw new ApiError(
        `Invalid maxDepth value. Expected an integer between 1 and ${HARD_IMPACT_MAX_DEPTH}.`,
        'VALIDATION_ERROR',
        400
      );
    }
    const parsedDepth = typeof maxDepth === 'number' ? maxDepth : Number(rawStr);
    if (!Number.isInteger(parsedDepth) || parsedDepth < 1 || parsedDepth > HARD_IMPACT_MAX_DEPTH) {
      throw new ApiError(
        `Invalid maxDepth value "${String(maxDepth)}". Expected an integer between 1 and ${HARD_IMPACT_MAX_DEPTH}.`,
        'VALIDATION_ERROR',
        400
      );
    }
    resolvedDepth = parsedDepth;
  }

  const { data } = await get(`/materials/${matStr}/impact-analysis`, { maxDepth: resolvedDepth });
  return data;
}

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

/**
 * Fetch full supporting evidence (price records & news articles) for a specific AI insight.
 *
 * @param {number|string} insightId
 * @returns {Promise<object>}
 */
export async function getInsightEvidence(insightId) {
  const { data } = await get(`/ai-insights/${insightId}/evidence`);
  return data;
}
