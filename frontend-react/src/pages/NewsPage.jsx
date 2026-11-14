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
  const { business } = useAuth();
  const { showToast } = useToast();

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

  useEffect(() => { loadNews(1); }, [loadNews]);

  /* ── Load digest preview when modal opens ────────────────────── */
  useEffect(() => {
    if (!showDigestModal) return;
    setDigestLoading(true);
    getDigestPreview()
      .then((data) => setDigestPreview(data))
      .catch(() => {
        showToast({ type: 'error', message: 'Could not generate digest preview.' });
      })
      .finally(() => setDigestLoading(false));
  }, [showDigestModal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Send digest now ────────────────────────────────────────── */
  async function handleSendDigestNow() {
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
    <div className="page-container">

      {/* Header bar with industry label and digest modal trigger */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <p id="news-industry-label" className="news-industry-label" style={{ margin: 0 }}>
          {industryName
            ? `Showing news for: ${industryName}`
            : 'Showing news for your industry'}
        </p>

        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setShowDigestModal(true)}
          id="btn-open-digest-preview"
        >
          <i className="fa-solid fa-envelope-open-text mr-1" /> View Periodic Digest &amp; Sourcing Summary
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
            message="Industry news articles will appear here once your news feed is connected. This feature is pending activation in the current version."
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

      {/* Periodic Digest Preview Modal */}
      {showDigestModal && (
        <Modal
          isOpen={showDigestModal}
          onClose={() => setShowDigestModal(false)}
          title="Periodic News &amp; Sourcing Digest Preview"
          size="lg"
          id="digest-preview-modal"
          footer={
            <div className="modal__footer-actions" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#8b949e' }}>
                Cadence: <strong>{digestPreview?.frequency || 'WEEKLY'}</strong> • Channel: <strong>{digestPreview?.digestChannel || 'EMAIL'}</strong>
                {digestPreview?.lastDigestSentAt && (
                  <span> • Last sent: {formatDateTime(digestPreview.lastDigestSentAt)}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setShowDigestModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={`btn btn--primary${sendingDigest ? ' btn--loading' : ''}`}
                  onClick={handleSendDigestNow}
                  disabled={sendingDigest || digestLoading}
                  id="btn-send-digest-now"
                >
                  <i className="fa-solid fa-paper-plane mr-1" /> Send Digest Now
                </button>
              </div>
            </div>
          }
        >
          {digestLoading ? (
            <div style={{ padding: '24px 0' }}>
              <Skeleton type="card" rows={3} />
            </div>
          ) : digestPreview ? (
            <div>
              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #30363d', paddingBottom: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  className={`btn btn--sm ${digestTab === 'email' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDigestTab('email')}
                >
                  <i className="fa-solid fa-envelope mr-1" /> Email Preview
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${digestTab === 'whatsapp' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDigestTab('whatsapp')}
                >
                  <i className="fa-brands fa-whatsapp mr-1" /> WhatsApp Preview
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${digestTab === 'sourcing' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDigestTab('sourcing')}
                >
                  <i className="fa-solid fa-boxes-packing mr-1" /> Sourcing Guidance ({digestPreview.procurementActions?.length || 0})
                </button>
              </div>

              {/* Tab Content 1: Email View */}
              {digestTab === 'email' && (
                <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ borderBottom: '1px solid #21262d', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#f0f6fc' }}>
                      [{digestPreview.frequency || 'Weekly'} Digest] Market Intelligence for {digestPreview.businessName}
                    </div>
                    <div style={{ fontSize: '13px', color: '#8b949e', marginTop: '4px' }}>
                      Industry Focus: <span style={{ color: '#58a6ff' }}>{digestPreview.industryName}</span>
                    </div>
                  </div>

                  {/* 7-Day Movers Table */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                      📊 7-Day Price Movers
                    </div>
                    {digestPreview.topMovers && digestPreview.topMovers.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#161b22', borderRadius: '6px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ background: '#21262d', color: '#8b949e', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px' }}>Material</th>
                            <th style={{ padding: '8px 12px' }}>Latest Price</th>
                            <th style={{ padding: '8px 12px' }}>7D Change</th>
                            <th style={{ padding: '8px 12px' }}>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {digestPreview.topMovers.map((m) => {
                            const isUp = Number(m.changePercent) > 0;
                            const isDown = Number(m.changePercent) < 0;
                            const color = isUp ? '#f85149' : (isDown ? '#3fb950' : '#8b949e');
                            return (
                              <tr key={m.materialId} style={{ borderBottom: '1px solid #21262d' }}>
                                <td style={{ padding: '8px 12px', color: '#f0f6fc' }}>{m.materialName}</td>
                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#c9d1d9' }}>
                                  {m.currency || 'INR'} {Number(m.latestPrice || 0).toFixed(2)}{m.unit ? ` / ${m.unit}` : ''}
                                </td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color }}>
                                  {isUp ? '▲ +' : (isDown ? '▼ ' : '')}{Number(m.changePercent || 0).toFixed(2)}%
                                </td>
                                <td style={{ padding: '8px 12px', color: '#8b949e', fontSize: '12px' }}>{m.trend}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#8b949e', fontSize: '13px' }}>No major 7-day price fluctuations recorded.</p>
                    )}
                  </div>

                  {/* Sourcing Actions summary */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                      🎯 Sourcing &amp; Inventory Actions
                    </div>
                    {digestPreview.procurementActions && digestPreview.procurementActions.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {digestPreview.procurementActions.slice(0, 3).map((a) => (
                          <div key={a.materialId} style={{ background: '#161b22', borderLeft: `3px solid ${a.bufferStrategy?.badgeVariant === 'danger' ? '#f85149' : (a.bufferStrategy?.badgeVariant === 'warning' ? '#d29922' : '#58a6ff')}`, padding: '10px 14px', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ color: '#f0f6fc', fontSize: '13px' }}>{a.materialName}</strong>
                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#21262d', color: '#58a6ff', fontWeight: 600 }}>
                                {String(a.actionRecommendation || 'MONITOR_ONLY').replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '4px' }}>
                              {a.rationale || a.bufferStrategy?.summary}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#8b949e', fontSize: '13px' }}>All materials within standard inventory buffer parameters.</p>
                    )}
                  </div>

                  {/* Top News */}
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#e6edf3', marginBottom: '8px' }}>
                      🗞️ Curated Industry Articles
                    </div>
                    {digestPreview.topNews && digestPreview.topNews.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {digestPreview.topNews.map((n) => (
                          <div key={n.id} style={{ fontSize: '13px' }}>
                            <a href={n.url || '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#58a6ff', textDecoration: 'none', fontWeight: 500 }}>
                              {n.title}
                            </a>
                            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                              {n.sourceName} • {formatDate(n.publishedAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#8b949e', fontSize: '13px' }}>No articles published in the current cycle.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab Content 2: WhatsApp View */}
              {digestTab === 'whatsapp' && (
                <div style={{ background: '#0b141a', border: '1px solid #2a3942', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ background: '#005c4b', color: '#e9edef', borderRadius: '8px', padding: '14px 16px', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
{`📰 *Business Market Monitor — ${digestPreview.frequency || 'Weekly'} Digest*
🏢 *${digestPreview.businessName}* (${digestPreview.industryName})

📊 *7-Day Price Movers:*
${(digestPreview.topMovers && digestPreview.topMovers.length > 0)
  ? digestPreview.topMovers.slice(0, 5).map(m => `• *${m.materialName}*: ${m.currency || 'INR'} ${Number(m.latestPrice || 0).toFixed(2)}${m.unit ? `/${m.unit}` : ''} (${Number(m.changePercent) > 0 ? '+' : ''}${Number(m.changePercent || 0).toFixed(1)}%) [${m.trend}]`).join('\n')
  : '• All tracked materials stable.'}

🎯 *Sourcing Actions:*
${(digestPreview.procurementActions && digestPreview.procurementActions.length > 0)
  ? digestPreview.procurementActions.slice(0, 3).map(a => `• *${a.materialName}*: ${String(a.actionRecommendation || 'MONITOR_ONLY').replace(/_/g, ' ')} — ${a.rationale || a.bufferStrategy?.summary || 'Standard replenishment buffer.'}`).join('\n')
  : '• Standard replenishment buffers maintained.'}

🗞️ *Industry Headlines:*
${(digestPreview.topNews && digestPreview.topNews.length > 0)
  ? digestPreview.topNews.slice(0, 3).map(n => `• *${n.title}* (${n.sourceName})`).join('\n')
  : '• No fresh articles.'}

_Open BMM dashboard for live trends, graphs & supplier benchmarks._`}
                  </div>
                </div>
              )}

              {/* Tab Content 3: Sourcing Guidance */}
              {digestTab === 'sourcing' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {digestPreview.procurementActions && digestPreview.procurementActions.length > 0 ? (
                    digestPreview.procurementActions.map((rec) => (
                      <div key={rec.materialId} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 600, color: '#f0f6fc' }}>
                            {rec.materialName}
                          </span>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: rec.actionRecommendation === 'ACCELERATE_PURCHASE' ? '#f8514920' : (rec.actionRecommendation === 'DELAY_PURCHASE' ? '#d2992220' : '#58a6ff20'),
                            color: rec.actionRecommendation === 'ACCELERATE_PURCHASE' ? '#f85149' : (rec.actionRecommendation === 'DELAY_PURCHASE' ? '#d29922' : '#58a6ff'),
                          }}>
                            {String(rec.actionRecommendation || 'MONITOR_ONLY').replace(/_/g, ' ')}
                          </span>
                        </div>

                        <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#c9d1d9' }}>
                          {rec.rationale || rec.bufferStrategy?.detailedGuidance}
                        </p>

                        {/* Benchmark & Quote comparison */}
                        {rec.quoteComparison && (
                          <div style={{ background: '#0d1117', padding: '10px 12px', borderRadius: '4px', fontSize: '12px', color: '#8b949e', marginBottom: '10px' }}>
                            {rec.quoteComparison.variancePercent !== null ? (
                              <span>
                                Supplier quote vs market benchmark variance:{' '}
                                <strong style={{ color: rec.quoteComparison.variancePercent > 0 ? '#f85149' : '#3fb950' }}>
                                  {rec.quoteComparison.variancePercent > 0 ? '+' : ''}{rec.quoteComparison.variancePercent}%
                                </strong>
                              </span>
                            ) : rec.quoteComparison.crossCurrencyNote ? (
                              <span style={{ color: '#d29922' }}>
                                <i className="fa-solid fa-circle-info mr-1" /> {rec.quoteComparison.crossCurrencyNote}
                              </span>
                            ) : (
                              <span>Single price data stream available.</span>
                            )}
                          </div>
                        )}

                        {/* Diversification advice */}
                        {rec.diversification && (
                          <div style={{ fontSize: '12px', color: '#8b949e' }}>
                            <strong style={{ color: '#f0f6fc' }}>Supply Diversification ({rec.diversification.category}):</strong>{' '}
                            {rec.diversification.sourcingStrategy}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: '#8b949e', fontSize: '13px' }}>No tracked materials available for sourcing analysis.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: '#8b949e' }}>No preview data available.</p>
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
