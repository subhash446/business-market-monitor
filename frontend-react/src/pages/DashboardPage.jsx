/**
 * DashboardPage — Main dashboard
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/dashboard.html + frontend/js/pages/dashboard.js
 *
 * FLOW (preserved exactly from original):
 *  1. Auth guard: requireAuth() + requireBusiness() — handled by ProtectedRoute in App.jsx
 *  2. Show skeletons in all 4 data panels immediately on render
 *  3. GET /api/v1/dashboard (single call — no query params)
 *  4. Render all 5 panels from response
 *  5. On error: render full-page error state with retry
 *
 * RESPONSE FIELD RULES (Doc 4 §8.1 — confirmed from backend source):
 *   trackedMaterials[].latestPrice  → scalar number | null (NOT an object)
 *   significantChange               → absent — NEVER reference
 *   recentNews[]                    → { id, title } ONLY — no url, source, or date
 *   activeAlertRules[]              → { id, conditionType, thresholdPrice } — no materialName
 *   recentAlertEvents[]             → { id, triggeredAt } ONLY
 *   sync.lastPriceSyncAt / lastNewsSyncAt → both null in v1 → show "Never" (not an error)
 *
 * CHARTS: The original dashboard.js contains NO chart implementation.
 *   Chart.js is NOT installed and NOT required for this page.
 *
 * LAYOUT: Rendered inside AppLayout (sidebar + header) via React Router Outlet.
 *   Does NOT render its own app shell — AppLayout provides it.
 *
 * CSS: dashboard.css imported (same classes as original dashboard.html).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDashboard } from '../api/dashboard.api.js';
import { getBusinessLatestInsights } from '../api/aiInsights.api.js';
import { Skeleton }     from '../components/ui/Skeleton.jsx';
import { EmptyState }   from '../components/ui/EmptyState.jsx';
import { ErrorState }   from '../components/ui/ErrorState.jsx';
import { InsightCard }  from '../components/ui/InsightCard.jsx';
import { formatNumber, formatDateTime, formatAlertCondition } from '../utils/format.js';
import '../styles/pages/dashboard.css';

/* ── Loading / data states ───────────────────────────────────────── */
const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

