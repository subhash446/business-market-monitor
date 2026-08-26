/**
 * Price Tracking module (Document 2 §5.6, Document 5 §4.6) — latest-value
 * read + manual-entry write path. Range/comparison reads live in
 * trend.controller.js (Historical Trends, a separate module).
 */

const priceQueryService = require('../services/priceQuery.service');
const priceIngestionService = require('../services/priceIngestion.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/materials/:materialId/prices/latest — FR-PRICE-04
async function getLatestPrice(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);

    const latest = await priceQueryService.getLatestPrice(
      businessId,
      req.params.materialId
    );

    sendSuccess(res, latest);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/materials/:materialId/prices — FR-PRICE-01, 02, 05
async function addPrice(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { price, recordedAt } = req.body;

    const created = await priceIngestionService.addManualPrice(
      businessId,
      req.params.materialId,
      {
        price,
        recordedAt,
      }
    );

    sendSuccess(res, created, undefined, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLatestPrice,
  addPrice,
};