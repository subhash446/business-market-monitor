/**
 * Dashboard page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.4, Doc 4 §8.1 — js/pages/dashboard.js
 *
 * FLOW:
 *  1. requireAuth()   — redirect to /pages/login.html if no token
 *  2. requireBusiness()— redirect to /pages/onboarding.html if no businessId
 *  3. initNav()       — renders sidebar with Dashboard link active
 *  4. Show skeleton in all 5 panels
 *  5. GET /api/v1/dashboard (single call — no query params)
 *  6. Render all 5 panels from response
 *
 * RESPONSE FIELD RULES (confirmed from backend source):
 *  - trackedMaterials[].latestPrice  → scalar number | null (NOT an object)
 *  - significantChange               → absent — never reference
 *  - recentNews[]                    → { id, title } only
 *  - activeAlertRules[]              → { id, conditionType, thresholdPrice } only
 *  - recentAlertEvents[]             → { id, triggeredAt } only
 *  - sync.lastPriceSyncAt/lastNewsSyncAt → null in v1, shown as "Never" (not an error)
 *
 * SECURITY:
 *  - No userId in requests (server reads from JWT)
 *  - No innerHTML with dynamic/API data (textContent only)
 *  - No eval()
 *  - Tokens never logged or exposed
 */

import { requireAuth, requireBusiness }    from '/js/auth/auth.js';
import { initNav }                         from '/js/components/nav.js';
import { getDashboard }                    from '/js/api/dashboard.api.js';
import { showSkeleton, hideSkeleton }      from '/js/components/loader.js';
import { renderEmptyState }                from '/js/components/emptyState.js';
import { renderErrorState }                from '/js/components/errorState.js';
import { formatNumber, formatDateTime,
         formatAlertCondition }            from '/js/utils/format.js';
import { createElement, byId }             from '/js/utils/dom.js';

// ── 1. Auth guards ─────────────────────────────────────────────────────────────
requireAuth();
requireBusiness();

// ── 2. Sidebar + page title ────────────────────────────────────────────────────
// initNav sets both the active nav link and #page-title (Doc 4 §1.5, §10.17)
initNav({ pageTitle: 'Dashboard', activeHref: '/pages/dashboard.html' });

// ── 4. Panel container references ─────────────────────────────────────────────
const panelMaterials  = byId('panel-materials-list');
const panelNews       = byId('panel-news-list');
const panelAlertRules = byId('panel-alert-rules-list');
const panelAlertEvents= byId('panel-alert-events-list');
const syncPriceEl     = byId('sync-price-time');
const syncNewsEl      = byId('sync-news-time');
const dashboardGrid   = byId('dashboard-grid');

/* ================================================================
 * LOADING SKELETONS — shown immediately on page render
 * ================================================================ */

function _showAllSkeletons() {
  [panelMaterials, panelNews, panelAlertRules, panelAlertEvents].forEach((c) => {
    if (c) showSkeleton(c, { rows: 4, type: 'panel' });
  });
}

function _hideAllSkeletons() {
  [panelMaterials, panelNews, panelAlertRules, panelAlertEvents].forEach((c) => {
    if (c) hideSkeleton(c);
  });
}

_showAllSkeletons();

/* ================================================================
 * PANEL 1 — Tracked Materials
 * Doc 4 §8.1 Panel 1
 * Fields: { id, name, latestPrice: number | null }
 * latestPrice is a scalar — NOT an object. No unit suffix here.
 * significantChange is absent and must never be referenced.
 * ================================================================ */

