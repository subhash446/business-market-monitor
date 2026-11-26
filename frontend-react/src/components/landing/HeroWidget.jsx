import { useCallback, useEffect, useState } from 'react';
import { HERO_SERIES, SAMPLE_DATA_TAG } from '../../data/landingSample.js';
import { DeltaBadge } from './DeltaBadge.jsx';
import { PriceChart } from './PriceChart.jsx';
import { SignalPill } from './SignalPill.jsx';

const SERIES_KEYS = ['pet', 'brent', 'wheat'];
const AUTO_CYCLE_MS = 6000;

/**
 * HeroWidget — Interactive tabbed commodity telemetry monitor
 *
 * - Gentle 6000ms auto-cycling across commodities on client (pauses immediately on hover,
 *   pointer scrub, keyboard focus, manual tab selection, or prefers-reduced-motion)
 * - Razor-thin 2px progress underline on active tab reflecting cycle rhythm
 * - Exact backend ACTION_RECOMMENDATION enums & "Sample data · illustrative" tag
 */
export function HeroWidget() {
  const [activeKey, setActiveKey] = useState('pet');
  const [scrubPoint, setScrubPoint] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusInside, setHasFocusInside] = useState(false);
  const [manualSelected, setManualSelected] = useState(false);

  const activeSeries = HERO_SERIES[activeKey] ?? HERO_SERIES.pet;
  const isCyclePaused = isHovered || hasFocusInside || scrubPoint !== null || manualSelected;

  useEffect(() => {
    if (typeof window === 'undefined' || isCyclePaused) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const timer = window.setTimeout(() => {
      setActiveKey((curr) => {
        const nextIdx = (SERIES_KEYS.indexOf(curr) + 1) % SERIES_KEYS.length;
        return SERIES_KEYS[nextIdx];
      });
    }, AUTO_CYCLE_MS);

    return () => window.clearTimeout(timer);
  }, [activeKey, isCyclePaused]);

  const handleSelectKey = useCallback((nextKey) => {
    setActiveKey(nextKey);
    setScrubPoint(null);
    setManualSelected(true);
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
    <div
      className="lp-widget-card"
      id="hero-widget"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocusInside(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setHasFocusInside(false);
        }
      }}
    >
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
                {isActive && (
                  <span
                    key={activeKey}
                    className={`lp-tab-progress ${
                      isCyclePaused ? 'lp-tab-progress--paused' : ''
                    } ${manualSelected ? 'lp-tab-progress--locked' : ''}`}
                    aria-hidden="true"
                  />
                )}
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

        {/* Interactive Living SVG Chart */}
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
