import { Link } from 'react-router-dom';
import { Skeleton } from './Skeleton.jsx';
import { ErrorState } from './ErrorState.jsx';
import { InsightCard } from './InsightCard.jsx';
import { formatDateTime } from '../../utils/format.js';
import {
  STRUCTURAL_KB_DISCLOSURE,
  OBSERVED_EVIDENCE_DISCLOSURE,
  getCoverageMetadata,
  getEntityTypeMetadata,
  getDependencyTypeMetadata,
  getPriceDirectionMetadata,
  formatPercentChange,
  formatAgeDays,
  formatStaleStatus,
  formatImpactError,
} from '../../utils/impactAnalysis.js';
import './MaterialImpactPanel.css';

const DEPTH_OPTIONS = [1, 2, 3, 4];

function impactBadgeClass(badgeClass) {
  const suffix = typeof badgeClass === 'string' && badgeClass.startsWith('badge--')
    ? badgeClass.slice('badge--'.length)
    : 'neutral';
  return `impact-badge impact-badge--${suffix}`;
}

function formatTraversalDirection(direction) {
  if (direction === 'source_to_target') {
    return 'Source → Target (Downstream path)';
  }
  return direction || '—';
}

/**
 * Pure presentation panel for Material Impact-Chain Analysis.
 * Keeps structural knowledge-base pathways, observed empirical evidence,
 * and the latest stored AI insight visually and semantically separated.
 */