function _renderMaterials(items) {
  if (!panelMaterials) return;
  hideSkeleton(panelMaterials);

  if (!items || items.length === 0) {
    renderEmptyState(panelMaterials, {
      icon:    'fa-solid fa-boxes-stacked',
      title:   'No materials being tracked',
      message: 'No materials are being tracked yet.',
      action:  {
        label:   'Go to Materials',
        onClick: () => { window.location.href = '/pages/materials.html'; },
      },
    });
    return;
  }

  const list = createElement('ul', {
    className: 'dashboard-panel__list',
    attrs:     { role: 'list' },
  });

  items.forEach((material) => {
    const item = createElement('li', { className: 'dashboard-panel__item' });

    // Name
    const nameSpan = createElement('span', {
      className: 'dashboard-panel__item-name',
    });
    nameSpan.textContent = material.name;

    // Price — latestPrice is scalar number | null (Doc 4 §8.1, §16)
    const priceSpan = createElement('span', {});
    if (material.latestPrice === null || material.latestPrice === undefined) {
      priceSpan.className   = 'dashboard-panel__item-value dashboard-panel__item-value--null';
      priceSpan.textContent = 'No price recorded';
    } else {
      priceSpan.className   = 'dashboard-panel__item-value font-mono';
      // formatNumber gives locale-aware thousands separator e.g. "1,250.00"
      priceSpan.textContent = formatNumber(material.latestPrice, 2);
    }

    // Quick-action links
    const actions = createElement('div', { className: 'dashboard-panel__item-actions' });

    const addPriceLink = createElement('a', {
      className: 'btn btn--sm btn--ghost',
      text:      'Add Price',
      attrs:     { href: `/pages/prices.html?materialId=${material.id}` },
    });

    const trendsLink = createElement('a', {
      className: 'btn btn--sm btn--ghost',
      text:      'Trends',
      attrs:     { href: `/pages/trends.html?materialId=${material.id}` },
    });

    actions.appendChild(addPriceLink);
    actions.appendChild(trendsLink);

    item.appendChild(nameSpan);
    item.appendChild(priceSpan);
    item.appendChild(actions);
    list.appendChild(item);
  });

  while (panelMaterials.firstChild) panelMaterials.removeChild(panelMaterials.firstChild);
  panelMaterials.appendChild(list);
}

/* ================================================================
 * PANEL 2 — Recent News
 * Doc 4 §8.1 Panel 2
 * Fields: { id, title } — NO url, source, or date in dashboard response
 * Clicking a title: no link (only id + title available here)
 * ================================================================ */

function _renderNews(items) {
  if (!panelNews) return;
  hideSkeleton(panelNews);

  if (!items || items.length === 0) {
    renderEmptyState(panelNews, {
      icon:    'fa-solid fa-newspaper',
      title:   'No recent news',
      message: 'News will appear here once your industry feed is connected.',
    });
    return;
  }

  const list = createElement('ul', {
    className: 'dashboard-panel__list',
    attrs:     { role: 'list' },
  });

  items.forEach((article) => {
    const item = createElement('li', { className: 'dashboard-panel__item' });

    const titleSpan = createElement('span', { className: 'dashboard-panel__item-name' });
    titleSpan.textContent = article.title; // textContent — no link (no URL in this endpoint)

    item.appendChild(titleSpan);
    list.appendChild(item);
  });

  while (panelNews.firstChild) panelNews.removeChild(panelNews.firstChild);
  panelNews.appendChild(list);
}

/* ================================================================
 * PANEL 3 — Active Alert Rules
 * Doc 4 §8.1 Panel 3
 * Fields: { id, conditionType, thresholdPrice } — NO materialName
 * ================================================================ */

