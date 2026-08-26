/**
 * Historical Trends module (Document 2 §5.10, Document 5 §4.10) — range and
 * comparison reads over price_points, shared with price.controller.js's table.
 * Implemented (Phase 11): both functions.
 */
const trendQueryService = require('../services/trendQuery.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { parsePagination } = require('../utils/pagination');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/materials/:materialId/prices/history — FR-HIST-01, 02
async function getPriceHistory(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { from, to } = req.query;
    const { page, limit, offset } = parsePagination(req.query);
    const { items, meta } = await trendQueryService.getPriceHistory(businessId, req.params.materialId, {
      from,
      to,
      page,
      limit,
      offset,
    });
    sendSuccess(res, items, meta);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/materials/prices/compare — FR-HIST-03
async function comparePrices(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { from, to } = req.query;
    const materialIds = String(req.query.materialIds)
      .split(',')
      .map((id) => id.trim());
    const comparison = await trendQueryService.compareMaterials(businessId, materialIds, { from, to });
    sendSuccess(res, comparison);
  } catch (err) {
    next(err);
  }
}

module.exports = { getPriceHistory, comparePrices };
