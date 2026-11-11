/**
 * Read-only query service for AI insights (Phase H).
 *
 * Sits between the controller and aiInsight.repository.
 * Enforces business-scoped access by verifying material ownership
 * via material.repository.findByIdForBusiness() before any insight read.
 *
 * Methods:
 *   getLatestInsight(businessId, trackedMaterialId)
 *     -- latest AI insight for one material, null if none generated yet.
 *   listInsightHistory(businessId, trackedMaterialId, pagination)
 *     -- paginated history of insights for one material.
 *   listLatestForBusiness(businessId, limit)
 *     -- top-N most-recent insights across all of the business's materials
 *        (dashboard panel). Default limit: 3.
 *
 * Never exposes internal provider/model secrets.
 * model_used is included for auditability (it is not a secret).
 */
const materialRepository = require('../repositories/material.repository');
const aiInsightRepository = require('../repositories/aiInsight.repository');
const AppError = require('../utils/AppError');
const { buildMeta } = require('../utils/pagination');

/**
 * Get the latest AI insight for a tracked material.
 * Returns null (not a 404) if the material exists but no insight has
 * been generated yet -- the UI shows an empty state in that case.
 *
 * Throws AppError 404 if the material does not exist or belongs to a
 * different business.
 *
 * @param {number} businessId
 * @param {number|string} trackedMaterialId
 * @returns {Promise<object|null>}
 */
async function getLatestInsight(businessId, trackedMaterialId) {
  const material = await materialRepository.findByIdForBusiness(trackedMaterialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Tracked material not found');
  }

  const insight = await aiInsightRepository.findLatestByMaterial(trackedMaterialId, businessId);
  if (!insight) return null;

  let evidenceNews = [];
  let evidencePrices = [];
  if (typeof aiInsightRepository.findEvidenceNewsByInsightId === 'function') {
    try {
      evidenceNews = await aiInsightRepository.findEvidenceNewsByInsightId(insight.id);
    } catch {
      // non-fatal
    }
  }
  if (typeof aiInsightRepository.findEvidencePricesByInsightId === 'function') {
    try {
      evidencePrices = await aiInsightRepository.findEvidencePricesByInsightId(insight.id);
    } catch {
      // non-fatal
    }
  }

  return formatInsight(insight, { news: evidenceNews, prices: evidencePrices });
}

/**
 * List paginated insight history for a tracked material.
 *
 * @param {number} businessId
 * @param {number|string} trackedMaterialId
 * @param {{ page, limit, offset }} pagination
 * @returns {Promise<{ items: object[], meta: object }>}
 */
async function listInsightHistory(businessId, trackedMaterialId, pagination) {
  const material = await materialRepository.findByIdForBusiness(trackedMaterialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Tracked material not found');
  }

  const { limit, offset, page } = pagination;
  const [items, total] = await Promise.all([
    aiInsightRepository.listByMaterial(trackedMaterialId, businessId, { limit, offset }),
    aiInsightRepository.countByMaterial(trackedMaterialId, businessId),
  ]);

  return {
    items: items.map(formatInsight),
    meta:  buildMeta({ page, limit, total }),
  };
}

/**
 * List the most-recent AI insights across all tracked materials for a business.
 * Used by the dashboard panel. Returns up to `limit` rows (default 3).
 *
 * No per-material ownership check needed: findLatestByBusiness already
 * filters by business_id at the DB level.
 *
 * @param {number} businessId
 * @param {number} [limit=3]
 * @returns {Promise<object[]>}
 */
async function listLatestForBusiness(businessId, limit = 3) {
  const insights = await aiInsightRepository.findLatestByBusiness(businessId, limit);
  return insights.map(formatInsight);
}

/**
 * Retrieve the full supporting evidence (prices & news) for a specific insight.
 * Strictly verifies tenant isolation: the insight must belong to businessId.
 *
 * @param {number} businessId
 * @param {number|string} insightId
 * @returns {Promise<object>}
 */
async function getInsightEvidence(businessId, insightId) {
  const insight = await aiInsightRepository.findByIdAndBusiness(insightId, businessId);
  if (!insight) {
    throw new AppError(404, 'NOT_FOUND', 'AI insight not found');
  }

  const [news, prices] = await Promise.all([
    aiInsightRepository.findEvidenceNewsByInsightId(insight.id),
    aiInsightRepository.findEvidencePricesByInsightId(insight.id),
  ]);

  return {
    insight_id:                   insight.id,
    tracked_material_id:          insight.tracked_material_id,
    generated_at:                 insight.generated_at,
    evidence_price_range:         insight.evidence_price_range,
    evidence_price_points_count:  insight.evidence_price_points_count,
    evidence_news_count:          insight.evidence_news_count,
    news:                         news || [],
    prices:                       prices || [],
  };
}

/**
 * Shape the DB row into a clean public response object.
 *
 * Explicitly lists every field so:
 *   - No accidental internal column leaks if the schema grows.
 *   - No provider secrets (e.g. GEMINI_API_KEY never reaches the DB
 *     anyway, but model_used and generated_at are kept for auditability).
 *   - snake_case matches the existing API convention (all other endpoints
 *     return DB column names as-is -- no camelCase transformation exists).
 *
 * @param {object} row  -- raw DB row from aiInsight.repository
 * @param {object} [evidence] -- optional linked evidence { news, prices }
 * @returns {object}
 */
function formatInsight(row, evidence = null) {
  const result = {
    id:                           row.id,
    tracked_material_id:          row.tracked_material_id,
    headline:                     row.headline,
    what_happened:                row.what_happened,
    why_it_happened:              row.why_it_happened,
    business_impact:              row.business_impact,
    outlook:                      row.outlook,
    confidence:                   row.confidence,
    evidence_price_range:         row.evidence_price_range,
    evidence_price_points_count:  row.evidence_price_points_count,
    evidence_news_count:          row.evidence_news_count,
    model_used:                   row.model_used,
    generated_at:                 row.generated_at,
  };

  if (evidence) {
    if (Array.isArray(evidence.news) && evidence.news.length > 0) {
      result.evidence_news = evidence.news;
    }
    if (Array.isArray(evidence.prices) && evidence.prices.length > 0) {
      result.evidence_prices = evidence.prices;
    }
  }

  return result;
}

module.exports = {
  getLatestInsight,
  getInsightEvidence,
  listInsightHistory,
  listLatestForBusiness,
  formatInsight, // exported for testing
};
