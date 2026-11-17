import { Link } from 'react-router-dom';

/**
 * AccessTiers — Transparent, Honest Tier Comparison
 *
 * Rules:
 * - Free tier for Indian SME manufacturers (unlimited materials, alerts, WhatsApp)
 * - Custom tier for multi-plant ERP operations
 * - Zero invented enterprise pricing
 */
export function AccessTiers() {
  return (
    <section id="access" className="lp-section" aria-label="Transparent Access Options">
      <div className="lp-container">
        <div className="lp-section-header">
          <div className="lp-section-tag">Access &amp; Deployment</div>
          <h2 className="lp-section-title">
            Simple, Transparent <span className="lp-text-gradient">Access.</span>
          </h2>
          <p className="lp-section-desc">
            No gatekept free trials or credit card walls. Full commodity telemetry and
            alerts are freely accessible to Indian SME manufacturers.
          </p>
        </div>

        <div className="lp-tiers-grid">
          {/* Card 1: Self-Serve SME Free Access */}
          <div className="lp-tier-card lp-tier-card--highlight">
            <div className="lp-tier-card__header">
              <div className="lp-tier-badge">SME Manufacturing Edition</div>
              <h3 className="lp-tier-title">Self-Serve SME Access</h3>
              <div className="lp-tier-price">
                <span className="lp-tier-price__val">Free</span>
                <span className="lp-tier-price__period">/ for Indian SMEs</span>
              </div>
              <p className="lp-tier-desc">
                Everything an SME factory or converter needs to benchmark material quotes
                and avoid supplier overcharges.
              </p>
            </div>

            <ul className="lp-tier-features">
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Unlimited material tracking &amp; custom grades</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Daily WhatsApp &amp; Email morning procurement brief</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>EIA &amp; Agmarknet official benchmark synchronizations</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Multi-hop upstream supply chain impact graph</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Grounded AI procurement signals &amp; inventory advice</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Quote vs benchmark variance analyzer</span>
              </li>
            </ul>

            <div className="lp-tier-action">
              <Link to="/register" className="lp-btn lp-btn--primary lp-btn--full">
                Start Monitoring Free
              </Link>
            </div>
          </div>

          {/* Card 2: Multi-Plant & Custom ERP Integration */}
          <div className="lp-tier-card">
            <div className="lp-tier-card__header">
              <div className="lp-tier-badge lp-tier-badge--muted">Enterprise &amp; Multi-Unit</div>
              <h3 className="lp-tier-title">Multi-Plant &amp; ERP Sync</h3>
              <div className="lp-tier-price">
                <span className="lp-tier-price__val">Talk to us</span>
                <span className="lp-tier-price__period">/ scoped deployment</span>
              </div>
              <p className="lp-tier-desc">
                For manufacturing groups operating across multiple state facilities with
                bespoke ERP ingestion needs.
              </p>
            </div>

            <ul className="lp-tier-features">
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Automated PO quote ingestion from SAP, Tally, or custom ERP</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Multi-plant vendor variance benchmarking</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Dedicated webhook destinations for factory ERP alerts</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Custom regional commodity proxies &amp; private mandis</span>
              </li>
              <li>
                <i className="fa-solid fa-check text-emerald-400 mr-2" aria-hidden="true" />
                <span>Priority procurement engineering support</span>
              </li>
            </ul>

            <div className="lp-tier-action">
              <a
                href="mailto:engineering@businessmarketmonitor.com?subject=Multi-Plant%20ERP%20Inquiry"
                className="lp-btn lp-btn--secondary lp-btn--full"
              >
                Contact Engineering
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
