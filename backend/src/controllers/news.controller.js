/**
 * Market News module (Document 2 §5.7, Document 5 §4.7).
 * Read-only — ingestion is the internal NewsIngestionService (jobs/), not a
 * public endpoint. Implemented (Phase 8): listNews only.
 */
const newsQueryService = require('../services/newsQuery.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { parsePagination } = require('../utils/pagination');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/news — FR-NEWS-02, 03
async function listNews(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const pagination = parsePagination(req.query);
    const { items, meta } = await newsQueryService.listNewsForBusiness(businessId, pagination);
    sendSuccess(res, items, meta);
  } catch (err) {
    next(err);
  }
}

module.exports = { listNews };
