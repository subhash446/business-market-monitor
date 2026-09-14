/**
 * NewsPage — Industry news feed
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/news.html + frontend/js/pages/news.js
 *
 * FLOW (preserved exactly from original):
 *  1. Auth + business guard — handled by ProtectedRoute in App.jsx
 *  2. Show industry label from business context (no extra API call)
 *  3. GET /api/v1/news?page=1&limit=20 on load
 *  4. Render news cards: { id, title, url, sourceName, publishedAt }
 *  5. Pagination → re-fetch on page change
 *
 * BACKEND CONTRACT (confirmed from newsQuery.service.js):
 *   Response items: { id, title, url, sourceName, publishedAt }
 *   No other fields. url may be null (ingestion stub in v1).
 *   Server filters by business.industry_id — no client-side industry param.
 *   News ingestion is a stub in v1 — empty result is expected/normal.
 *
 * SECURITY:
 *   External URLs: href only on <a> elements — never innerHTML.
 *   rel="noopener noreferrer" on all external links (Doc 4 §6.1).
 *   No eval(). No innerHTML with API data.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth }     from '../hooks/useAuth.js';
import { getNews, NEWS_LIMIT } from '../api/news.api.js';
import { Skeleton }    from '../components/ui/Skeleton.jsx';
import { EmptyState }  from '../components/ui/EmptyState.jsx';
import { ErrorState }  from '../components/ui/ErrorState.jsx';
import { Pagination }  from '../components/ui/Pagination.jsx';
import { formatDate }  from '../utils/format.js';
import '../styles/pages/news.css';

const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

export function NewsPage() {
  const { business } = useAuth();

  const [status, setStatus] = useState(STATUS.LOADING);
  const [items,  setItems]  = useState([]);
  const [meta,   setMeta]   = useState(null);

  /* ── Industry label — from auth business context, no extra API call ── */
  // Mirrors: biz?.industryName ?? biz?.industry ?? 'your industry'
  const industryName = business?.industryName ?? business?.industry ?? null;

  /* ── Load news ──────────────────────────────────────────────── */
  const loadNews = useCallback(async (page = 1) => {
    setStatus(STATUS.LOADING);
    try {
      const { data, meta: m } = await getNews({ page, limit: NEWS_LIMIT });
      setItems(data ?? []);
      setMeta(m);
      setStatus(STATUS.SUCCESS);
    } catch {
      setStatus(STATUS.ERROR);
    }
  }, []);

  useEffect(() => { loadNews(1); }, [loadNews]);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* Industry label — Doc 4 §6.1 */}
      <p id="news-industry-label" className="news-industry-label">
        {industryName
          ? `Showing news for: ${industryName}`
          : 'Showing news for your industry'}
      </p>

      {/* News container */}
      <div id="news-container">

        {status === STATUS.LOADING && <Skeleton type="card" rows={5} />}

        {status === STATUS.ERROR && (
          <ErrorState
            title="Failed to load news"
            message="Something went wrong. Please try again."
            retry={() => loadNews(meta?.page ?? 1)}
          />
        )}

        {status === STATUS.SUCCESS && items.length === 0 && (
          <EmptyState
            icon="fa-solid fa-newspaper"
            title="No news available yet"
            message="Industry news articles will appear here once your news feed is connected. This feature is pending activation in the current version."
            /* No action button — user cannot trigger ingestion (Doc 4 §6.1) */
          />
        )}

        {status === STATUS.SUCCESS && items.length > 0 && (
          <div className="news-list">
            {items.map(item => <NewsCard key={item.id} item={item} />)}
          </div>
        )}

      </div>

      {/* Pagination */}
      {status === STATUS.SUCCESS && (
        <div id="news-pagination">
          <Pagination meta={meta} onPageChange={page => loadNews(page)} />
        </div>
      )}

    </div>
  );
}

/* ================================================================
 * NEWS CARD
 * Fields: { id, title, url, sourceName, publishedAt }
 * url may be null — render plain text title when absent.
 * External links: target="_blank" rel="noopener noreferrer"
 * ================================================================ */
function NewsCard({ item }) {
  return (
    <article className="news-card">

      {/* Title — external link if url present, plain text otherwise */}
      <h3 className="news-card__title">
        {item.url ? (
          <>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.title}
            </a>
            <i
              className="fa-solid fa-arrow-up-right-from-square news-card__link-icon"
              aria-hidden="true"
            />
          </>
        ) : (
          item.title
        )}
      </h3>

      {/* Meta row: source + date */}
      <div className="news-card__meta">
        {item.sourceName && (
          <span className="news-card__source">{item.sourceName}</span>
        )}
        {item.publishedAt && (
          <time className="news-card__date" dateTime={item.publishedAt}>
            {formatDate(item.publishedAt)}
          </time>
        )}
      </div>

    </article>
  );
}
