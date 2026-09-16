/**
 * All queries against `news_items` / `news_item_tags` (Document 4 §5.5).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Phase G additions (News Ingestion):
 *   existsByUrlHash   — dedup check before insert
 *   create            — insert one news_items row
 *   createTag         — link a news item to an industry via news_item_tags
 *   listKeywordsWithIndustry — load all keyword→industry_id rows for tagging
 *
 * DISTINCT is defensive, not required: news_item_tags' UNIQUE
 * (news_item_id, industry_id) already guarantees at most one tag row per
 * item per industry (Document 4 §5.5), so this join cannot itself produce
 * duplicate news items.
 */
const { pool } = require('../database/connection');
const crypto = require('crypto');

// ── Read methods (existing, unchanged) ────────────────────────────────────────

async function listByIndustry(industryId, { limit, offset }) {
  // mysql2's prepared statements (execute()) don't support LIMIT/OFFSET as
  // bound `?` placeholders (throws ER_WRONG_ARGUMENTS). limit/offset are
  // already validated, server-generated integers from utils/pagination.js
  // (never raw user input), so inlining them here is safe — industryId
  // remains a real bound parameter.
  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);
  const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const safeOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const [rows] = await pool.execute(
    `SELECT DISTINCT ni.id, ni.title, ni.url, ni.source_name, ni.published_at, ni.summary
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

// ── Write methods (Phase G — News Ingestion) ──────────────────────────────────

/**
 * Compute the SHA-256 hex digest of a URL string.
 * This is the canonical dedup key used in news_items.url_hash (migration 013).
 *
 * @param {string} url
 * @returns {string} 64-char hex SHA-256
 */
function hashUrl(url) {
  return crypto.createHash('sha256').update(url, 'utf8').digest('hex');
}

/**
 * Returns true if a news_items row with this url_hash already exists.
 * Uses the UNIQUE KEY uq_news_items_url_hash index — fast O(1) lookup.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function existsByUrlHash(url) {
  const hash = hashUrl(url);
  const [rows] = await pool.execute(
    'SELECT 1 FROM news_items WHERE url_hash = ? LIMIT 1',
    [hash]
  );
  return rows.length > 0;
}

/**
 * Insert one article into news_items.
 * The url_hash is computed here — callers only pass the raw URL.
 *
 * @param {{ title, url, sourceName, publishedAt, summary }} article
 * @returns {Promise<{ insertId: number }>}  — the new row's id
 */
async function create({ title, url, sourceName, publishedAt, summary }) {
  const urlHash = hashUrl(url);
  const [result] = await pool.execute(
    `INSERT INTO news_items (title, url, url_hash, summary, source_name, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, url, urlHash, summary || null, sourceName || null, publishedAt || null]
  );
  return { insertId: result.insertId };
}

/**
 * Link a news item to an industry in news_item_tags.
 * Uses INSERT IGNORE so a duplicate (news_item_id, industry_id) pair is
 * silently skipped — matches the UNIQUE KEY constraint in migration 014.
 *
 * @param {{ newsItemId: number, industryId: number, matchedKeywordId?: number|null }} tag
 */
async function createTag({ newsItemId, industryId, matchedKeywordId = null }) {
  await pool.execute(
    `INSERT IGNORE INTO news_item_tags (news_item_id, industry_id, matched_keyword_id)
     VALUES (?, ?, ?)`,
    [newsItemId, industryId, matchedKeywordId || null]
  );
}

/**
 * Load all keywords with their associated industry_id and keyword id.
 * Used by the ingestion job to determine which industries to tag for a
 * given article.
 *
 * @returns {Promise<Array<{ id, keyword, industry_id }>>}
 */
async function listKeywordsWithIndustry() {
  const [rows] = await pool.execute(
    'SELECT id, keyword, industry_id FROM news_keywords'
  );
  return rows;
}

// Phase H (AI Insights Job) -- purely additive, nothing above changed.
//
// Fetches the most-recent news headlines for an industry, with a fixed cap.
// Used by the AI insights job to gather headline evidence before calling
// the LLM. Not paginated: the job needs the most-recent N headlines; the
// aiInsight.service further caps to MAX_NEWS_ITEMS (5) before prompt build.
// Returns only the columns needed for AI evidence: title, summary,
// source_name, published_at. URL and id are intentionally excluded
// because the AI insights job does not store news references.
async function listRecentByIndustry(industryId, limit = 10) {
  const safeLimit = Number(limit);

  const [rows] = await pool.execute(
    `SELECT DISTINCT
       ni.title,
       ni.summary,
       ni.source_name,
       ni.published_at
     FROM news_items ni
     JOIN news_item_tags nit
       ON nit.news_item_id = ni.id
     WHERE nit.industry_id = ?
     ORDER BY ni.published_at DESC
     LIMIT ${safeLimit}`,
    [industryId]
  );

  return rows;
}

module.exports = {
  listByIndustry,
  countByIndustry,
  existsByUrlHash,
  create,
  createTag,
  listKeywordsWithIndustry,
  hashUrl,
  listRecentByIndustry, // Phase H
};
