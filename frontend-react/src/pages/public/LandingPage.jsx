/**
 * LandingPage — public marketing page
 * Business Market Monitor — Phase D
 *
 * Sections:
 *   1. Navbar      — brand, nav links, Login / Get Started
 *   2. Hero        — headline, sub-copy, CTAs, dashboard preview
 *   3. Features    — 6 capability cards (real, implemented features only)
 *   4. How it works — 4-step process
 *   5. Use cases   — 4 business scenarios
 *   6. Final CTA
 *   7. Footer
 *
 * No fake statistics, testimonials, customer logos or unsupported claims.
 * Uses existing design tokens and btn/badge component classes.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/pages/landing.css';

/* ── Preview panel data ──────────────────────────────────────────── */

const PREVIEW_PANELS = [
  {
    title: 'Tracked Materials',
    items: [
      { label: '65%', value: 'blue' },
      { label: '42%', value: 'green' },
      { label: '80%', value: 'blue' },
      { label: '28%', value: '' },
    ],
  },
  {
    title: 'Price Alerts',
    items: [
      { label: '90%', value: 'green' },
      { label: '55%', value: 'amber' },
      { label: '70%', value: 'blue' },
      { label: '45%', value: 'green' },
    ],
  },
  {
    title: 'Recent News',
    chart: [38, 55, 45, 60, 52, 68, 62, 74, 65, 80],
  },
];

/* ── Feature cards (real implemented features only) ─────────────── */

const FEATURES = [
  {
    icon: 'fa-solid fa-chart-line',
    color: 'blue',
    title: 'Real-Time Price Tracking',
    desc:
      'Log and monitor material prices as they change. View the latest recorded price for every tracked material and see full price history at a glance.',
  },
  {
    icon: 'fa-solid fa-satellite-dish',
    color: 'cyan',
    title: 'External Market Data',
    desc:
      'Link tracked materials to WTI or Brent crude benchmarks and automatically pull the latest prices from EIA — no manual entry required.',
  },
  {
    icon: 'fa-solid fa-bell',
    color: 'amber',
    title: 'Configurable Alerts',
    desc:
      'Define price-threshold rules per material. Receive email notifications the moment a price crosses your defined upper or lower boundary.',
  },
  {
    icon: 'fa-solid fa-wave-square',
    color: 'purple',
    title: 'Historical Trend Analysis',
    desc:
      'Visualize price trends over time with interactive charts. Compare multiple materials side-by-side to spot correlations and patterns.',
  },
  {
    icon: 'fa-solid fa-newspaper',
    color: 'green',
    title: 'Relevant News Feed',
    desc:
      'Stay current with business-relevant news sourced and filtered for your industry, surfaced alongside your price and material data.',
  },
  {
    icon: 'fa-solid fa-building',
    color: 'red',
    title: 'Business-Scoped Workspace',
    desc:
      'All data is isolated per business. Your materials, prices, alerts and news are yours — completely separate from any other workspace.',
  },
];

/* ── How-it-works steps ──────────────────────────────────────────── */

const HOW_STEPS = [
  {
    n: '1',
    icon: 'fa-solid fa-building',
    title: 'Create Your Business',
    desc: 'Set up your workspace in minutes — name your business and select your industry.',
  },
  {
    n: '2',
    icon: 'fa-solid fa-boxes-stacked',
    title: 'Add Your Materials',
    desc: 'Add the raw materials or commodities you work with, from a curated list or as custom entries.',
  },
  {
    n: '3',
    icon: 'fa-solid fa-magnifying-glass-chart',
    title: 'Monitor Prices',
    desc: 'Record prices manually or connect to external market feeds for automatic ingestion.',
  },
  {
    n: '4',
    icon: 'fa-solid fa-bell',
    title: 'Get Alerted',
    desc: 'Define threshold rules and receive email alerts when prices move into ranges that matter to your business.',
  },
];

/* ── Use-case cards ──────────────────────────────────────────────── */

const USE_CASES = [
  {
    icon: '🏭',
    title: 'Manufacturing & Production',
    desc: 'Track the raw material costs that directly affect your cost of goods. Know before price increases squeeze your margins.',
  },
  {
    icon: '🛒',
    title: 'Procurement & Supply Chain',
    desc: 'Monitor market benchmarks against your supplier quotes. Identify when spot prices diverge from what you\'re paying.',
  },
  {
    icon: '📊',
    title: 'Financial Planning',
    desc: 'Keep pricing decisions grounded in real market data. Historical trends support better budget forecasts and contract negotiations.',
  },
  {
    icon: '⚡',
    title: 'Operations & Risk',
    desc: 'Set alert thresholds for critical inputs so your team is never caught off-guard by sudden market moves.',
  },
];

