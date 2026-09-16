/**
 * News Ingestion Service (Document 2 §5.7 FR-NEWS-01,04, Document 3 §9).
 *
 * Responsibilities (business logic only — no req/res, no SQL directly):
 *   - Dedup: check url_hash before insert (app-layer guard over the DB constraint)
 *   - Insert: persist a normalized NewsArticle from the provider
 *   - Tag: link the article to industries whose keywords match the article text
 *
 * Called by newsIngestion.job.js for each (keyword, article) pair.
 *
 * Returns one of:
 *   { status: 'inserted', newsItemId }
 *   { status: 'skipped',  reason: 'duplicate' }
 *   { status: 'error',    error: Error }
 *
 * Never throws — errors are caught and returned so the job loop stays simple.
 *
 * Relevance / tagging strategy (V1 — deterministic, no AI):
 *   An article is linked to an industry if the article's title OR summary
 *   contains any keyword associated with that industry (case-insensitive
 *   substring match). The matched keyword_id is stored in news_item_tags for
 *   traceability. One tag row per (news_item, industry) maximum — the
 *   INSERT IGNORE in the repository handles this automatically.
 *
 * This design reuses the existing news_keywords seed data and requires no
 * new tables or migrations.
 */

const newsRepository = require('../repositories/news.repository');

/**
 * Ingest a single article. Handles dedup, insert, and tagging.
 *
 * @param {object} article      - Normalized NewsArticle from the provider
 * @param {string} article.title
 * @param {string} article.url
 * @param {string|null} article.sourceName
 * @param {string|null} article.publishedAt
 * @param {string|null} article.summary
 * @param {Array<{id, keyword, industry_id}>} keywords  - All keywords from DB
 * @returns {Promise<{status:'inserted',newsItemId:number}|{status:'skipped',reason:string}|{status:'error',error:Error}>}
 */
async function ingestArticle(article, keywords) {
  try {
    // === Step 1: Dedup check (app-layer, before hitting the DB constraint) ===
    const alreadyExists = await newsRepository.existsByUrlHash(article.url);
    if (alreadyExists) {
      return { status: 'skipped', reason: 'duplicate' };
    }

    // === Step 2: Insert the article ===
    const normalizedArticle = {
  ...article,
  publishedAt: normalizePublishedAt(article.publishedAt),
};

const { insertId: newsItemId } =
 await newsRepository.create(normalizedArticle);

    // === Step 3: Tag the article to matching industries ===
    await tagArticle(newsItemId, article, keywords);

    return { status: 'inserted', newsItemId };
  } catch (error) {
    return { status: 'error', error };
  }
}

/**
 * Determine which industries this article belongs to by keyword matching,
 * then insert one tag row per industry. Uses INSERT IGNORE so concurrent
 * re-runs are idempotent.
 *
 * Matching: case-insensitive substring search of article title + summary.
 * Groups by industry_id — stores the first matched keyword_id per industry.
 *
 * @param {number} newsItemId
 * @param {{ title: string, summary: string|null }} article
 * @param {Array<{id, keyword, industry_id}>} keywords
 */
async function tagArticle(newsItemId, article, keywords) {
  const searchText = [
    (article.title || ''),
    (article.summary || ''),
  ].join(' ').toLowerCase();

  // Group by industry — collect first matched keyword per industry
  const industryMatch = new Map(); // industry_id → matched_keyword_id
  for (const kw of keywords) {
    if (industryMatch.has(kw.industry_id)) continue; // already have a match for this industry
    if (searchText.includes(kw.keyword.toLowerCase())) {
      industryMatch.set(kw.industry_id, kw.id);
    }
  }

  // Write one tag row per matched industry
  for (const [industryId, matchedKeywordId] of industryMatch) {
    await newsRepository.createTag({ newsItemId, industryId, matchedKeywordId });
  }
}
/**
 * Convert provider ISO-8601 timestamp to MySQL DATETIME.
 *
 * Example:
 *   2026-09-09T15:30:31Z
 *   -> 2026-09-09 15:30:31
 *
 * The source timestamp is UTC ("Z"), so the UTC clock time is preserved.
 *
 * @param {string|null} value
 * @returns {string|null}
 */
function normalizePublishedAt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid article publishedAt timestamp: ' + value);
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
}
module.exports = { ingestArticle };