export function MaterialImpactPanel({
  materialId,
  data = null,
  maxDepth = 3,
  loading = false,
  isRefreshing = false,
  error = null,
  onDepthChange,
  onRefresh,
}) {
  const material = data?.material ?? null;
  const kbImpact = data?.kb_impact ?? null;
  const empirical = data?.empirical_evidence ?? null;
  const assessment = empirical?.signal_assessment ?? null;
  const relevantNews = Array.isArray(empirical?.relevant_news) ? empirical.relevant_news : [];
  const latestInsight = data?.latest_ai_insight ?? null;
  const errorInfo = error ? formatImpactError(error) : null;

  const coverageMeta = kbImpact ? getCoverageMetadata(kbImpact.coverage) : null;
  const summary = kbImpact?.summary ?? {};
  const chains = Array.isArray(kbImpact?.chains) ? kbImpact.chains : [];
  const costDrivers = Array.isArray(kbImpact?.cost_drivers) ? kbImpact.cost_drivers : [];
  const externalFactors = Array.isArray(kbImpact?.external_factors) ? kbImpact.external_factors : [];
  const relatedMaterials = Array.isArray(kbImpact?.related_materials) ? kbImpact.related_materials : [];
  const warnings = Array.isArray(assessment?.warnings) ? assessment.warnings : [];

  const directionMeta = assessment ? getPriceDirectionMetadata(assessment.price_direction) : null;
  const staleMeta = assessment ? formatStaleStatus(assessment) : null;
  const targetMaterialId = material?.id ?? materialId;

  return (
    <div className="impact-panel">
      <header className="impact-header">
        <div className="impact-header__identity">
          <div className="impact-header__back-row">
            <Link to="/materials" className="btn btn--sm btn--ghost">
              ← Back to Materials
            </Link>
            {material?.is_custom ? (
              <span className="impact-badge impact-badge--warning">Custom Material</span>
            ) : material ? (
              <span className="impact-badge impact-badge--info">Standard Material</span>
            ) : null}
            {material?.is_tracked && (
              <span className="impact-badge impact-badge--success">Tracked</span>
            )}
            {data && (
              <span className="impact-badge impact-badge--neutral">
                {data.industry_id != null ? `Industry #${data.industry_id}` : 'No industry linked'}
              </span>
            )}
          </div>
          <div className="impact-header__title-row">
            <h1 className="impact-header__title">
              {material?.name ? `${material.name} — Impact Chains` : `Material #${materialId ?? ''} — Impact Chains`}
            </h1>
            {material?.unit_abbreviation && (
              <span className="impact-badge impact-badge--neutral">
                Unit: {material.unit_abbreviation}
              </span>
            )}
          </div>
        </div>

        <div className="impact-header__controls">
          <div className="impact-depth-control">
            <span className="impact-depth-control__label">Traversal Depth</span>
            <div className="impact-depth-control__group" role="group" aria-label="Impact traversal depth">
              {DEPTH_OPTIONS.map((depth) => {
                const active = depth === maxDepth;
                return (
                  <button
                    key={depth}
                    type="button"
                    className={`impact-depth-btn${active ? ' impact-depth-btn--active' : ''}`}
                    aria-pressed={active}
                    onClick={() => onDepthChange?.(depth)}
                  >
                    {depth}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={() => onRefresh?.()}
            disabled={loading || isRefreshing}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {loading && !data && (
        <Skeleton type="panel" rows={4} />
      )}

      {!loading && errorInfo && !data && (
        <ErrorState
          title={errorInfo.title}
          message={errorInfo.message}
          retry={errorInfo.retryable && onRefresh ? onRefresh : undefined}
        />
      )}

      {errorInfo && data && (
        <div className="impact-banner impact-banner--error" role="alert">
          <span>{errorInfo.message}</span>
          {errorInfo.retryable && onRefresh && (
            <button type="button" className="btn btn--sm btn--secondary" onClick={onRefresh}>
              Retry
            </button>
          )}
        </div>
      )}

      {data && (
        <>
          {/* Section A: Structural Knowledge-Base Impact */}
          <section className="impact-section impact-section--structural" aria-labelledby="impact-kb-heading">
            <div className="impact-section__header">
              <h2 id="impact-kb-heading" className="impact-section__title">
                Structural Knowledge-Base Relationships
              </h2>
              <span className="impact-badge impact-badge--warning">
                Structural KB Only ({kbImpact?.evidence_classification || 'structural_only'})
              </span>
            </div>

            <div className="impact-banner impact-banner--structural" role="note">
              {STRUCTURAL_KB_DISCLOSURE}
            </div>

            {kbImpact?.warning && (
              <div className="impact-banner impact-banner--structural" role="status">
                {kbImpact.warning}
              </div>
            )}

            <div className="impact-meta-row">
              {coverageMeta && (
                <span className={`impact-badge impact-badge--${coverageMeta.tone}`}>
                  Coverage: {coverageMeta.label}
                </span>
              )}
              <span className="impact-badge impact-badge--neutral">
                Direction: {formatTraversalDirection(kbImpact?.traversal_direction)}
              </span>
              <span className="impact-badge impact-badge--neutral">
                Max Depth Applied: {kbImpact?.max_depth_applied ?? maxDepth}
              </span>
            </div>

            {coverageMeta?.description && (
              <p className="impact-step__desc">{coverageMeta.description}</p>
            )}

            <div className="impact-kpi-grid">
              <div className="impact-kpi">
                <span className="impact-kpi__label">Total Chains</span>
                <span className="impact-kpi__value">{summary.total_chains ?? 0}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Max Observed Depth</span>
                <span className="impact-kpi__value">{summary.max_observed_depth ?? 0}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Direct Links (Hop 1)</span>
                <span className="impact-kpi__value">{summary.direct_count ?? 0}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Indirect Links (Hop 2+)</span>
                <span className="impact-kpi__value">{summary.indirect_count ?? 0}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Cost Drivers</span>
                <span className="impact-kpi__value">{summary.cost_drivers_count ?? costDrivers.length}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">External Factors</span>
                <span className="impact-kpi__value">{summary.external_factors_count ?? externalFactors.length}</span>
              </div>
            </div>

            {(costDrivers.length > 0 || externalFactors.length > 0 || relatedMaterials.length > 0) && (
              <div className="impact-entity-groups">
                {costDrivers.length > 0 && (
                  <div className="impact-entity-group">
                    <h3 className="impact-entity-group__title">Cost Drivers</h3>
                    <div className="impact-chip-list">
                      {costDrivers.map((item) => (
                        <span key={item} className="impact-chip">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {externalFactors.length > 0 && (
                  <div className="impact-entity-group">
                    <h3 className="impact-entity-group__title">External Factors</h3>
                    <div className="impact-chip-list">
                      {externalFactors.map((item) => (
                        <span key={item} className="impact-chip">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
                {relatedMaterials.length > 0 && (
                  <div className="impact-entity-group">
                    <h3 className="impact-entity-group__title">Related Materials</h3>
                    <div className="impact-chip-list">
                      {relatedMaterials.map((item) => (
                        <span key={item} className="impact-chip">{item}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {chains.length > 0 ? (
              <div className="impact-chains-list">
                {chains.map((chain) => {
                  const steps = Array.isArray(chain.steps) ? chain.steps : [];
                  const terminalMeta = getEntityTypeMetadata(chain.terminal_entity?.entity_type);
                  return (
                    <article key={chain.chain_id} className="impact-chain-card">
                      <div className="impact-chain-card__header">
                        <span className="impact-chain-card__path">{chain.path_label}</span>
                        <div className="impact-chain-card__badges">
                          <span className="impact-badge impact-badge--info">Depth {chain.depth}</span>
                          {chain.terminal_entity?.name && (
                            <span className={impactBadgeClass(terminalMeta.badgeClass)}>
                              {terminalMeta.label}: {chain.terminal_entity.name}
                            </span>
                          )}
                          <span className="impact-badge impact-badge--warning">Structural link</span>
                        </div>
                      </div>

                      <div className="impact-steps">
                        {steps.map((step) => {
                          const srcMeta = getEntityTypeMetadata(step.source_entity_type);
                          const tgtMeta = getEntityTypeMetadata(step.target_entity_type);
                          const depLabel = getDependencyTypeMetadata(step.dependency_type);
                          return (
                            <div
                              key={`${chain.chain_id}-hop-${step.hop}-${step.dependency_id}`}
                              className="impact-step"
                            >
                              <div className="impact-step__top">
                                <span>Hop {step.hop} · {depLabel}</span>
                                <span className="impact-badge impact-badge--warning">
                                  {step.evidence_nature || 'structural_only'}
                                </span>
                              </div>

                              <div className="impact-step__nodes">
                                <span>{step.source_name}</span>
                                <span className="impact-step__arrow" aria-hidden="true">→</span>
                                <span>{step.target_name}</span>
                              </div>

                              <div className="impact-meta-row">
                                <span className={impactBadgeClass(srcMeta.badgeClass)}>{srcMeta.label}</span>
                                <span className={impactBadgeClass(tgtMeta.badgeClass)}>{tgtMeta.label}</span>
                              </div>

                              {step.description && (
                                <p className="impact-step__desc">{step.description}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="impact-banner" role="status">
                No structural knowledge-base pathways were found at depth {kbImpact?.max_depth_applied ?? maxDepth}.
                {kbImpact?.coverage === 'custom_material_no_kb_links'
                  ? ' Custom materials rely on your recorded price telemetry and observed news below.'
                  : ''}
              </div>
            )}
          </section>

          {/* Section B: Observed Empirical Evidence */}
          <section className="impact-section impact-section--observed" aria-labelledby="impact-empirical-heading">
            <div className="impact-section__header">
              <h2 id="impact-empirical-heading" className="impact-section__title">
                Observed Empirical Evidence
              </h2>
              <span className="impact-badge impact-badge--info">
                Observed Data Only ({empirical?.evidence_classification || 'observed_data_only'})
              </span>
            </div>

            <div className="impact-banner impact-banner--observed" role="note">
              {OBSERVED_EVIDENCE_DISCLOSURE}
            </div>

            <div className="impact-kpi-grid">
              <div className="impact-kpi">
                <span className="impact-kpi__label">Recorded Price Points</span>
                <span className="impact-kpi__value">{assessment?.valid_price_count ?? 0}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Minimum Price Evidence</span>
                <span className="impact-kpi__value">
                  {assessment?.has_minimum_price_evidence ? 'Sufficient' : 'Insufficient'}
                </span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Observed Price Direction</span>
                <span className="impact-kpi__value">
                  {directionMeta ? `${directionMeta.symbol} ${directionMeta.label}` : 'Unknown'}
                </span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Observed Price Change</span>
                <span className="impact-kpi__value">
                  {formatPercentChange(assessment?.percent_change)}
                </span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Latest Recorded Price</span>
                <span className="impact-kpi__value">
                  {assessment?.latest_recorded_at
                    ? formatDateTime(assessment.latest_recorded_at)
                    : 'No price recorded'}
                </span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Price Freshness</span>
                <span className="impact-kpi__value">
                  {staleMeta ? staleMeta.label : 'No price history'}
                  {assessment?.latest_recorded_at
                    ? ` (${formatAgeDays(assessment.days_since_latest_price)})`
                    : ''}
                </span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Observed News Count</span>
                <span className="impact-kpi__value">{assessment?.news_count ?? relevantNews.length}</span>
              </div>
              <div className="impact-kpi">
                <span className="impact-kpi__label">Contradictory Signals</span>
                <span className="impact-kpi__value">
                  {assessment?.has_contradictory_signals ? 'Detected' : 'None detected'}
                </span>
              </div>
            </div>

            {warnings.length > 0 && (
              <ul className="impact-warnings-list" aria-label="Observed evidence warnings">
                {warnings.map((warning, idx) => (
                  <li key={`${idx}-${warning}`}>{warning}</li>
                ))}
              </ul>
            )}

            <div>
              <h3 className="impact-entity-group__title" style={{ marginBottom: 'var(--space-2)' }}>
                Observed Relevant News Articles ({relevantNews.length})
              </h3>
              {relevantNews.length > 0 ? (
                <div className="impact-news-list">
                  {relevantNews.map((article) => (
                    <article key={article.id} className="impact-news-item">
                      <span className="impact-news-item__title">{article.title}</span>
                      <div className="impact-news-item__meta">
                        <span>Source: {article.source_name || 'Unknown source'}</span>
                        <span>Published: {article.published_at ? formatDateTime(article.published_at) : '—'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="impact-banner" role="status">
                  No observed news articles matched this material yet.
                </div>
              )}
            </div>

            <div className="impact-section__actions">
              {targetMaterialId && (
                <>
                  <Link to={`/prices?materialId=${targetMaterialId}`} className="btn btn--sm btn--secondary">
                    Log or View Prices
                  </Link>
                  <Link to={`/trends?materialId=${targetMaterialId}`} className="btn btn--sm btn--ghost">
                    Open Price Trends
                  </Link>
                </>
              )}
              <Link to="/news" className="btn btn--sm btn--ghost">
                Open News Feed
              </Link>
            </div>
          </section>

          {/* Section C: Latest Stored AI Insight */}
          <section className="impact-section" aria-labelledby="impact-ai-heading">
            <div className="impact-section__header">
              <h2 id="impact-ai-heading" className="impact-section__title">
                Latest Stored AI Insight
              </h2>
              <span className="impact-badge impact-badge--neutral">Read-Only Stored Summary</span>
            </div>

            <InsightCard
              insight={latestInsight}
              loading={false}
              error={null}
              title={`Latest AI Insight — ${material?.name ?? 'Material'}`}
            />
          </section>
        </>
      )}
    </div>
  );
}
