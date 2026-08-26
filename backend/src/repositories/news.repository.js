/**
 * All queries against `news_items` / `news_item_tags` (Document 4 §5.5).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Read-only, by design (Phase 8 scope): no insert/create function exists
 * here at all — ingestion is the internal NewsIngestionService (Document 3
 * §9), explicitly out of scope for this phase, not merely deferred.
 *
 * DISTINCT is defensive, not required: news_item_tags' UNIQUE
 * (news_item_id, industry_id) already guarantees at most one tag row per
 * item per industry (Document 4 §5.5), so this join cannot itself produce
 * duplicate news items.
 */
const { pool } = require('../database/connection');

async function listByIndustry(industryId, { limit, offset }) {
  // mysql2's prepared statements (execute()) don't support LIMIT/OFFSET as
  // bound `?` placeholders (throws ER_WRONG_ARGUMENTS). limit/offset are
  // already validated, server-generated integers from utils/pagination.js
  // (never raw user input), so inlining them here is safe — industryId
  // remains a real bound parameter.
  const safeLimit = Number(limit);
  const safeOffset = Number(offset);
  const [rows] = await pool.execute(
    `SELECT DISTINCT ni.id, ni.title, ni.url, ni.source_name, ni.published_at
     FROM news_items ni
     JOIN news_item_tags nit ON nit.news_item_id = ni.id
     WHERE nit.industry_id = ?
     ORDER BY ni.published_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    [industryId]
  );
  return rows;
}

async function countByIndustry(industryId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(DISTINCT ni.id) AS total
     FROM news_items ni
     JOIN news_item_tags nit ON nit.news_item_id = ni.id
     WHERE nit.industry_id = ?`,
    [industryId]
  );
  return rows[0].total;
}

module.exports = { listByIndustry, countByIndustry };
