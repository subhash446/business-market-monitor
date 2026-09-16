/**
 * GNews (gnews.io) API v4 provider.
 *
 * Responsibilities:
 *   - Knows the GNews API URL structure and authentication
 *   - Normalizes raw GNews JSON into provider-agnostic NewsArticle objects
 *   - Enforces a request timeout (AbortController — no new dependency)
 *   - Never logs or exposes the API key
 *
 * Provider boundary contract:
 *   fetchArticlesByKeyword(keyword: string, opts?) → NewsArticle[]
 *
 *   NewsArticle = {
 *     title:       string          // article headline
 *     url:         string          // canonical article URL
 *     sourceName:  string|null     // publisher name
 *     publishedAt: string|null     // ISO-8601 datetime string
 *     summary:     string|null     // article description/snippet
 *   }
 *
 *   On any failure the function throws a ProviderError (see below).
 *
 * GNews API v4 endpoint used:
 *   GET https://gnews.io/api/v4/search
 *     ?q=<keyword>
 *     &lang=en
 *     &max=<max>
 *     &apikey=<key>
 *   Response: { totalArticles: number, articles: [{ title, description, url,
 *               image, publishedAt, source: { name, url } }] }
 *
 * Free tier: 100 requests/day — the hourly ingestion cron with batched keyword
 * queries must stay within this. With 16 keywords across 5 industries the job
 * batches per-industry (5 calls max) rather than per-keyword (16 calls).
 *
 * Attribution: Articles must link to source URLs (already done by the frontend
 * NewsCard linking to item.url). GNews ToS requires this.
 */

const env = require('../config/env');

/**
 * Thrown when the GNews provider fails for any reason. Callers check
 * error.code to distinguish categories:
 *   'PROVIDER_TIMEOUT'   — request exceeded the configured timeout
 *   'PROVIDER_AUTH'      — 401/403 (bad or missing API key)
 *   'PROVIDER_HTTP'      — non-2xx response other than auth
 *   'PROVIDER_PARSE'     — response body is not valid JSON or wrong shape
 *   'PROVIDER_NO_DATA'   — API returned 200 but zero articles
 */
class ProviderError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/**
 * Fetch the latest news articles matching a keyword phrase from GNews.
 *
 * @param {string} keyword  - Search phrase (from news_keywords.keyword)
 * @param {object} [opts]
 * @param {number} [opts.max=10]  - Max articles per call (1–100, free tier)
 * @param {string} [opts.lang='en'] - ISO 639-1 language code
 * @returns {Promise<NewsArticle[]>}
 * @throws {ProviderError}
 */
async function fetchArticlesByKeyword(keyword, { max = 10, lang = 'en' } = {}) {
  const url = buildUrl(keyword, { max, lang });
  const timeoutMs = env.newsIngestion.timeoutMs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ProviderError(
        'PROVIDER_TIMEOUT',
        `GNews request timed out after ${timeoutMs}ms`,
        err
      );
    }
    throw new ProviderError(
      'PROVIDER_HTTP',
      `GNews request failed: ${err.message}`,
      err
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError(
      'PROVIDER_AUTH',
      `GNews authentication failed (HTTP ${response.status}) — check GNEWS_API_KEY`
    );
  }

  if (!response.ok) {
    throw new ProviderError(
      'PROVIDER_HTTP',
      `GNews returned HTTP ${response.status}`
    );
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new ProviderError('PROVIDER_PARSE', 'GNews response is not valid JSON', err);
  }

  return normalize(body, keyword);
}

/**
 * Build the GNews search URL.
 * The API key is placed in the URL as required by GNews's spec.
 * Callers must NEVER log the returned URL.
 */
function buildUrl(keyword, { max, lang }) {
  const base = `${env.gnews.baseUrl}/search`;
  const params = new URLSearchParams();
  params.set('q', keyword);
  params.set('lang', lang);
  params.set('max', String(max));
  params.set('apikey', env.gnews.apiKey);
  return `${base}?${params.toString()}`;
}

/**
 * Normalize a raw GNews API response into NewsArticle objects.
 *
 * GNews response shape:
 * {
 *   totalArticles: 123,
 *   articles: [
 *     {
 *       title:       "...",
 *       description: "...",
 *       url:         "https://...",
 *       publishedAt: "2026-09-15T07:00:00Z",
 *       source: { name: "Reuters", url: "https://reuters.com" }
 *     },
 *     ...
 *   ]
 * }
 *
 * @param {object} body - Raw GNews JSON response body
 * @param {string} keyword - Original search keyword (for error context)
 * @returns {NewsArticle[]}
 */
function normalize(body, keyword) {
  const articles = body?.articles;

  if (!Array.isArray(articles) || articles.length === 0) {
    // Not an error — GNews simply has no results for this keyword right now.
    // Return empty array; caller treats this as a no-op, not a failure.
    return [];
  }

  const results = [];
  for (const article of articles) {
    // Skip articles with no URL — cannot dedup or link without one
    if (!article.url || typeof article.url !== 'string') continue;

    results.push({
      title:       String(article.title || '').trim() || '(No title)',
      url:         article.url.trim(),
      sourceName:  article.source?.name || null,
      publishedAt: isIso8601(article.publishedAt) ? article.publishedAt : null,
      summary:     article.description ? String(article.description).trim() : null,
    });
  }

  return results;
}

/**
 * Returns true if value looks like an ISO-8601 datetime string.
 * GNews publishes dates as "2026-09-15T07:00:00Z" format.
 */
function isIso8601(value) {
  if (typeof value !== 'string') return false;
  // Accepts: 2026-09-15T07:00:00Z / 2026-09-15T07:00:00+05:30 / etc.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

module.exports = { fetchArticlesByKeyword, ProviderError };
