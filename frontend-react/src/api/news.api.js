/**
 * News API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/news.api.js (Vanilla JS v1.0)
 * Change: import path updated — client.js is now in the same directory.
 *
 * Doc 3 §3, Doc 4 §6.1 — js/api/news.api.js
 *
 * Endpoint (mounted at /api/v1/news):
 *
 *   GET  /news
 *     Query params:
 *       page  : number (default 1, parsed by server)
 *       limit : number (default 20, parsed by server)
 *     Response:
 *       data: [{ id, title, url, sourceName, publishedAt }]
 *       meta: { page, limit, total, totalPages }
 *     Notes:
 *       - Server filters by business.industry_id automatically (no client-side industry param)
 *       - No category/tag filter query param exists on this endpoint
 *       - News ingestion is a backend stub in v1 — empty result is expected/normal
 *       - url field: external article URL, may be null if ingestion stub returns no articles
 *
 * CONFIRMED from newsQuery.service.js toPublicNewsItem:
 *   { id, title, url, sourceName, publishedAt }
 *   No other fields exist in the response.
 */

import { get } from './client.js';

/** Default news page size (Doc 4 §6.1) */
export const NEWS_LIMIT = 20;

/**
 * Fetch paginated news articles for the authenticated business's industry.
 *
 * @param {{ page?: number, limit?: number }} opts
 * @returns {Promise<{ data: Array<{id,title,url,sourceName,publishedAt}>, meta: {page,limit,total,totalPages} }>}
 */
export async function getNews({ page = 1, limit = NEWS_LIMIT } = {}) {
  const params = new URLSearchParams({ page, limit });
  const { data, meta } = await get(`/news?${params}`);
  return { data, meta };
}
