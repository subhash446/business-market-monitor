/**
 * AI Market Intelligence controller (Phase H).
 *
 * All three endpoints are read-only.
 * AI generation is background-job only -- no trigger endpoint here.
 *
 * businessId always comes from req.auth (JWT) via resolveBusinessId.
 * material ownership is verified inside aiInsightQuery.service.
 */
const aiInsightQueryService = require('../services/aiInsightQuery.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { parsePagination } = require('../utils/pagination');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/materials/:materialId/ai-insights/latest
// Returns the most-recent AI insight for one tracked material, or
// data: null if no insight has been generated yet (not a 404).
async function getLatest(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const insight    = await aiInsightQueryService.getLatestInsight(
      businessId,
      req.params.materialId
    );
    sendSuccess(res, insight);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/materials/:materialId/ai-insights
// Returns paginated insight history for one tracked material.
async function listHistory(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const pagination = parsePagination(req.query);
    const { items, meta } = await aiInsightQueryService.listInsightHistory(
      businessId,
      req.params.materialId,
      pagination
    );
    sendSuccess(res, items, meta);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/ai-insights/business/latest
// Returns the top-N most-recent insights across all of the business's
// tracked materials (for the dashboard panel).
// Accepts optional ?limit=N query param (default 3, max 10).
async function listLatestForBusiness(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = 3;
    if (limit > 10) limit = 10;

    const insights = await aiInsightQueryService.listLatestForBusiness(businessId, limit);
    sendSuccess(res, insights);
  } catch (err) {
    next(err);
  }
}

module.exports = { getLatest, listHistory, listLatestForBusiness };
