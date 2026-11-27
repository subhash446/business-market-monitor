import { useCallback, useEffect, useRef, useState } from 'react';
import { HERO_SERIES, SAMPLE_DATA_TAG } from '../../data/landingSample.js';
import { DeltaBadge } from './DeltaBadge.jsx';
import { PriceChart } from './PriceChart.jsx';
import { RollingMetric } from './RollingMetric.jsx';
import { SignalPill } from './SignalPill.jsx';

const SERIES_KEYS = ['pet', 'brent', 'wheat'];
const AUTO_CYCLE_MS = 6000;
const ENGINE_EVENTS = [
  {
    tag: 'EIA SYNC',
    text: 'Brent Crude benchmark $82.40/bbl verified',
    tone: 'up',
  },
  {
    tag: 'GRAPH ENGINE',
    text: '11-day empirical lag detected → PET Resin',
    tone: 'info',
  },
  {
    tag: 'QUOTE AUDIT',
    text: 'Supplier quote ₹123.90 sits +8.2% above parity',
    tone: 'severe',
  },
  {
    tag: 'MANDI FEED',
    text: 'Indore Wheat eased -1.8% → DELAY_PURCHASE active',
    tone: 'down',
  },
];

/**
 * HeroWidget — Living "Trading Floor" Hero Terminal
 *
 * - Rolling odometer readouts via RollingMetric (headline price, delta %, supplier premium)
 * - Subtle 3D hardware perspective tilt (±3.2deg max on desktop fine pointers, resets on leave)
 * - Cursor spotlight frame + live cycling procurement Engine Event Tape below Signal block
 * - 6000ms auto-tab cycle yielding immediately on hover, scrub, focus, manual tab click, or reduced-motion
 */
export function HeroWidget() {
  const [activeKey, setActiveKey] = useState('pet');
  const [scrubPoint, setScrubPoint] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusInside, setHasFocusInside] = useState(false);
  const [manualSelected, setManualSelected] = useState(false);
  const [eventIdx, setEventIdx] = useState(0);

  const cardRef = useRef(null);
  const tiltRafRef = useRef(null);

  const activeSeries = HERO_SERIES[activeKey] ?? HERO_SERIES.pet;
  const isCyclePaused = isHovered || hasFocusInside || scrubPoint !== null || manualSelected;

  // Auto-cycle across 3 commodity tabs every 6s unless paused
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

  // Cycle Live Engine Event Tape every 3.5s on client
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      setEventIdx((prev) => (prev + 1) % ENGINE_EVENTS.length);
    }, 3500);

    return () => window.clearInterval(interval);
  }, []);

  // Cleanup tilt rAF on unmount
  useEffect(() => {
    return () => {
      if (tiltRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(tiltRafRef.current);
      }
    };
  }, []);

  const handlePointerMoveCard = useCallback((e) => {
    if (typeof window === 'undefined' || !cardRef.current) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: fine)').matches;
    if (reduced || !fine) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    if (tiltRafRef.current !== null) {
      window.cancelAnimationFrame(tiltRafRef.current);
    }

    tiltRafRef.current = window.requestAnimationFrame(() => {
      tiltRafRef.current = null;
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.max(-0.5, Math.min(0.5, (clientX - rect.left) / rect.width - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, (clientY - rect.top) / rect.height - 0.5));
      const rotateX = (-ny * 5.6).toFixed(2); // Clamped <= +/- 2.8deg (strictly within +/-3.5deg)
      const rotateY = (nx * 5.6).toFixed(2);
      cardRef.current.style.setProperty('--tilt-x', `${rotateX}deg`);
      cardRef.current.style.setProperty('--tilt-y', `${rotateY}deg`);
    });
  }, []);

  const resetCardTilt = useCallback(() => {
    if (tiltRafRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(tiltRafRef.current);
      tiltRafRef.current = null;
    }
    if (cardRef.current) {
      cardRef.current.style.setProperty('--tilt-x', '0deg');
      cardRef.current.style.setProperty('--tilt-y', '0deg');
    }
  }, []);

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
  const activeEvent = ENGINE_EVENTS[eventIdx] ?? ENGINE_EVENTS[0];

  return (
    <div
      ref={cardRef}
      className="lp-widget-card lp-spotlight-card lp-tilt-surface"
      id="hero-widget"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        resetCardTilt();
      }}
      onPointerMove={handlePointerMoveCard}
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
        {/* Metric Summary Bar (odometer roll on tab change & scrub) */}
        <div className="lp-metric-summary">
          <div className="lp-metric-main">
            <div className="lp-metric-identity">
              <span className="lp-metric-title">{activeSeries.name}</span>
              <span className="lp-metric-unit">
                {activeSeries.unit} &middot; {activeSeries.category}
              </span>
            </div>
            <div className="lp-metric-numbers">
              <RollingMetric
                value={displayedPrice}
                prefix={activeSeries.currency}
                decimals={2}
                durationMs={scrubPoint ? 90 : 280}
                className="lp-metric-price"
                testId="hero-metric-price"
              />
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
                <RollingMetric
                  value={activeSeries.variancePct}
                  prefix="+"
                  suffix="% Premium"
                  decimals={1}
                  durationMs={280}
                  className="lp-quote-col__val font-mono lp-quote-col__val--premium"
                />
              </div>
            </div>
          )}

          <p className="lp-signal-rationale">{activeSeries.rationale}</p>
        </div>

        {/* Live Engine Event Tape */}
        <div className="lp-engine-tape" data-testid="hero-engine-tape">
          <span
            className={`lp-engine-beacon lp-engine-beacon--${activeEvent.tone}`}
            aria-hidden="true"
          />
          <div key={eventIdx} className="lp-engine-event lp-engine-event--enter">
            <span className="lp-engine-tag font-mono">{activeEvent.tag}</span>
            <span className="lp-engine-sep font-mono" aria-hidden="true">&middot;</span>
            <span className="lp-engine-msg font-mono">{activeEvent.text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