/* ── LandingPage component ───────────────────────────────────────── */

export function LandingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <div className="landing">

      {/* ── 1. NAVBAR ─────────────────────────────────────────────── */}
      <nav className="landing-nav" role="navigation" aria-label="Main navigation">
        <div className="landing-nav__inner">

          {/* Brand */}
          <Link to="/" className="landing-nav__brand" onClick={closeMobileNav}>
            <div className="landing-nav__logo-mark" aria-hidden="true">
              <i className="fa-solid fa-chart-mixed" />
            </div>
            <span className="landing-nav__brand-name">Market Monitor</span>
          </Link>

          {/* Desktop nav links */}
          <div className="landing-nav__links" role="list">
            <a href="#features"    className="landing-nav__link" role="listitem">Features</a>
            <a href="#how-it-works" className="landing-nav__link" role="listitem">How It Works</a>
            <a href="#use-cases"   className="landing-nav__link" role="listitem">Use Cases</a>
          </div>

          {/* Desktop actions */}
          <div className="landing-nav__actions">
            <Link to="/login" className="btn btn--ghost" style={{ height: '36px', padding: '0 16px', fontSize: 'var(--text-sm)' }}>
              Log in
            </Link>
            <Link to="/register" className="btn btn--primary" style={{ height: '36px', padding: '0 16px', fontSize: 'var(--text-sm)' }}>
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="landing-nav__hamburger"
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(o => !o)}
          >
            <i className={mobileNavOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars'} aria-hidden="true" />
          </button>
        </div>

        {/* Mobile drawer */}
        <div className={`landing-nav__mobile${mobileNavOpen ? ' landing-nav__mobile--open' : ''}`}>
          <a href="#features"     className="landing-nav__mobile-link" onClick={closeMobileNav}>Features</a>
          <a href="#how-it-works" className="landing-nav__mobile-link" onClick={closeMobileNav}>How It Works</a>
          <a href="#use-cases"    className="landing-nav__mobile-link" onClick={closeMobileNav}>Use Cases</a>
          <div className="landing-nav__mobile-divider" />
          <Link to="/login"    className="landing-nav__mobile-link" onClick={closeMobileNav}>Log in</Link>
          <Link to="/register" className="btn btn--primary btn--full" style={{ marginTop: 'var(--space-2)', justifyContent: 'center' }} onClick={closeMobileNav}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── 2. HERO ───────────────────────────────────────────────── */}
      <section className="landing-hero" aria-labelledby="hero-headline">
        <div className="landing-hero__inner">

          <div className="landing-hero__eyebrow" aria-hidden="true">
            <span className="landing-hero__eyebrow-dot" />
            Business Intelligence for Material Costs
          </div>

          <h1 className="landing-hero__headline" id="hero-headline">
            Know when your material{' '}
            <span className="landing-hero__headline-accent">prices change.</span>
            <br />
            React before your margins do.
          </h1>

          <p className="landing-hero__sub">
            Market Monitor gives your business a single workspace to track raw material prices,
            monitor market benchmarks, follow relevant news, and receive instant alerts
            when prices cross your defined thresholds.
          </p>

          <div className="landing-hero__ctas">
            <Link to="/register" className="btn btn--landing-primary">
              <i className="fa-solid fa-rocket" aria-hidden="true" />
              Get Started Free
            </Link>
            <a href="#features" className="btn btn--landing-ghost">
              See What's Included
              <i className="fa-solid fa-arrow-down" aria-hidden="true" />
            </a>
          </div>

          {/* Dashboard preview window */}
          <div className="landing-hero__preview" role="img" aria-label="Preview of the Market Monitor dashboard">
            <div className="landing-hero__preview-bar">
              <span className="landing-hero__preview-dot landing-hero__preview-dot--red"   aria-hidden="true" />
              <span className="landing-hero__preview-dot landing-hero__preview-dot--yellow" aria-hidden="true" />
              <span className="landing-hero__preview-dot landing-hero__preview-dot--green"  aria-hidden="true" />
              <div className="landing-hero__preview-url">
                <span className="landing-hero__preview-url-text">app.marketmonitor.io/dashboard</span>
              </div>
            </div>
            <div className="landing-hero__preview-body" aria-hidden="true">
              <div className="preview-dashboard">
                {PREVIEW_PANELS.map((panel, pi) => (
                  <div key={pi} className="preview-panel">
                    <div className="preview-panel__title">{panel.title}</div>
                    {panel.items && panel.items.map((item, ii) => (
                      <div key={ii} className="preview-panel__item">
                        <div className="preview-panel__label" style={{ width: item.label }} />
                        <div className={`preview-panel__value${item.value ? ` preview-panel__value--${item.value}` : ''}`} />
                      </div>
                    ))}
                    {panel.chart && (
                      <div className="preview-chart">
                        {panel.chart.map((h, ci) => (
                          <div key={ci} className="preview-chart__bar" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. FEATURES ───────────────────────────────────────────── */}
      <section
        id="features"
        className="landing-section landing-features"
        aria-labelledby="features-heading"
      >
        <div className="landing-inner">
          <p className="landing-section__label">Core Capabilities</p>
          <h2 className="landing-section__heading" id="features-heading">
            Everything your team needs<br />to stay ahead of market moves
          </h2>
          <p className="landing-section__sub">
            Market Monitor brings together price tracking, market feeds, trend analysis,
            alerts and relevant news in one business-scoped workspace.
          </p>

          <div className="features-grid">
            {FEATURES.map((f, i) => (
              <div key={i} className="feature-card">
                <div className={`feature-card__icon feature-card__icon--${f.color}`}>
                  <i className={f.icon} aria-hidden="true" />
                </div>
                <h3 className="feature-card__title">{f.title}</h3>
                <p className="feature-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. HOW IT WORKS ───────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="landing-section"
        aria-labelledby="how-heading"
      >
        <div className="landing-inner">
          <p className="landing-section__label">How It Works</p>
          <h2 className="landing-section__heading" id="how-heading">
            Up and running in minutes
          </h2>
          <p className="landing-section__sub">
            From signup to your first price alert in four simple steps.
          </p>

          <div className="how-steps" role="list">
            {HOW_STEPS.map((s, i) => (
              <div key={i} className="how-step" role="listitem">
                <div className="how-step__number" aria-label={`Step ${s.n}`}>
                  <i className={`how-step__icon ${s.icon}`} aria-hidden="true" />
                </div>
                <h3 className="how-step__title">{s.title}</h3>
                <p className="how-step__desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. USE CASES ──────────────────────────────────────────── */}
      <section
        id="use-cases"
        className="landing-section landing-usecases"
        aria-labelledby="usecases-heading"
      >
        <div className="landing-inner">
          <p className="landing-section__label">Who It's For</p>
          <h2 className="landing-section__heading" id="usecases-heading">
            Built for businesses<br />that depend on material costs
          </h2>
          <p className="landing-section__sub">
            Whether you're managing procurement, planning production or tracking financial exposure,
            Market Monitor gives you visibility where it matters.
          </p>

          <div className="usecases-grid">
            {USE_CASES.map((u, i) => (
              <div key={i} className="usecase-card">
                <div className="usecase-card__icon" aria-hidden="true">{u.icon}</div>
                <h3 className="usecase-card__title">{u.title}</h3>
                <p className="usecase-card__desc">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. FINAL CTA ──────────────────────────────────────────── */}
      <section className="landing-cta" aria-labelledby="cta-heading">
        <div className="landing-cta__inner">
          <h2 className="landing-cta__headline" id="cta-heading">
            Ready to take control<br />of your material costs?
          </h2>
          <p className="landing-cta__sub">
            Set up your business workspace, add your materials, and start monitoring
            prices and alerts today.
          </p>
          <div className="landing-cta__actions">
            <Link to="/register" className="btn btn--landing-primary">
              <i className="fa-solid fa-rocket" aria-hidden="true" />
              Get Started Free
            </Link>
            <Link to="/login" className="btn btn--landing-ghost">
              Already have an account?
            </Link>
          </div>
        </div>
      </section>

      {/* ── 7. FOOTER ─────────────────────────────────────────────── */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-footer__inner">
          <Link to="/" className="landing-footer__brand">
            <div className="landing-nav__logo-mark" aria-hidden="true" style={{ width: 24, height: 24, fontSize: '0.75rem' }}>
              <i className="fa-solid fa-chart-mixed" />
            </div>
            <span className="landing-footer__brand-name">Market Monitor</span>
          </Link>

          <p className="landing-footer__copy">
            &copy; {new Date().getFullYear()} Market Monitor. All rights reserved.
          </p>

          <nav className="landing-footer__links" aria-label="Footer links">
            <Link to="/login"    className="landing-footer__link">Log in</Link>
            <Link to="/register" className="landing-footer__link">Register</Link>
            <a href="#features"  className="landing-footer__link">Features</a>
          </nav>
        </div>
      </footer>

    </div>
  );
}
