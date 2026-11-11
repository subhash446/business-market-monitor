/**
 * InsightCard — reusable AI market intelligence display card
 * Business Market Monitor — React frontend  (Phase H Step 6B)
 *
 * Props:
 *   insight    {object|null}  — InsightRow from aiInsights.api.js; null = no insight yet
 *   loading    {boolean}      — show skeleton state
 *   error      {string|null}  — show error message if present
 *   title      {string}       — optional override for the card heading (default: "AI Market Insight")
 *   compact    {boolean}      — shorter layout for dashboard panel (hides evidence row)
 *
 * Display contract:
 *   - loading:  skeleton placeholder lines
 *   - error:    inline error message (not a full-page ErrorState)
 *   - null insight after load: "No insight available yet" empty state
 *   - insight present: full card with all fields
 *
 * Outlook colours  (match DB enum: BULLISH / BEARISH / NEUTRAL / VOLATILE)
 *   BULLISH  → green  (--color-success)
 *   BEARISH  → red    (--color-danger)
 *   NEUTRAL  → blue   (--color-primary)
 *   VOLATILE → amber  (--color-warning)
 *
 * Confidence colours
 *   HIGH   → green
 *   MEDIUM → amber
 *   LOW    → secondary text
 *
 * SECURITY: model_used is displayed for auditability.
 * No provider API keys are ever present in this component.
 * AI generation is never triggered from here.
 */

import { useState } from 'react';
import { formatRelativeTime, formatDate, formatPrice, getSafeExternalUrl } from '../../utils/format.js';
import { classifyInsightBenchmarkDisclosure } from '../../utils/insightDisclosure.js';
import { getInsightEvidence } from '../../api/aiInsights.api.js';
import './InsightCard.css';

/* ── Outlook / confidence display maps ───────────────────────────── */

const OUTLOOK_CONFIG = {
  BULLISH:  { label: 'Bullish',  icon: 'fa-solid fa-arrow-trend-up',   cls: 'insight-badge--bullish'  },
  BEARISH:  { label: 'Bearish',  icon: 'fa-solid fa-arrow-trend-down',  cls: 'insight-badge--bearish'  },
  NEUTRAL:  { label: 'Neutral',  icon: 'fa-solid fa-minus',             cls: 'insight-badge--neutral'  },
  VOLATILE: { label: 'Volatile', icon: 'fa-solid fa-bolt',              cls: 'insight-badge--volatile' },
};

const CONFIDENCE_CONFIG = {
  HIGH:   { label: 'High',   cls: 'insight-confidence--high'   },
  MEDIUM: { label: 'Medium', cls: 'insight-confidence--medium' },
  LOW:    { label: 'Low',    cls: 'insight-confidence--low'    },
};

/* ── Component ────────────────────────────────────────────────────── */