function _renderAlertRules(items) {
  if (!panelAlertRules) return;
  hideSkeleton(panelAlertRules);

  if (!items || items.length === 0) {
    renderEmptyState(panelAlertRules, {
      icon:    'fa-solid fa-bell-slash',
      title:   'No active alert rules',
      message: 'No active alert rules.',
      action:  {
        label:   'Create Alert Rule',
        onClick: () => { window.location.href = '/pages/alerts.html'; },
      },
    });
    return;
  }

  const list = createElement('ul', {
    className: 'dashboard-panel__list',
    attrs:     { role: 'list' },
  });

  items.forEach((rule) => {
    const item = createElement('li', { className: 'dashboard-panel__item' });

    // "Price Above 1,500.00" or "Price Below 90.00"
    // formatAlertCondition from format.js handles PRICE_ABOVE / PRICE_BELOW
    const condSpan = createElement('span', { className: 'dashboard-panel__item-name' });
    condSpan.textContent = formatAlertCondition(rule.conditionType, rule.thresholdPrice);

    item.appendChild(condSpan);
    list.appendChild(item);
  });

  while (panelAlertRules.firstChild) panelAlertRules.removeChild(panelAlertRules.firstChild);
  panelAlertRules.appendChild(list);
}

/* ================================================================
 * PANEL 4 — Recent Alert Events
 * Doc 4 §8.1 Panel 4
 * Fields: { id, triggeredAt } — ONLY triggeredAt is shown
 * ================================================================ */

function _renderAlertEvents(items) {
  if (!panelAlertEvents) return;
  hideSkeleton(panelAlertEvents);

  if (!items || items.length === 0) {
    renderEmptyState(panelAlertEvents, {
      icon:    'fa-solid fa-bell',
      title:   'No alerts triggered yet',
      message: 'Alert events appear here when prices cross your thresholds.',
    });
    return;
  }

  const list = createElement('ul', {
    className: 'dashboard-panel__list',
    attrs:     { role: 'list' },
  });

  items.forEach((event) => {
    const item = createElement('li', { className: 'dashboard-panel__item' });

    const timeSpan = createElement('span', { className: 'dashboard-panel__item-name' });
    // formatDateTime returns e.g. "Aug 10, 2026, 02:30 PM" or "—" for null
    timeSpan.textContent = formatDateTime(event.triggeredAt);

    item.appendChild(timeSpan);
    list.appendChild(item);
  });

  while (panelAlertEvents.firstChild) panelAlertEvents.removeChild(panelAlertEvents.firstChild);
  panelAlertEvents.appendChild(list);
}

/* ================================================================
 * PANEL 5 — Sync Status
 * Doc 4 §8.1 Panel 5
 * sync.lastPriceSyncAt and sync.lastNewsSyncAt are both null in v1.
 * null displays as "Never" — NOT an error state. Use secondary colour.
 * ================================================================ */

function _renderSync(sync) {
  const priceTime = sync?.lastPriceSyncAt;
  const newsTime  = sync?.lastNewsSyncAt;

  if (syncPriceEl) {
    syncPriceEl.textContent = priceTime ? formatDateTime(priceTime) : 'Never';
  }
  if (syncNewsEl) {
    syncNewsEl.textContent = newsTime ? formatDateTime(newsTime) : 'Never';
  }
}

/* ================================================================
 * PAGE-LEVEL ERROR (full dashboard load failure)
 * ================================================================ */

function _renderPageError(err) {
  _hideAllSkeletons();
  if (!dashboardGrid) return;

  let message = 'Something went wrong. Please try again.';
  if (err?.status === 404) {
    message = 'Business profile not found. Please check your settings.';
  } else if (!err?.status) {
    message = 'Could not connect to the server. Check your connection.';
  }

  renderErrorState(dashboardGrid, {
    title:   'Failed to load dashboard',
    message,
    retry:   () => loadDashboard(),
  });
}

/* ================================================================
 * MAIN DATA LOAD
 * ================================================================ */

async function loadDashboard() {
  _showAllSkeletons();

  try {
    const data = await getDashboard();

    _renderMaterials(data.trackedMaterials  ?? []);
    _renderNews(data.recentNews             ?? []);
    _renderAlertRules(data.activeAlertRules ?? []);
    _renderAlertEvents(data.recentAlertEvents ?? []);
    _renderSync(data.sync ?? {});

  } catch (err) {
    _renderPageError(err);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
loadDashboard();
