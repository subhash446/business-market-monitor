/**
 * NewsPage — Industry news feed & Periodic News Digest (FR-ALERT-06 / T-08)
 * Business Market Monitor — React frontend
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth }     from '../hooks/useAuth.js';
import { getNews, NEWS_LIMIT } from '../api/news.api.js';
import { getDigestPreview, sendDigestNow } from '../api/business.api.js';
import { Skeleton }    from '../components/ui/Skeleton.jsx';
import { EmptyState }  from '../components/ui/EmptyState.jsx';
import { ErrorState }  from '../components/ui/ErrorState.jsx';
import { Pagination }  from '../components/ui/Pagination.jsx';
import { Modal }       from '../components/ui/Modal.jsx';
import { useToast }    from '../components/ui/Toast.jsx';
import { formatDate, formatDateTime, getSafeExternalUrl } from '../utils/format.js';
import '../styles/pages/news.css';

const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

export function NewsPage() {
  const { user, business } = useAuth();
  const { showToast } = useToast();

  const currentRole = business?.businessRole || user?.businessRole || 'OWNER';
  const isOwner = currentRole === 'OWNER';

  const [status, setStatus] = useState(STATUS.LOADING);
  const [items,  setItems]  = useState([]);
  const [meta,   setMeta]   = useState(null);

  // Periodic Digest Preview Modal state
  const [showDigestModal, setShowDigestModal] = useState(false);
  const [digestPreview,   setDigestPreview]   = useState(null);
  const [digestLoading,   setDigestLoading]   = useState(false);
  const [sendingDigest,   setSendingDigest]   = useState(false);
  const [digestTab,       setDigestTab]       = useState('email'); // 'email' | 'whatsapp' | 'sourcing'

  /* ── Industry label — from auth business context, no extra API call ── */
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

  useEffect(() => {
    let cancelled = false;
    getNews({ page: 1, limit: NEWS_LIMIT })
      .then(({ data, meta: m }) => {
        if (cancelled) return;
        setItems(data ?? []);
        setMeta(m);
        setStatus(STATUS.SUCCESS);
      })
      .catch(() => {
        if (!cancelled) setStatus(STATUS.ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Open Digest modal and fetch preview ────────────────────── */
  async function handleOpenDigestModal() {
    setShowDigestModal(true);
    setDigestLoading(true);
    try {
      const data = await getDigestPreview();
      setDigestPreview(data);
    } catch {
      showToast({ type: 'error', message: 'Could not generate digest preview.' });
    } finally {
      setDigestLoading(false);
    }
  }

  /* ── Send digest now ────────────────────────────────────────── */
  async function handleSendDigestNow() {
    if (!isOwner) {
      showToast({ type: 'error', message: 'Only workspace Owners can dispatch digests.' });
      return;
    }
    setSendingDigest(true);
    try {
      const result = await sendDigestNow();
      if (result.success) {
        showToast({
          type: 'success',
          message: `Digest dispatched successfully via ${result.channelUsed || 'EMAIL'}.`,
        });
        // refresh preview timestamp
        setDigestPreview((prev) => prev ? { ...prev, lastDigestSentAt: result.sentAt } : prev);
      } else {
        showToast({ type: 'warning', message: 'Digest dispatch finished with partial or failed status.' });
      }
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to send digest.' });
    } finally {
      setSendingDigest(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container news-page">

      {/* Header bar with industry label and digest modal trigger */}
      <div className="news-toolbar">
        <div>
          <h2 className="news-toolbar__title">Industry Intelligence Feed</h2>
          <p id="news-industry-label" className="news-industry-label page-subtitle">
            {industryName
              ? `Showing news for: ${industryName}`
              : 'Showing news for your industry'}
          </p>
        </div>

        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={handleOpenDigestModal}
          id="btn-open-digest-preview"
        >
          <i className="fa-solid fa-envelope-open-text mr-1" aria-hidden="true" /> View Periodic Digest &amp; Sourcing Summary
        </button>
      </div>

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
            message="Relevant industry news articles for your tracked commodities will appear here automatically as market updates are ingested."
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
        <div id="news-pagination" className="news-pagination">
          <Pagination meta={meta} onPageChange={page => loadNews(page)} />
        </div>
      )}

      {/* Periodic Digest Preview Modal */}
      {showDigestModal && (
        <Modal
          isOpen={showDigestModal}
          onClose={() => setShowDigestModal(false)}
          title="Periodic News &amp; Sourcing Digest Preview"
          size="lg"
          id="digest-preview-modal"
          footer={
            <div className="digest-modal-footer">
              <div className="digest-modal-footer__meta">
                Cadence: <strong>{digestPreview?.frequency || 'WEEKLY'}</strong> &bull; Channel: <strong>{digestPreview?.digestChannel || 'EMAIL'}</strong>
                {digestPreview?.lastDigestSentAt && (
                  <span> &bull; Last sent: {formatDateTime(digestPreview.lastDigestSentAt)}</span>
                )}
              </div>
              <div className="digest-modal-footer__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowDigestModal(false)}
                >
                  Close
                </button>
                {isOwner && (
                  <button
                    type="button"
                    className={`btn btn--primary${sendingDigest ? ' btn--loading' : ''}`}
                    onClick={handleSendDigestNow}
                    disabled={sendingDigest || digestLoading}
                    id="btn-send-digest-now"
                  >
                    <i className="fa-solid fa-paper-plane mr-1" aria-hidden="true" /> Send Digest Now
                  </button>
                )}
              </div>
            </div>
          }
        >
          {digestLoading ? (
            <div className="digest-modal-loading">
              <Skeleton type="card" rows={3} />
            </div>
          ) : digestPreview ? (
            <div>
              {/* Tab Selector */}
              <div className="digest-modal-tabs" role="tablist" aria-label="Digest preview channels">
                <button
                  type="button"
                  role="tab"
                  aria-selected={digestTab === 'email'}
                  className={`btn btn--sm ${digestTab === 'email' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDigestTab('email')}
                >
                  <i className="fa-solid fa-envelope mr-1" aria-hidden="true" /> Email Preview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={digestTab === 'whatsapp'}
                  className={`btn btn--sm ${digestTab === 'whatsapp' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDigestTab('whatsapp')}
                >
                  <i className="fa-brands fa-whatsapp mr-1" aria-hidden="true" /> WhatsApp Preview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={digestTab === 'sourcing'}
                  className={`btn btn--sm ${digestTab === 'sourcing' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDigestTab('sourcing')}
                >
                  <i className="fa-solid fa-boxes-packing mr-1" aria-hidden="true" /> Sourcing Guidance ({digestPreview.procurementActions?.length || 0})
                </button>
              </div>

              {/* Tab Content 1: Email View */}
              {digestTab === 'email' && (
                <div className="digest-email-sheet" role="tabpanel">
                  <div className="digest-email-sheet__header">
                    <div className="digest-email-sheet__subject">
                      [{digestPreview.frequency || 'Weekly'} Digest] Market Intelligence for {digestPreview.businessName}
                    </div>
                    <div className="digest-email-sheet__meta">
                      Industry Focus: <span className="digest-accent-link">{digestPreview.industryName}</span>
                    </div>
                  </div>

                  {/* 7-Day Movers Table */}
                  <div className="digest-section">
                    <h4 className="digest-section__title">
                      <i className="fa-solid fa-chart-line mr-2 digest-icon-info" aria-hidden="true" />
                      7-Day Price Movers
                    </h4>
                    {digestPreview.topMovers && digestPreview.topMovers.length > 0 ? (
                      <div className="table-wrapper">
                        <table className="table table--compact">
                          <thead>
                            <tr>
                              <th>Material</th>
                              <th>Latest Price</th>
                              <th>7D Change</th>
                              <th>Trend</th>
                            </tr>
                          </thead>
                          <tbody>
                            {digestPreview.topMovers.map((m) => {
                              const isUp = Number(m.changePercent) > 0;
                              const isDown = Number(m.changePercent) < 0;
                              const deltaClass = isUp ? 'digest-delta--up' : (isDown ? 'digest-delta--down' : 'digest-delta--flat');
                              return (
                                <tr key={m.materialId}>
                                  <td className="digest-cell-strong">{m.materialName}</td>
                                  <td className="font-mono">
                                    {m.currency || 'INR'} {Number(m.latestPrice || 0).toFixed(2)}{m.unit ? ` / ${m.unit}` : ''}
                                  </td>
                                  <td className={`font-mono ${deltaClass}`}>
                                    {isUp ? '+' : ''}{Number(m.changePercent || 0).toFixed(2)}%
                                  </td>
                                  <td className="digest-cell-muted">{m.trend}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="digest-empty-note">No major 7-day price fluctuations recorded.</p>
                    )}
                  </div>

                  {/* Sourcing Actions summary */}
                  <div className="digest-section">
                    <h4 className="digest-section__title">
                      <i className="fa-solid fa-bullseye mr-2 digest-icon-info" aria-hidden="true" />
                      Sourcing &amp; Inventory Actions
                    </h4>
                    {digestPreview.procurementActions && digestPreview.procurementActions.length > 0 ? (
                      <div className="digest-card-stack">
                        {digestPreview.procurementActions.slice(0, 3).map((a) => {
                          const variant = a.bufferStrategy?.badgeVariant === 'danger'
                            ? 'danger'
                            : (a.bufferStrategy?.badgeVariant === 'warning' ? 'warning' : 'info');
                          return (
                            <div key={a.materialId} className={`digest-action-item digest-action-item--${variant}`}>
                              <div className="digest-action-item__top">
                                <strong className="digest-action-item__title">{a.materialName}</strong>
                                <span className={`badge badge--${variant}`}>
                                  {String(a.actionRecommendation || 'MONITOR_ONLY').replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div className="digest-action-item__rationale">
                                {a.rationale || a.bufferStrategy?.summary}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="digest-empty-note">All materials within standard inventory buffer parameters.</p>
                    )}
                  </div>

                  {/* Top News */}
                  <div>
                    <h4 className="digest-section__title">
                      <i className="fa-solid fa-newspaper mr-2 digest-icon-info" aria-hidden="true" />
                      Curated Industry Articles
                    </h4>
                    {digestPreview.topNews && digestPreview.topNews.length > 0 ? (
                      <div className="digest-card-stack">
                        {digestPreview.topNews.map((n) => {
                          const safeUrl = getSafeExternalUrl(n.url);
                          return (
                            <div key={n.id} className="digest-news-entry">
                              {safeUrl ? (
                                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="digest-news-entry__link">
                                  {n.title}
                                </a>
                              ) : (
                                <span className="digest-news-entry__title">{n.title}</span>
                              )}
                              <div className="digest-news-entry__meta">
                                {n.sourceName} &bull; {formatDate(n.publishedAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="digest-empty-note">No articles published in the current cycle.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab Content 2: WhatsApp View */}
              {digestTab === 'whatsapp' && (
                <div className="digest-wa-shell" role="tabpanel">
                  <pre className="digest-wa-bubble font-mono">
{`*Business Market Monitor — ${digestPreview.frequency || 'Weekly'} Digest*
*${digestPreview.businessName}* (${digestPreview.industryName})

*7-Day Price Movers:*
${(digestPreview.topMovers && digestPreview.topMovers.length > 0)
  ? digestPreview.topMovers.slice(0, 5).map(m => `- *${m.materialName}*: ${m.currency || 'INR'} ${Number(m.latestPrice || 0).toFixed(2)}${m.unit ? `/${m.unit}` : ''} (${Number(m.changePercent) > 0 ? '+' : ''}${Number(m.changePercent || 0).toFixed(1)}%) [${m.trend}]`).join('\n')
  : '- All tracked materials stable.'}

*Sourcing Actions:*
${(digestPreview.procurementActions && digestPreview.procurementActions.length > 0)
  ? digestPreview.procurementActions.slice(0, 3).map(a => `- *${a.materialName}*: ${String(a.actionRecommendation || 'MONITOR_ONLY').replace(/_/g, ' ')} — ${a.rationale || a.bufferStrategy?.summary || 'Standard replenishment buffer.'}`).join('\n')
  : '- Standard replenishment buffers maintained.'}

*Industry Headlines:*
${(digestPreview.topNews && digestPreview.topNews.length > 0)
  ? digestPreview.topNews.slice(0, 3).map(n => `- *${n.title}* (${n.sourceName})`).join('\n')
  : '- No fresh articles.'}

_Open BMM dashboard for live trends, graphs & supplier benchmarks._`}
                  </pre>
                </div>
              )}

              {/* Tab Content 3: Sourcing Guidance */}
              {digestTab === 'sourcing' && (
                <div className="digest-sourcing-list" role="tabpanel">
                  {digestPreview.procurementActions && digestPreview.procurementActions.length > 0 ? (
                    digestPreview.procurementActions.map((rec) => {
                      const recVariant = rec.actionRecommendation === 'ACCELERATE_PURCHASE'
                        ? 'danger'
                        : (rec.actionRecommendation === 'DELAY_PURCHASE' ? 'warning' : 'info');
                      return (
                        <div key={rec.materialId} className="digest-sourcing-card">
                          <div className="digest-sourcing-card__header">
                            <span className="digest-sourcing-card__name">
                              {rec.materialName}
                            </span>
                            <span className={`badge badge--${recVariant}`}>
                              {String(rec.actionRecommendation || 'MONITOR_ONLY').replace(/_/g, ' ')}
                            </span>
                          </div>

                          <p className="digest-sourcing-card__rationale">
                            {rec.rationale || rec.bufferStrategy?.detailedGuidance}
                          </p>

                          {/* Benchmark & Quote comparison */}
                          {rec.quoteComparison && (
                            <div className="digest-sourcing-card__parity">
                              {rec.quoteComparison.variancePercent !== null ? (
                                <span>
                                  Supplier quote vs market benchmark variance:{' '}
                                  <strong className={rec.quoteComparison.variancePercent > 0 ? 'digest-delta--up' : 'digest-delta--down'}>
                                    {rec.quoteComparison.variancePercent > 0 ? '+' : ''}{rec.quoteComparison.variancePercent}%
                                  </strong>
                                </span>
                              ) : rec.quoteComparison.crossCurrencyNote ? (
                                <span className="digest-parity-warning">
                                  <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" /> {rec.quoteComparison.crossCurrencyNote}
                                </span>
                              ) : (
                                <span>Single price data stream available.</span>
                              )}
                            </div>
                          )}

                          {/* Diversification advice */}
                          {rec.diversification && (
                            <div className="digest-sourcing-card__div">
                              <strong className="digest-sourcing-card__div-title">
                                Supply Diversification ({rec.diversification.category}):
                              </strong>{' '}
                              {rec.diversification.sourcingStrategy}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="digest-empty-note">No tracked materials available for sourcing analysis.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="digest-empty-note">No preview data available.</p>
          )}
        </Modal>
      )}

    </div>
  );
}

/* ================================================================
 * NEWS CARD
 * ================================================================ */
export function NewsCard({ item }) {
  const safeUrl = getSafeExternalUrl(item?.url);
  return (
    <article className="news-card">
      <h3 className="news-card__title">
        {safeUrl ? (
          <>
            <a href={safeUrl} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
            <i className="fa-solid fa-arrow-up-right-from-square news-card__link-icon" aria-hidden="true" />
          </>
        ) : (
          item?.title
        )}
      </h3>
      {item.summary && <p className="news-card__summary">{item.summary}</p>}
      <div className="news-card__meta">
        {item.sourceName && <span className="news-card__source">{item.sourceName}</span>}
        {item.publishedAt && (
          <time className="news-card__date" dateTime={item.publishedAt}>
            {formatDate(item.publishedAt)}
          </time>
        )}
      </div>
    </article>
  );
}
