import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeroWidget } from './HeroWidget.jsx';

const LIVE_SIGNALS = [
  {
    tone: 'up',
    text: 'PET Resin supplier quote ₹123.90 sits +8.2% above benchmark — accelerate purchase.',
  },
  {
    tone: 'up',
    text: 'Brent Crude +3.2% shift propagating into Naphtha & Freight (~11-day lag).',
  },
  {
    tone: 'down',
    text: 'Indore Wheat mandi eased -1.8% — hold bulk booking and negotiate down.',
  },
];

/**
 * Hero Section — Immediately visible above-the-fold architectural telemetry stage.
 *
 * - Ultra-crisp dot grid + ambient horizon sweep backdrop
 * - Keeps <h1> static for zero CLS and strict SEO/test invariants
 * - Renders Sentence #1 in full on SSR & initial paint, cycling via guarded client timer
 */
export function Hero() {
  const [signalIdx, setSignalIdx] = useState(0);
  const [charCount, setCharCount] = useState(LIVE_SIGNALS[0].text.length);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    let timerId = null;
    let idx = 0;
    let count = LIVE_SIGNALS[0].text.length;
    let phase = 'hold';

    function step() {
      const targetLen = LIVE_SIGNALS[idx].text.length;

      if (phase === 'hold') {
        phase = 'erase';
        timerId = window.setTimeout(step, 3400);
        return;
      }

      if (phase === 'erase') {
        if (count > 0) {
          count -= 2;
          if (count < 0) count = 0;
          setCharCount(count);
          timerId = window.setTimeout(step, 14);
          return;
        }
        idx = (idx + 1) % LIVE_SIGNALS.length;
        phase = 'type';
        setSignalIdx(idx);
        timerId = window.setTimeout(step, 140);
        return;
      }

      if (count < targetLen) {
        count += 1;
        setCharCount(count);
        timerId = window.setTimeout(step, 24);
        return;
      }

      phase = 'hold';
      timerId = window.setTimeout(step, 60);
    }

    timerId = window.setTimeout(step, 3400);
    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  const currentSignal = LIVE_SIGNALS[signalIdx] ?? LIVE_SIGNALS[0];
  const visibleText = currentSignal.text.slice(0, charCount);

  return (
    <section id="hero-top" className="lp-hero-section" aria-label="Introduction">
      {/* Architectural Telemetry Grid + Continuous Ambient Horizon Sweep */}
      <div className="lp-hero-backdrop" aria-hidden="true">
        <div className="lp-hero-grid-dots" />
        <div className="lp-horizon-sweep" />
      </div>

      <div className="lp-container lp-hero-grid">
        {/* Left Column: Value Proposition & Direct CTAs */}
        <div className="lp-hero-copy">
          <div className="lp-hero-eyebrow">
            <span className="lp-hero-eyebrow__rule" aria-hidden="true" />
            <span>Real-Time Raw Material Procurement Intelligence</span>
          </div>

          <h1 className="lp-hero-title">
            Stop Overpaying for{' '}
            <span className="lp-hero-title__emphasis">Raw Materials.</span>
          </h1>

          <p className="lp-hero-desc">
            Track official commodity benchmarks, unmask hidden supplier markups,
            and anticipate upstream cost shocks across your supply chain before
            invoices arrive.
          </p>

          {/* Fixed-height live-typing telemetry terminal bar (zero CLS) */}
          <div className="lp-live-terminal" data-testid="hero-live-terminal">
            <div className="lp-live-terminal__prefix">
              <span
                className={`lp-live-dot lp-live-dot--${currentSignal.tone}`}
                aria-hidden="true"
              />
              <span className="lp-live-label font-mono">LIVE SIGNAL</span>
            </div>
            <p className="lp-live-text font-mono">
              <span>{visibleText}</span>
              <span className="lp-live-cursor" aria-hidden="true">|</span>
            </p>
          </div>

          <div className="lp-hero-actions">
            <Link to="/register" className="lp-btn lp-btn--primary">
              Start Monitoring Free
              <span className="lp-btn__arrow" aria-hidden="true">→</span>
            </Link>

            <a href="#how-it-works" className="lp-btn lp-btn--secondary">
              Explore Upstream Flow
            </a>
          </div>

          <div className="lp-hero-trust-row">
            <span className="lp-trust-item">
              <i className="fa-solid fa-check lp-trust-check" aria-hidden="true" />
              <span>Free for Indian SMEs</span>
            </span>
            <span aria-hidden="true">&middot;</span>
            <span className="lp-trust-item">
              <i className="fa-solid fa-check lp-trust-check" aria-hidden="true" />
              <span>Zero credit card required</span>
            </span>
            <span aria-hidden="true">&middot;</span>
            <span className="lp-trust-item">
              <i className="fa-solid fa-check lp-trust-check" aria-hidden="true" />
              <span>Instant Agmarknet &amp; EIA sync</span>
            </span>
          </div>
        </div>

        {/* Right Column: Live Interactive Commodity Widget */}
        <div className="lp-hero-widget-col">
          <HeroWidget />
        </div>
      </div>
    </section>
  );
}
