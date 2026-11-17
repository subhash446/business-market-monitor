import { Link } from 'react-router-dom';
import { HeroWidget } from './HeroWidget.jsx';

/**
 * Hero Section
 *
 * 5/7 Two-column desktop grid with mobile-first 360px responsiveness.
 */
export function Hero() {
  return (
    <section className="lp-hero-section" aria-label="Introduction">
      <div className="lp-container lp-hero-grid">
        {/* Left Column: Value Proposition & Direct CTAs */}
        <div className="lp-hero-copy">
          <div className="lp-hero-badge">
            <span className="lp-hero-badge__dot" aria-hidden="true" />
            <span>Real-Time Raw Material Procurement Intelligence</span>
          </div>

          <h1 className="lp-hero-title">
            Stop Overpaying for <span className="lp-text-gradient">Raw Materials.</span>
          </h1>

          <p className="lp-hero-desc">
            Track official commodity benchmarks, unmask hidden supplier markups,
            and anticipate upstream cost shocks across your supply chain before
            invoices arrive.
          </p>

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
              <i className="fa-solid fa-check mr-1.5 text-emerald-400" aria-hidden="true" />
              Free for Indian SMEs
            </span>
            <span className="lp-trust-divider" aria-hidden="true">·</span>
            <span className="lp-trust-item">
              <i className="fa-solid fa-check mr-1.5 text-emerald-400" aria-hidden="true" />
              Zero credit card required
            </span>
            <span className="lp-trust-divider" aria-hidden="true">·</span>
            <span className="lp-trust-item">
              <i className="fa-solid fa-check mr-1.5 text-emerald-400" aria-hidden="true" />
              Instant Agmarknet &amp; EIA sync
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