export function DashboardPage() {
  const navigate = useNavigate();

  const [status,    setStatus]    = useState(STATUS.LOADING);
  const [data,      setData]      = useState(null);
  const [errMsg,    setErrMsg]    = useState('');

  // AI insights loaded independently — never blocks main dashboard data.
  // A Gemini/AI failure shows an inline error on Panel 6 only.
  const [aiInsights,        setAiInsights]        = useState([]);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(true);
  const [aiInsightsError,   setAiInsightsError]   = useState(null);

  /* ── Load dashboard data ──────────────────────────────────────── */
  const loadDashboard = useCallback(async () => {
    setStatus(STATUS.LOADING);
    setErrMsg('');
    try {
      const result = await getDashboard();
      setData(result);
      setStatus(STATUS.SUCCESS);
    } catch (err) {
      let message = 'Something went wrong. Please try again.';
      if (err?.status === 404) {
        message = 'Business profile not found. Please check your settings.';
      } else if (!err?.status) {
        message = 'Could not connect to the server. Check your connection.';
      }
      setErrMsg(message);
      setStatus(STATUS.ERROR);
    }
  }, []);

  /* ── Load AI insights (independent of main dashboard) ────────── */
  const loadAiInsights = useCallback(async () => {
    setAiInsightsLoading(true);
    setAiInsightsError(null);
    try {
      const insights = await getBusinessLatestInsights(3);
      setAiInsights(insights ?? []);
    } catch {
      setAiInsightsError('Could not load AI insights. They will be retried on next load.');
    } finally {
      setAiInsightsLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadAiInsights(); }, [loadAiInsights]);

  /* ── Render ───────────────────────────────────────────────────── */
  const isLoading = status === STATUS.LOADING;
  const isError   = status === STATUS.ERROR;

  return (
    <div className="page-container">

      {/* Full-page error — replaces dashboard grid on fatal load failure */}
      {isError && (
        <ErrorState
          title="Failed to load dashboard"
          message={errMsg}
          retry={loadDashboard}
        />
      )}

      {/* Dashboard grid — 5 panels */}
      {!isError && (
        <div className="dashboard-grid" id="dashboard-grid">

          {/* ── Panel 1 — Tracked Materials ──────────────────────── */}
          <section className="card dashboard-panel" aria-labelledby="panel-materials-heading">
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-materials-heading">Tracked Materials</h2>
              <Link to="/materials" className="card__header-link">
                Manage <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
            <div className="card__body dashboard-panel__body">
              <div id="panel-materials-list" role="status" aria-label="Tracked materials">
                {isLoading ? (
                  <Skeleton type="panel" rows={4} />
                ) : (
                  <MaterialsList
                    items={data?.trackedMaterials ?? []}
                    onNavigate={navigate}
                  />
                )}
              </div>
            </div>
          </section>

          {/* ── Panel 2 — Recent News ────────────────────────────── */}
          <section className="card dashboard-panel" aria-labelledby="panel-news-heading">
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-news-heading">Recent News</h2>
              <Link to="/news" className="card__header-link">
                View All <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
            <div className="card__body dashboard-panel__body">
              <div id="panel-news-list" role="status" aria-label="Recent news">
                {isLoading ? (
                  <Skeleton type="panel" rows={4} />
                ) : (
                  <NewsList items={data?.recentNews ?? []} />
                )}
              </div>
            </div>
          </section>

          {/* ── Panel 3 — Active Alert Rules ─────────────────────── */}
          <section className="card dashboard-panel" aria-labelledby="panel-alert-rules-heading">
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-alert-rules-heading">Active Alert Rules</h2>
              <Link to="/alerts" className="card__header-link">
                Manage <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
            <div className="card__body dashboard-panel__body">
              <div id="panel-alert-rules-list" role="status" aria-label="Active alert rules">
                {isLoading ? (
                  <Skeleton type="panel" rows={4} />
                ) : (
                  <AlertRulesList
                    items={data?.activeAlertRules ?? []}
                    onNavigate={navigate}
                  />
                )}
              </div>
            </div>
          </section>

          {/* ── Panel 4 — Recent Alert Events ────────────────────── */}
          <section className="card dashboard-panel" aria-labelledby="panel-alert-events-heading">
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-alert-events-heading">Recent Alert Events</h2>
              <Link to="/alerts" className="card__header-link">
                View History <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
            <div className="card__body dashboard-panel__body">
              <div id="panel-alert-events-list" role="status" aria-label="Recent alert events">
                {isLoading ? (
                  <Skeleton type="panel" rows={4} />
                ) : (
                  <AlertEventsList items={data?.recentAlertEvents ?? []} />
                )}
              </div>
            </div>
          </section>

          {/* ── Panel 5 — Sync Status (full-width row) ───────────── */}
          {/* sync timestamps are both null in v1 — "Never" is expected, not an error */}
          <section
            className="card dashboard-panel dashboard-panel--full"
            aria-labelledby="panel-sync-heading"
          >
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-sync-heading">Data Sync Status</h2>
              <i
                className="fa-solid fa-circle-info dashboard-panel__info-icon"
                aria-hidden="true"
                title="Automated data sync is pending activation. Prices are entered manually."
              />
            </div>
            <div className="card__body">
              <div className="sync-bar">
                {/* Price sync */}
                <div className="sync-bar__item">
                  <span className="sync-bar__dot" aria-hidden="true" />
                  <span>Last price update:</span>
                  <strong id="sync-price-time" className="sync-bar__value">
                    {isLoading
                      ? '—'
                      : (data?.sync?.lastPriceSyncAt
                          ? formatDateTime(data.sync.lastPriceSyncAt)
                          : 'Never')}
                  </strong>
                </div>
                {/* News sync */}
                <div className="sync-bar__item">
                  <span className="sync-bar__dot" aria-hidden="true" />
                  <span>Last news update:</span>
                  <strong id="sync-news-time" className="sync-bar__value">
                    {isLoading
                      ? '—'
                      : (data?.sync?.lastNewsSyncAt
                          ? formatDateTime(data.sync.lastNewsSyncAt)
                          : 'Never')}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          {/* ── Panel 6 — AI Market Intelligence (full-width) ─────── */}
          {/* Loaded independently — a Gemini error here never affects other panels. */}
          <section
            className="card dashboard-panel dashboard-panel--full"
            aria-labelledby="panel-ai-insights-heading"
          >
            <div className="card__header dashboard-panel__header">
              <div className="insight-card__title-row">
                <i className="fa-solid fa-robot insight-card__ai-icon" aria-hidden="true" />
                <h2 className="card__title" id="panel-ai-insights-heading">AI Market Intelligence</h2>
                <span className="insight-card__badge-ai" aria-label="AI-generated content">AI</span>
              </div>
            </div>
            <div className="card__body">
              {aiInsightsLoading && <Skeleton type="panel" rows={3} />}

              {!aiInsightsLoading && aiInsightsError && (
                <p className="insight-card__error">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  {' '}{aiInsightsError}
                </p>
              )}

              {!aiInsightsLoading && !aiInsightsError && aiInsights.length === 0 && (
                <EmptyState
                  icon="fa-solid fa-robot"
                  title="No AI insights generated yet"
                  message="AI market insights are generated automatically each morning once enough price data is available."
                />
              )}

              {!aiInsightsLoading && !aiInsightsError && aiInsights.length > 0 && (
                <div className="insight-panel-list">
                  {aiInsights.map(insight => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      title={`Insight — Material #${insight.tracked_material_id}`}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

        </div> /* /.dashboard-grid */
      )}

    </div> /* /.page-container */
  );
}

/* ================================================================
 * PANEL CONTENT COMPONENTS
 * These replace the imperative _render*() functions from dashboard.js.
 * All use identical CSS classes and the same empty/data logic.
 * ================================================================ */

/**
 * Panel 1 — Tracked Materials
 * Fields: { id, name, latestPrice: number | null }
 * latestPrice is a scalar — NOT an object. No unit suffix.
 * significantChange is absent and NEVER referenced.
 */
function MaterialsList({ items, onNavigate }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-boxes-stacked"
        title="No materials being tracked"
        message="No materials are being tracked yet."
        action={{ label: 'Go to Materials', onClick: () => onNavigate('/materials') }}
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map(material => (
        <li key={material.id} className="dashboard-panel__item">
          <span className="dashboard-panel__item-name">{material.name}</span>

          {/* latestPrice is scalar number | null (Doc 4 §8.1, §16) */}
          {material.latestPrice === null || material.latestPrice === undefined ? (
            <span className="dashboard-panel__item-value dashboard-panel__item-value--null">
              No price recorded
            </span>
          ) : (
            <span className="dashboard-panel__item-value font-mono">
              {/* formatNumber gives locale-aware thousands separator e.g. "1,250.00" */}
              {formatNumber(material.latestPrice, 2)}
            </span>
          )}

          {/* Quick-action links — id is tracked_materials.id (universal material ID) */}
          <div className="dashboard-panel__item-actions">
            <Link
              to={`/prices?materialId=${material.id}`}
              className="btn btn--sm btn--ghost"
            >
              Add Price
            </Link>
            <Link
              to={`/trends?materialId=${material.id}`}
              className="btn btn--sm btn--ghost"
            >
              Trends
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Panel 2 — Recent News
 * Fields: { id, title } — NO url, source, or date in dashboard response.
 * Title is displayed as text only (no link — no URL available here).
 */
function NewsList({ items }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-newspaper"
        title="No recent news"
        message="News will appear here once your industry feed is connected."
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map(article => (
        <li key={article.id} className="dashboard-panel__item">
          {/* textContent only — no link (no URL in this endpoint response) */}
          <span className="dashboard-panel__item-name">{article.title}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Panel 3 — Active Alert Rules
 * Fields: { id, conditionType, thresholdPrice } — NO materialName in this response.
 */
function AlertRulesList({ items, onNavigate }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell-slash"
        title="No active alert rules"
        message="No active alert rules."
        action={{ label: 'Create Alert Rule', onClick: () => onNavigate('/alerts') }}
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map(rule => (
        <li key={rule.id} className="dashboard-panel__item">
          {/* "Price Above 1,500.00" or "Price Below 90.00" */}
          <span className="dashboard-panel__item-name">
            {formatAlertCondition(rule.conditionType, rule.thresholdPrice)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Panel 4 — Recent Alert Events
 * Fields: { id, triggeredAt } — ONLY triggeredAt is shown.
 * No materialName, no conditionType in this endpoint's response.
 */
function AlertEventsList({ items }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell"
        title="No alerts triggered yet"
        message="Alert events appear here when prices cross your thresholds."
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map(event => (
        <li key={event.id} className="dashboard-panel__item">
          {/* formatDateTime returns e.g. "Aug 10, 2026, 02:30 PM" or "—" for null */}
          <span className="dashboard-panel__item-name">
            {formatDateTime(event.triggeredAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
