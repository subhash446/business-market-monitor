import { useState } from 'react';
import { Link } from 'react-router-dom';

const ENTERPRISE_EMAIL = 'subhashyadav25177@gmail.com';
const MAILTO_SUBJECT = 'Business Market Monitor — Multi-Plant & ERP Inquiry';
const MAILTO_BODY = `Hi Subhash,

We are interested in Multi-Plant & ERP Sync for Business Market Monitor.

- Company Name:
- Number of Plants / Locations:
- Key Raw Materials Tracked:
- Current ERP / Accounting Tool (e.g., Tally, SAP, Zoho):

Thanks,`;

const MAILTO_URL = `mailto:${ENTERPRISE_EMAIL}?subject=${encodeURIComponent(
  MAILTO_SUBJECT
)}&body=${encodeURIComponent(MAILTO_BODY)}`;

/**
 * AccessTiers — Transparent, Honest Tier Comparison
 *
 * Rules:
 * - Free tier for Indian SME manufacturers (unlimited materials, alerts, WhatsApp)
 * - Custom tier for multi-plant ERP operations with grounded direct email CTA
 * - Zero invented enterprise pricing
 */
export function AccessTiers() {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(ENTERPRISE_EMAIL)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // Safe fallback if clipboard access is denied
        });
    }
  };

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
                href={MAILTO_URL}
                className="lp-btn lp-btn--secondary lp-btn--full"
              >
                Contact Engineering
              </a>

              <div className="lp-copy-email-row">
                <span className="lp-copy-email-text font-mono">
                  {ENTERPRISE_EMAIL}
                </span>
                <button
                  type="button"
                  className={`lp-copy-email-btn ${
                    copied ? 'lp-copy-email-btn--copied' : ''
                  }`}
                  onClick={handleCopyEmail}
                  aria-label={copied ? 'Email address copied' : 'Copy email address'}
                >
                  {copied ? (
                    <>
                      <i
                        className="fa-solid fa-check text-emerald-400 mr-1"
                        aria-hidden="true"
                      />
                      Copied ✓
                    </>
                  ) : (
                    <>
                      <i className="fa-regular fa-copy mr-1" aria-hidden="true" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
