/**
 * DashboardPage — Executive Procurement Command Center
 * Business Market Monitor — React frontend
 *
 * SSR-safe: reads optional AuthContext via useContext(AuthContext) so tests rendering
 * <DashboardPage /> inside <MemoryRouter> without <AuthProvider> work cleanly.
 */

import { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { getDashboard } from '../api/dashboard.api.js';
import { getBusinessLatestInsights } from '../api/aiInsights.api.js';
import { getSavingsRoi } from '../api/analytics.api.js';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { InsightCard } from '../components/ui/InsightCard.jsx';
import { RollingMetric } from '../components/ui/RollingMetric.jsx';
import { formatPriceDisplay, formatDateTime, formatAlertCondition } from '../utils/format.js';
import '../styles/pages/dashboard.css';

const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

function formatInrCompact(val) {
  return `₹${Math.round(val).toLocaleString('en-IN')}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const currentRole = auth?.business?.businessRole || auth?.user?.businessRole || 'OWNER';
  const isViewer = currentRole === 'VIEWER';

  const [status, setStatus] = useState(STATUS.LOADING);
  const [data, setData] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  const [aiInsights, setAiInsights] = useState([]);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(true);
  const [aiInsightsError, setAiInsightsError] = useState(null);

  const [savingsRoi, setSavingsRoi] = useState(null);
  const [savingsRoiLoading, setSavingsRoiLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await getDashboard();
      return { ok: true, result };
    } catch (err) {
      let message = 'Something went wrong. Please try again.';
      if (err?.status === 404) {
        message = 'Business profile not found. Please check your settings.';
      } else if (!err?.status) {
        message = 'Could not connect to the server. Check your connection.';
      }
      return { ok: false, message };
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    setStatus(STATUS.LOADING);
    setErrMsg('');
    const outcome = await fetchDashboard();
    if (outcome.ok) {
      setData(outcome.result);
      setStatus(STATUS.SUCCESS);
    } else {
      setErrMsg(outcome.message);
      setStatus(STATUS.ERROR);
    }
  }, [fetchDashboard]);

  useEffect(() => {
    let cancelled = false;

    fetchDashboard().then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) {
        setData(outcome.result);
        setStatus(STATUS.SUCCESS);
      } else {
        setErrMsg(outcome.message);
        setStatus(STATUS.ERROR);
      }
    });

    getBusinessLatestInsights(3)
      .then((insights) => {
        if (!cancelled) {
          setAiInsights(insights ?? []);
          setAiInsightsError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiInsightsError('Could not load AI insights. They will be retried on next load.');
        }
      })
      .finally(() => {
        if (!cancelled) setAiInsightsLoading(false);
      });

    getSavingsRoi()
      .then((result) => {
        if (!cancelled) setSavingsRoi(result);
      })
      .catch(() => {
        if (!cancelled) setSavingsRoi(null);
      })
      .finally(() => {
        if (!cancelled) setSavingsRoiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchDashboard]);

  const isLoading = status === STATUS.LOADING;
  const isError = status === STATUS.ERROR;

  const trackedCount = data?.trackedMaterials?.length ?? 0;
  const withPricesCount = data?.trackedMaterials?.filter((m) => m.latestPrice != null)?.length ?? 0;
  const activeRulesCount = data?.activeAlertRules?.length ?? 0;
  const recentAlertsCount = data?.recentAlertEvents?.length ?? 0;
  const aiInsightsCount = aiInsights?.length ?? 0;
  const monthlySavingsInr = savingsRoi?.totalMonthlySavingsInr || 0;

  return (
    <div className="page-container">
      {isError && (
        <ErrorState
          title="Failed to load dashboard"
          message={errMsg}
          retry={loadDashboard}
        />
      )}

      {/* Top KPI Stat Cards */}
      {!isError && (
        <div className="dashboard-kpi-grid" aria-label="Key Performance Indicators">
          <div className="card dashboard-stat">
            <div className="dashboard-stat__header">
              <span className="dashboard-stat__label">Tracked Materials</span>
              <i className="fa-solid fa-boxes-stacked dashboard-stat__icon" aria-hidden="true" />
            </div>
            <div className="dashboard-stat__value font-mono">
              {isLoading ? '—' : <RollingMetric value={trackedCount} decimals={0} durationMs={320} />}
            </div>
            <div className="dashboard-stat__footer">
              <span className="dashboard-stat__subtext">
                <strong>{isLoading ? '—' : withPricesCount}</strong> with recorded prices
              </span>
            </div>
          </div>

          <div className="card dashboard-stat">
            <div className="dashboard-stat__header">
              <span className="dashboard-stat__label">Active Alert Rules</span>
              <i className="fa-solid fa-bell dashboard-stat__icon" aria-hidden="true" />
            </div>
            <div className="dashboard-stat__value font-mono">
              {isLoading ? '—' : <RollingMetric value={activeRulesCount} decimals={0} durationMs={320} />}
            </div>
            <div className="dashboard-stat__footer">
              <span className="dashboard-stat__subtext">Price threshold monitors</span>
            </div>
          </div>

          <div className="card dashboard-stat">
            <div className="dashboard-stat__header">
              <span className="dashboard-stat__label">Triggered Events</span>
              <i className="fa-solid fa-triangle-exclamation dashboard-stat__icon" aria-hidden="true" />
            </div>
            <div className="dashboard-stat__value font-mono">
              {isLoading ? '—' : <RollingMetric value={recentAlertsCount} decimals={0} durationMs={320} />}
            </div>
            <div className="dashboard-stat__footer">
              <span className="dashboard-stat__subtext">Recent threshold crossings</span>
            </div>
          </div>

          <div className="card dashboard-stat">
            <div className="dashboard-stat__header">
              <span className="dashboard-stat__label">AI Insights</span>
              <i className="fa-solid fa-bolt dashboard-stat__icon dashboard-stat__icon--accent" aria-hidden="true" />
            </div>
            <div className="dashboard-stat__value font-mono">
              {aiInsightsLoading ? '—' : <RollingMetric value={aiInsightsCount} decimals={0} durationMs={320} />}
            </div>
            <div className="dashboard-stat__footer">
              <span className="dashboard-stat__subtext">Active market briefings</span>
            </div>
          </div>

          <div className="card dashboard-stat dashboard-stat--roi" id="kpi-savings-roi">
            <div className="dashboard-stat__header">
              <span className="dashboard-stat__label">Procurement Savings ROI</span>
              <i className="fa-solid fa-arrow-trend-up dashboard-stat__icon dashboard-stat__icon--roi" aria-hidden="true" />
            </div>
            <div className="dashboard-stat__value dashboard-stat__value--roi font-mono">
              {savingsRoiLoading ? (
                '—'
              ) : (
                <RollingMetric
                  value={monthlySavingsInr}
                  formatFn={formatInrCompact}
                  durationMs={420}
                  testId="kpi-savings-roi-value"
                />
              )}
              <span className="dashboard-stat__unit">/mo</span>
            </div>
            <div className="dashboard-stat__footer">
              <span className="dashboard-stat__subtext">
                {savingsRoiLoading ? (
                  'Calculating verified ROI...'
                ) : monthlySavingsInr > 0 ? (
                  <>
                    <strong>₹{(savingsRoi.annualizedSavingsInr || 0).toLocaleString('en-IN')}</strong>
                    /yr projected ({savingsRoi.materialsScaledCount} scaled)
                  </>
                ) : (savingsRoi?.materialsWithSavings || 0) > 0 ? (
                  <>
                    <strong>{savingsRoi.materialsWithSavings}</strong> material(s) with unit savings
                  </>
                ) : (
                  'Real-time parity & quote savings'
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard grid */}
      {!isError && (
        <div className="dashboard-grid" id="dashboard-grid">
          {/* Panel 1 — Tracked Materials */}
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
                    isViewer={isViewer}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Panel 2 — Recent News */}
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

          {/* Panel 3 — Active Alert Rules */}
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
                    isViewer={isViewer}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Panel 4 — Recent Alert Events */}
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

          {/* Panel 5 — Sync Status */}
          <section
            className="card dashboard-panel dashboard-panel--full"
            aria-labelledby="panel-sync-heading"
          >
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-sync-heading">Data Sync Status</h2>
              <i
                className="fa-solid fa-circle-info dashboard-panel__info-icon"
                aria-hidden="true"
                title="Automated market feeds sync on schedule alongside manual supplier quote logs."
              />
            </div>
            <div className="card__body">
              <div className="sync-bar">
                <div className="sync-bar__item">
                  <span
                    className={`sync-bar__dot${!data?.sync?.lastPriceSyncAt ? ' sync-bar__dot--inactive' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Last price update:</span>
                  <strong id="sync-price-time" className="sync-bar__value">
                    {isLoading
                      ? '—'
                      : data?.sync?.lastPriceSyncAt
                        ? formatDateTime(data.sync.lastPriceSyncAt)
                        : 'Never'}
                  </strong>
                </div>
                <div className="sync-bar__item">
                  <span
                    className={`sync-bar__dot${!data?.sync?.lastNewsSyncAt ? ' sync-bar__dot--inactive' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Last news update:</span>
                  <strong id="sync-news-time" className="sync-bar__value">
                    {isLoading
                      ? '—'
                      : data?.sync?.lastNewsSyncAt
                        ? formatDateTime(data.sync.lastNewsSyncAt)
                        : 'Never'}
                  </strong>
                </div>
              </div>
            </div>
          </section>

          {/* Panel 6 — AI Market Intelligence (flat inset cards, no duplicate AI pills) */}
          <section
            className="card dashboard-panel dashboard-panel--full"
            aria-labelledby="panel-ai-insights-heading"
          >
            <div className="card__header dashboard-panel__header">
              <h2 className="card__title" id="panel-ai-insights-heading">AI Market Intelligence</h2>
              {!aiInsightsLoading && aiInsightsCount > 0 && (
                <span className="badge badge--neutral font-mono">{aiInsightsCount} active</span>
              )}
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
                  icon="fa-solid fa-chart-line"
                  title="No market insights generated yet"
                  message="AI market briefings appear here automatically after scheduled price evaluations complete."
                />
              )}

              {!aiInsightsLoading && !aiInsightsError && aiInsights.length > 0 && (
                <div className="insight-panel-list">
                  {aiInsights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      title={`Material #${insight.tracked_material_id}`}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MaterialsList({ items, onNavigate, isViewer }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-boxes-stacked"
        title="No materials being tracked"
        message="Start monitoring key raw materials to track price movements and inventory cover."
        action={
          isViewer
            ? undefined
            : { label: 'Go to Materials', onClick: () => onNavigate('/materials') }
        }
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map((material) => {
        const hasCover = material.daysOfCover != null;
        const coverPct = hasCover
          ? Math.max(4, Math.min(100, Math.round((Number(material.daysOfCover) / 30) * 100)))
          : 0;
        const coverTone =
          material.stockoutRisk === 'CRITICAL'
            ? 'danger'
            : material.stockoutRisk === 'LOW'
              ? 'warning'
              : 'success';
        const coverBadgeCls =
          material.stockoutRisk === 'CRITICAL'
            ? 'badge--danger'
            : material.stockoutRisk === 'LOW'
              ? 'badge--warning'
              : 'badge--success';

        return (
          <li key={material.id} className="dashboard-panel__item">
            <div className="dashboard-panel__item-main">
              <span className="dashboard-panel__item-name">{material.name}</span>

              <div className="dashboard-panel__item-meta dashboard-material-meta">
                {material.latestPrice === null || material.latestPrice === undefined ? (
                  <span className="dashboard-panel__item-value dashboard-panel__item-value--null">
                    No price recorded
                  </span>
                ) : (
                  <>
                    <span className="dashboard-panel__item-value font-mono">
                      {formatPriceDisplay({
                        price: material.latestPrice,
                        currency: material.currency,
                        unitLabel: material.unitLabel,
                        externalSymbol: material.externalSymbol,
                      }).text}
                    </span>
                    {material.dataClass && (
                      <span
                        className={`dashboard-badge ${
                          material.dataClass === 'OFFICIAL_BENCHMARK'
                            ? 'dashboard-badge--benchmark'
                            : material.dataClass === 'MARKET_INDICATIVE'
                              ? 'dashboard-badge--proxy'
                              : 'dashboard-badge--quote'
                        }`}
                      >
                        {material.dataClass === 'OFFICIAL_BENCHMARK'
                          ? 'Benchmark'
                          : material.dataClass === 'MARKET_INDICATIVE'
                            ? 'Proxy'
                            : 'Quote'}
                      </span>
                    )}
                  </>
                )}

                {hasCover && (
                  <div className="dashboard-cover-wrap">
                    <span className={`badge ${coverBadgeCls} dashboard-cover-badge`}>
                      {material.stockoutRisk === 'CRITICAL'
                        ? `CRITICAL: ${material.daysOfCover}d`
                        : material.stockoutRisk === 'LOW'
                          ? `LOW: ${material.daysOfCover}d`
                          : `${material.daysOfCover}d cover`}
                    </span>
                    <span className="dashboard-cover-meter" aria-hidden="true">
                      <span
                        className={`dashboard-cover-meter__fill dashboard-cover-meter__fill--${coverTone}`}
                        style={{ width: `${coverPct}%` }}
                      />
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="dashboard-panel__item-actions">
              {!isViewer && (
                <Link
                  to={`/prices?materialId=${material.id}`}
                  className="btn btn--sm btn--ghost"
                >
                  Add Price
                </Link>
              )}
              <Link
                to={`/trends?materialId=${material.id}`}
                className="btn btn--sm btn--ghost"
              >
                Trends
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function NewsList({ items }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-newspaper"
        title="No recent news"
        message="Market and regulatory headlines for your industry will appear here once synced."
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map((article) => (
        <li key={article.id} className="dashboard-panel__item">
          <span className="dashboard-panel__item-name">{article.title}</span>
        </li>
      ))}
    </ul>
  );
}

function AlertRulesList({ items, onNavigate, isViewer }) {
  if (!items || items.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell-slash"
        title="No active alert rules"
        message="Create threshold alerts to catch supplier price spikes early."
        action={
          isViewer
            ? undefined
            : { label: 'Create Alert Rule', onClick: () => onNavigate('/alerts') }
        }
      />
    );
  }

  return (
    <ul className="dashboard-panel__list" role="list">
      {items.map((rule) => (
        <li key={rule.id} className="dashboard-panel__item">
          <span className="dashboard-panel__item-name">
            {formatAlertCondition(rule.conditionType, rule.thresholdPrice, rule.thresholdType)}
          </span>
        </li>
      ))}
    </ul>
  );
}

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
      {items.map((event) => (
        <li key={event.id} className="dashboard-panel__item">
          <span className="dashboard-panel__item-name font-mono">
            {formatDateTime(event.triggeredAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
