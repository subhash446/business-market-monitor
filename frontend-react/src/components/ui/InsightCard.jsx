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

import { formatRelativeTime } from '../../utils/format.js';
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
}) {
  const outlook    = insight ? (OUTLOOK_CONFIG[insight.outlook]    ?? OUTLOOK_CONFIG.NEUTRAL)    : null;
  const confidence = insight ? (CONFIDENCE_CONFIG[insight.confidence] ?? CONFIDENCE_CONFIG.LOW) : null;

  return (
    <section className={`insight-card card${compact ? ' insight-card--compact' : ''}`} aria-label={title}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="card__header insight-card__header">
        <div className="insight-card__title-row">
          <i className="fa-solid fa-robot insight-card__ai-icon" aria-hidden="true" />
          <h3 className="card__title insight-card__title">{title}</h3>
          <span className="insight-card__badge-ai" aria-label="AI-generated content">AI</span>
        </div>
        {insight && outlook && (
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

        {/* Empty state — no insight generated yet */}
        {!loading && !error && !insight && (
          <div className="insight-card__empty">
            <i className="fa-solid fa-robot insight-card__empty-icon" aria-hidden="true" />
            <p className="insight-card__empty-title">No insight available yet</p>
            <p className="insight-card__empty-message">
              AI market insights are generated automatically each morning once enough price
              data is available. Check back after the next scheduled run.
            </p>
          </div>
        )}

        {/* Insight content */}
        {!loading && !error && insight && (
          <>
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

            {/* Evidence row — hidden in compact mode */}
            {!compact && (
              <div className="insight-card__evidence">
                <span className="insight-evidence__label">Evidence basis:</span>
                <span className="insight-evidence__item">
                  <i className="fa-solid fa-chart-line" aria-hidden="true" />
                  {insight.evidence_price_points_count} price point{insight.evidence_price_points_count !== 1 ? 's' : ''}
                  {insight.evidence_price_range ? ` (${insight.evidence_price_range})` : ''}
                </span>
                {insight.evidence_news_count > 0 && (
                  <span className="insight-evidence__item">
                    <i className="fa-solid fa-newspaper" aria-hidden="true" />
                    {insight.evidence_news_count} news headline{insight.evidence_news_count !== 1 ? 's' : ''}
                  </span>
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
