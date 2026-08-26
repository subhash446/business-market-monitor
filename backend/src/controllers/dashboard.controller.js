/**
 * Dashboard module (Document 2 §5.9, Document 5 §4.9).
 * Aggregates other modules' data — no table of its own. Implemented (Phase 10).
 */
const dashboardAggregationService = require('../services/dashboardAggregation.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/dashboard — FR-DASH-01, 03, 04 (FR-DASH-02 omitted, see service file header)
async function getDashboard(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const dashboard = await dashboardAggregationService.getDashboard(businessId);
    sendSuccess(res, dashboard);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
