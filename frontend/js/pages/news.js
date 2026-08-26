/**
 * News page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.7, Doc 4 §6.1 — js/pages/news.js
 *
 * FLOW:
 *  1. requireAuth() + requireBusiness()
 *  2. initNav({ pageTitle: 'News', activeHref: '/pages/news.html' })
 *  3. Show industry label from session.getCachedBusiness().industryName
 *  4. GET /api/v1/news?page=1&limit=20 on load
 *  5. Render news cards (title link, sourceName, publishedAt)
 *  6. Pagination via pagination.js on page change → re-fetch
 *
 * BACKEND CONTRACT (confirmed from newsQuery.service.js):
 *   Response items: { id, title, url, sourceName, publishedAt }
 *   No other fields. url may be null if ingestion stub returns no articles.
 *   Server filters by business.industry_id — no query param needed.
 *   News ingestion is a stub in v1 — empty result is the expected/normal state.
 *
 * SECURITY:
 *   External URLs: only set as href on <a> elements — never injected via innerHTML.
 *   All text set via textContent only.
 *   rel="noopener noreferrer" on all external links (Doc 4 §6.1).
 *   No eval(). No innerHTML with API data.
 */

import { requireAuth, requireBusiness }  from '/js/auth/auth.js';
import { initNav }                       from '/js/components/nav.js';
import { showSkeleton, hideSkeleton }    from '/js/components/loader.js';
import { renderEmptyState }              from '/js/components/emptyState.js';
import { renderErrorState }              from '/js/components/errorState.js';
import { renderPagination }              from '/js/components/pagination.js';
import { getCachedBusiness }             from '/js/auth/session.js';
import { getNews, NEWS_LIMIT }           from '/js/api/news.api.js';
import { formatDate }                    from '/js/utils/format.js';
import { byId, createElement }           from '/js/utils/dom.js';

// ── Auth guards ────────────────────────────────────────────────────────────────
requireAuth();
requireBusiness();

// ── Nav ────────────────────────────────────────────────────────────────────────
initNav({ pageTitle: 'News', activeHref: '/pages/news.html' });

// ── Industry label ────────────────────────────────────────────────────────────
// Doc 4 §6.1: pulled from session cache — no extra API call needed
const industryLabel = byId('news-industry-label');
if (industryLabel) {
  const biz = getCachedBusiness();
  const industryName = biz?.industryName ?? biz?.industry ?? null;
  if (industryName) {
    industryLabel.textContent = `Showing news for: ${industryName}`;
  } else {
    industryLabel.textContent = 'Showing news for your industry';
  }
}

// ── Element references ────────────────────────────────────────────────────────
const newsContainer = byId('news-container');
const newsPagination = byId('news-pagination');

/* ================================================================
 * BUILD A SINGLE NEWS CARD
 * Doc 4 §6.1 fields: { id, title, url, sourceName, publishedAt }
 * ================================================================ */

function _makeNewsCard(item) {
  const card = createElement('article', { className: 'news-card' });

  // Title + external link
  const titleEl = createElement('h3', { className: 'news-card__title' });

  if (item.url) {
    // External link — href set as property, text via textContent (never innerHTML)
    const link = document.createElement('a');
    link.href   = item.url;
    link.target = '_blank';
    link.rel    = 'noopener noreferrer';
    link.textContent = item.title;

    // External link icon (decorative)
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-arrow-up-right-from-square news-card__link-icon';
    icon.setAttribute('aria-hidden', 'true');

    titleEl.appendChild(link);
    titleEl.appendChild(icon);
  } else {
    // No URL — render plain text title
    titleEl.textContent = item.title;
  }

  card.appendChild(titleEl);

  // Meta row: source + date
  const meta = createElement('div', { className: 'news-card__meta' });

  if (item.sourceName) {
    const source = createElement('span', {
      className: 'news-card__source',
      text:      item.sourceName,
    });
    meta.appendChild(source);
  }

  if (item.publishedAt) {
    const time = document.createElement('time');
    time.className   = 'news-card__date';
    time.dateTime    = item.publishedAt;
    time.textContent = formatDate(item.publishedAt);
    meta.appendChild(time);
  }

  card.appendChild(meta);
  return card;
}

/* ================================================================
 * RENDER NEWS LIST
 * ================================================================ */

function _renderNews(items) {
  if (!newsContainer) return;
  hideSkeleton(newsContainer);
  while (newsContainer.firstChild) newsContainer.removeChild(newsContainer.firstChild);

  if (!items || items.length === 0) {
    renderEmptyState(newsContainer, {
      icon:    'fa-solid fa-newspaper',
      title:   'No news available yet',
      message: 'Industry news articles will appear here once your news feed is connected. This feature is pending activation in the current version.',
      // No action button — user cannot trigger ingestion (Doc 4 §6.1)
    });
    return;
  }

  const list = createElement('div', { className: 'news-list' });
  items.forEach((item) => list.appendChild(_makeNewsCard(item)));
  newsContainer.appendChild(list);
}

/* ================================================================
 * LOAD PAGE — GET /api/v1/news?page=N&limit=20
 * ================================================================ */

async function _loadNews(page = 1) {
  if (newsContainer) showSkeleton(newsContainer, { rows: 5, type: 'card' });
  if (newsPagination) while (newsPagination.firstChild) newsPagination.removeChild(newsPagination.firstChild);

  try {
    const { data: items, meta } = await getNews({ page, limit: NEWS_LIMIT });

    _renderNews(items);

    if (newsPagination) {
      renderPagination(newsPagination, meta, (newPage) => _loadNews(newPage));
    }

  } catch (err) {
    if (newsContainer) {
      hideSkeleton(newsContainer);
      renderErrorState(newsContainer, {
        title:   'Failed to load news',
        message: 'Something went wrong. Please try again.',
        retry:   () => _loadNews(page),
      });
    }
  }
}

_loadNews(1);
