/**
 * Market News read-path business logic (Document 2 §5.7 FR-NEWS-02, 03,
 * Document 5 §4.7). Framework-agnostic — no req/res, no SQL (Document 3 §3).
 *
 * New file, not named in Document 3 §5 / Document 6 (which only list
 * newsIngestion.service.js and newsTagging.service.js — both write-side).
 * Added per the approved Phase 8 scope review to keep the Controller →
 * Service → Repository layering intact for the read endpoint, the same
 * gap-fill pattern as Phase 7's priceQuery.service.js split.
 */
const newsRepository = require('../repositories/news.repository');
const businessRepository = require('../repositories/business.repository');
const { buildMeta } = require('../utils/pagination');
const AppError = require('../utils/AppError');

async function listNewsForBusiness(businessId, { page, limit, offset }) {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }

  const [rows, total] = await Promise.all([
    newsRepository.listByIndustry(business.industry_id, { limit, offset }),
    newsRepository.countByIndustry(business.industry_id),
  ]);

  return {
    items: rows.map(toPublicNewsItem),
    meta: buildMeta({ page, limit, total }),
  };
}

function toPublicNewsItem(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    sourceName: row.source_name,
    publishedAt: row.published_at,
  };
}

module.exports = { listNewsForBusiness };
