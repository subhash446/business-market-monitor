import { useCallback, useState } from 'react';
import { HERO_SERIES, SAMPLE_DATA_TAG } from '../../data/landingSample.js';
import { DeltaBadge } from './DeltaBadge.jsx';
import { PriceChart } from './PriceChart.jsx';
import { SignalPill } from './SignalPill.jsx';

const SERIES_KEYS = ['pet', 'brent', 'wheat'];

/**
 * HeroWidget — Interactive tabbed commodity telemetry monitor
 *
 * - role="tablist" with ArrowLeft / ArrowRight / Home / End keyboard navigation
 * - Wires PriceChart onScrub callback for live day-by-day price inspection
 * - Exact backend ACTION_RECOMMENDATION enums & "Sample data · illustrative" tag
 */
export function HeroWidget() {
  const [activeKey, setActiveKey] = useState('pet');
  const [scrubPoint, setScrubPoint] = useState(null);
  const activeSeries = HERO_SERIES[activeKey] ?? HERO_SERIES.pet;

  const handleSelectKey = useCallback((nextKey) => {
    setActiveKey(nextKey);
    setScrubPoint(null);
  }, []);

  const handleScrub = useCallback((idx, val) => {
    if (idx === null || val === null || !Number.isFinite(val)) {
      setScrubPoint(null);
    } else {
      setScrubPoint({ idx, val });
    }
  }, []);

  const handleKeyDown = useCallback(
    (e, currentIdx) => {
      let targetIdx = -1;
      if (e.key === 'ArrowRight') {
        targetIdx = (currentIdx + 1) % SERIES_KEYS.length;
      } else if (e.key === 'ArrowLeft') {
        targetIdx = (currentIdx - 1 + SERIES_KEYS.length) % SERIES_KEYS.length;
      } else if (e.key === 'Home') {
        targetIdx = 0;
      } else if (e.key === 'End') {
        targetIdx = SERIES_KEYS.length - 1;
      }

      if (targetIdx !== -1) {
        e.preventDefault();
        const nextKey = SERIES_KEYS[targetIdx];
        handleSelectKey(nextKey);
        const nextBtn = document.getElementById(`lp-tab-${nextKey}`);
        nextBtn?.focus();
      }
    },
    [handleSelectKey]
  );

  const displayedPrice = scrubPoint ? scrubPoint.val : activeSeries.lastPrice;

  return (
    <div className="lp-widget-card" id="hero-widget">
      {/* Top Header: Tab bar */}
      <div className="lp-widget-header">
        <div
          className="lp-tab-list"
          role="tablist"
          aria-label="Tracked commodity benchmarks"
        >
          {SERIES_KEYS.map((key, idx) => {
            const item = HERO_SERIES[key];
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                id={`lp-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`lp-panel-${key}`}
                tabIndex={isActive ? 0 : -1}
                className={`lp-tab-btn ${isActive ? 'lp-tab-btn--active' : ''}`}
                onClick={() => handleSelectKey(key)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
              >
                <span className="lp-tab-btn__name">{item.name}</span>
              </button>
            );
          })}
        </div>

        <span className="lp-sample-tag">{SAMPLE_DATA_TAG}</span>
      </div>

      {/* Main Tab Panel */}
      <div
        id={`lp-panel-${activeKey}`}
        role="tabpanel"
        aria-labelledby={`lp-tab-${activeKey}`}
        className="lp-widget-body"
      >
        {/* Metric Summary Bar (syncs smoothly on pointer scrub) */}
        <div className="lp-metric-summary">
          <div className="lp-metric-main">
            <div className="lp-metric-identity">
              <span className="lp-metric-title">{activeSeries.name}</span>
              <span className="lp-metric-unit">
                {activeSeries.unit} &middot; {activeSeries.category}
              </span>
            </div>
            <div className="lp-metric-numbers">
              <span className="lp-metric-price" data-testid="hero-metric-price">
                {activeSeries.currency}
                {displayedPrice.toFixed(2)}
              </span>
              {scrubPoint ? (
                <span className="lp-scrub-pill">Day {scrubPoint.idx + 1} of 30</span>
              ) : (
                <DeltaBadge deltaPct={activeSeries.deltaPct} period="30d" />
              )}
            </div>
          </div>
        </div>

        {/* Interactive SVG Chart */}
        <div className="lp-chart-container">
          <PriceChart key={activeKey} series={activeSeries} onScrub={handleScrub} />
        </div>

        {/* Grounded AI Signal & Procurement Guidance Block */}
        <div className="lp-signal-block">
          <div className="lp-signal-block__header">
            <div className="lp-signal-block__title-wrap">
              <span className="lp-signal-block__title">
                Procurement Intelligence Signal
              </span>
              <span className="lp-signal-block__subtitle">
                Grounded against official market benchmarks
              </span>
            </div>
            <SignalPill signal={activeSeries.signal} />
          </div>

          {activeSeries.supplierQuote && (
            <div className="lp-quote-variance-row">
              <div className="lp-quote-col">
                <span className="lp-quote-col__label">Domestic Supplier Quote</span>
                <span className="lp-quote-col__val font-mono">
                  {activeSeries.supplierQuote}
                </span>
              </div>
              <div className="lp-quote-col">
                <span className="lp-quote-col__label">Market Benchmark</span>
                <span className="lp-quote-col__val font-mono">
                  {activeSeries.benchmarkPrice}
                </span>
              </div>
              <div className="lp-quote-col lp-quote-col--variance">
                <span className="lp-quote-col__label">Supplier Variance</span>
                <span className="lp-quote-col__val font-mono lp-quote-col__val--premium">
                  {activeSeries.supplierVariance}
                </span>
              </div>
            </div>
          )}

          <p className="lp-signal-rationale">{activeSeries.rationale}</p>
        </div>
      </div>
    </div>
  );
}