export function InsightCard({
  insight,
  loading  = false,
  error    = null,
  title    = 'AI Market Insight',
  compact  = false,
  defaultShowEvidence = false,
}) {
  const [showEvidence, setShowEvidence] = useState(Boolean(defaultShowEvidence));
  const [evidenceData, setEvidenceData] = useState(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState(null);

  const outlook    = insight ? (OUTLOOK_CONFIG[insight.outlook]    ?? OUTLOOK_CONFIG.NEUTRAL)    : null;
  const confidence = insight ? (CONFIDENCE_CONFIG[insight.confidence] ?? CONFIDENCE_CONFIG.LOW) : null;

  const isInsufficientEvidence = Boolean(
    insight && (insight.status === 'insufficient_evidence' || insight.reason === 'insufficient_evidence')
  );

  const handleToggleEvidence = async () => {
    const nextState = !showEvidence;
    setShowEvidence(nextState);

    // If opening and we don't have embedded evidence or already-fetched evidenceData, fetch it
    if (nextState && insight?.id && !evidenceData && (!insight.evidence_prices && !insight.evidence_news)) {
      setLoadingEvidence(true);
      setEvidenceError(null);
      try {
        const data = await getInsightEvidence(insight.id);
        setEvidenceData(data);
      } catch (err) {
        setEvidenceError(err.message || 'Could not load evidence records');
      } finally {
        setLoadingEvidence(false);
      }
    }
  };

  const pricesList = insight?.evidence_prices || evidenceData?.prices || [];
  const newsList = insight?.evidence_news || evidenceData?.news || [];
  const disclosureType = classifyInsightBenchmarkDisclosure(insight, pricesList);

  return (
    <section className={`insight-card card${compact ? ' insight-card--compact' : ''}`} aria-label={title}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="card__header insight-card__header">
        <div className="insight-card__title-row">
          <i className="fa-solid fa-robot insight-card__ai-icon" aria-hidden="true" />
          <h3 className="card__title insight-card__title">{title}</h3>
          <span className="insight-card__badge-ai" aria-label="AI-generated content">AI</span>
        </div>
        {insight && !isInsufficientEvidence && outlook && (
          <div className="insight-card__outlook-row">
            <span className={`insight-badge ${outlook.cls}`} aria-label={`Outlook: ${outlook.label}`}>
              <i className={`${outlook.icon} insight-badge__icon`} aria-hidden="true" />
              {outlook.label}
            </span>
            {confidence && (
              <span className={`insight-confidence ${confidence.cls}`}>
                {confidence.label} confidence
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="card__body insight-card__body">

        {/* Loading state */}
        {loading && (
          <div className="insight-card__skeleton" aria-busy="true" aria-label="Loading AI insight">
            <div className="insight-skeleton__line insight-skeleton__line--title" />
            <div className="insight-skeleton__line" />
            <div className="insight-skeleton__line" />
            <div className="insight-skeleton__line insight-skeleton__line--short" />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <p className="insight-card__error">
            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
            {' '}{error}
          </p>
        )}

        {/* Insufficient Evidence State */}
        {!loading && !error && isInsufficientEvidence && (
          <div className="insight-card__empty insight-card__insufficient">
            <i className="fa-solid fa-triangle-exclamation insight-card__empty-icon" aria-hidden="true" />
            <p className="insight-card__empty-title">Insufficient Price Evidence</p>
            <p className="insight-card__empty-message">
              {insight.message || 'AI market intelligence requires at least 3 verified price observations to ensure factual analysis without speculation. Insights will be generated automatically once sufficient price records exist.'}
            </p>
          </div>
        )}

        {/* Empty state — no insight generated yet */}
        {!loading && !error && !insight && (
          <div className="insight-card__empty">
            <i className="fa-solid fa-robot insight-card__empty-icon" aria-hidden="true" />
            <p className="insight-card__empty-title">No insight available yet</p>
            <p className="insight-card__empty-message">
              AI market insights are generated automatically once at least 3 valid price observations
              and industry news are available. Check back after price records are logged.
            </p>
          </div>
        )}

        {/* Insight content */}
        {!loading && !error && insight && !isInsufficientEvidence && (
          <>
            {/* Upstream Proxy Benchmark Warning */}
            {disclosureType === 'CRUDE_PROXY' && (
              <div className="insight-proxy-notice" role="note">
                <i className="fa-solid fa-circle-info insight-proxy-notice__icon" aria-hidden="true" />
                <div className="insight-proxy-notice__content">
                  <strong>Upstream Benchmark Disclosure:</strong> This insight is derived from global commodity proxy pricing
                  (USD/bbl), not direct local purchase transactions. Business cost impacts reflect directional cost pressures.
                </div>
              </div>
            )}

            {/* Domestic Indian Wholesale Mandi Disclosure */}
            {disclosureType === 'DOMESTIC_MANDI' && (
              <div className="insight-proxy-notice insight-proxy-notice--domestic" role="note">
                <i className="fa-solid fa-building-columns insight-proxy-notice__icon" aria-hidden="true" />
                <div className="insight-proxy-notice__content">
                  <strong>Domestic Mandi Benchmark Disclosure:</strong> This insight uses official Indian wholesale mandi pricing
                  (INR/quintal via Agmarknet / data.gov.in), reflecting bulk wholesale auctions rather than direct contract rates.
                </div>
              </div>
            )}

            {/* Headline */}
            <p className="insight-card__headline">{insight.headline}</p>

            {/* Detail rows */}
            <dl className="insight-card__details">
              <div className="insight-detail">
                <dt className="insight-detail__label">
                  <i className="fa-solid fa-chart-simple" aria-hidden="true" /> What happened
                </dt>
                <dd className="insight-detail__value">{insight.what_happened}</dd>
              </div>

              <div className="insight-detail">
                <dt className="insight-detail__label">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" /> Why it happened
                </dt>
                <dd className="insight-detail__value">{insight.why_it_happened}</dd>
              </div>

              <div className="insight-detail">
                <dt className="insight-detail__label">
                  <i className="fa-solid fa-building" aria-hidden="true" /> Business impact
                </dt>
                <dd className="insight-detail__value">{insight.business_impact}</dd>
              </div>
            </dl>

            {/* Evidence summary & drilldown — hidden in compact mode */}
            {!compact && (
              <div className="insight-evidence-container">
                <div className="insight-card__evidence">
                  <div className="insight-evidence__summary">
                    <span className="insight-evidence__label">Evidence basis:</span>
                    <span className="insight-evidence__item">
                      <i className="fa-solid fa-chart-line" aria-hidden="true" />
                      {insight.evidence_price_points_count} price point{insight.evidence_price_points_count !== 1 ? 's' : ''}
                      {insight.evidence_price_range ? ` (${insight.evidence_price_range})` : ''}
                    </span>
                    {insight.evidence_news_count > 0 && (
                      <span className="insight-evidence__item">
                        <i className="fa-solid fa-newspaper" aria-hidden="true" />
                        {insight.evidence_news_count} news article{insight.evidence_news_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="insight-evidence__toggle-btn"
                    onClick={handleToggleEvidence}
                    aria-expanded={showEvidence}
                  >
                    <span>{showEvidence ? 'Hide Source Evidence' : 'View Source Evidence'}</span>
                    <i className={`fa-solid ${showEvidence ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" />
                  </button>
                </div>

                {/* Expanded Evidence Drawer */}
                {showEvidence && (
                  <div className="insight-evidence-drawer">
                    {loadingEvidence && (
                      <div className="insight-evidence__loading">
                        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                        <span>Loading evidence records...</span>
                      </div>
                    )}

                    {evidenceError && (
                      <p className="insight-evidence__error">
                        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" /> {evidenceError}
                      </p>
                    )}

                    {/* Price Points Evidence */}
                    <div className="insight-evidence__section">
                      <h4 className="insight-evidence__section-title">
                        <i className="fa-solid fa-chart-line" aria-hidden="true" />
                        Supporting Price Observations ({pricesList.length || insight.evidence_price_points_count})
                      </h4>
                      {pricesList.length > 0 ? (
                        <div className="insight-evidence__table-wrapper">
                          <table className="insight-evidence__table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Price</th>
                                <th>Classification</th>
                                <th>Provider / Source</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pricesList.map((pt, idx) => (
                                <tr key={pt.id || idx}>
                                  <td>{formatDate(pt.recorded_at)}</td>
                                  <td className="font-mono">
                                    {pt.currency ? `${pt.currency} ` : ''}
                                    {formatPrice(pt.price)}
                                    {pt.unit_label ? ` ${pt.unit_label}` : ''}
                                  </td>
                                  <td>
                                    <span className={`evidence-class-badge evidence-class-badge--${(pt.data_class || 'quote').toLowerCase()}`}>
                                      {pt.data_class === 'OFFICIAL_BENCHMARK'
                                        ? 'Official Benchmark'
                                        : pt.data_class === 'MARKET_INDICATIVE'
                                        ? 'Proxy Benchmark'
                                        : 'Supplier Quote'}
                                    </span>
                                  </td>
                                  <td>
                                    {(() => {
                                      const safeSourceUrl = getSafeExternalUrl(pt.source_url);
                                      if (safeSourceUrl) {
                                        return (
                                          <a
                                            href={safeSourceUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="insight-evidence__link"
                                          >
                                            {pt.provider_name || pt.source || 'Source'}
                                            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                                          </a>
                                        );
                                      }
                                      return <span>{pt.provider_name || pt.source || '—'}</span>;
                                    })()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="insight-evidence__empty-text">
                          Price range: {insight.evidence_price_range || 'N/A'} across {insight.evidence_price_points_count} points.
                        </p>
                      )}
                    </div>

                    {/* News Articles Evidence */}
                    <div className="insight-evidence__section">
                      <h4 className="insight-evidence__section-title">
                        <i className="fa-solid fa-newspaper" aria-hidden="true" />
                        Linked Industry News ({newsList.length || insight.evidence_news_count})
                      </h4>
                      {newsList.length > 0 ? (
                        <ul className="insight-evidence__news-list">
                          {newsList.map((art, idx) => (
                            <li key={art.id || idx} className="insight-evidence__news-item">
                              <div className="insight-evidence__news-main">
                                {(() => {
                                  const safeArticleUrl = getSafeExternalUrl(art.url);
                                  if (safeArticleUrl) {
                                    return (
                                      <a
                                        href={safeArticleUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="insight-evidence__article-title"
                                      >
                                        {art.title}
                                        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                                      </a>
                                    );
                                  }
                                  return <span className="insight-evidence__article-title">{art.title}</span>;
                                })()}
                                <div className="insight-evidence__news-meta">
                                  {art.source_name && (
                                    <span className="insight-evidence__source">{art.source_name}</span>
                                  )}
                                  {art.published_at && (
                                    <span className="insight-evidence__date">{formatDate(art.published_at)}</span>
                                  )}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="insight-evidence__empty-text">
                          {insight.evidence_news_count > 0
                            ? `${insight.evidence_news_count} news article headlines informed this insight.`
                            : 'No external news articles were linked for this insight run.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer — timestamp + model attribution */}
            <div className="insight-card__footer">
              <span className="insight-card__generated-at" title={insight.generated_at}>
                Generated {formatRelativeTime(insight.generated_at)}
              </span>
              <span className="insight-card__model">
                via {insight.model_used}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
