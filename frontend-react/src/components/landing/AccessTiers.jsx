import { PricingPlansSection } from '../billing/PricingPlansSection.jsx';

const ENTERPRISE_EMAIL = 'subhashyadav25177@gmail.com';
const INQUIRY_SUBJECT = 'AI Market Intelligence Agent — Multi-Plant & ERP Inquiry';
const INQUIRY_BODY = `Hi Subhash,

We are interested in Multi-Plant & ERP Sync for AI Market Intelligence Agent.

- Company Name:
- Number of Plants / Locations:
- Key Raw Materials Tracked:
- Current ERP / Accounting Tool (e.g., Tally, SAP, Zoho):

Thanks,`;

const GMAIL_COMPOSE_URL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
  ENTERPRISE_EMAIL
)}&su=${encodeURIComponent(INQUIRY_SUBJECT)}&body=${encodeURIComponent(INQUIRY_BODY)}`;

/**
 * AccessTiers — Chapter 03 Transparent SaaS Access Options
 *
 * - Free tier for Indian SME manufacturers
 * - Growth tier with landed-cost parity & reorder engine
 * - Multi-plant inquiry via pre-filled Gmail compose URL (no mailto:)
 */
export function AccessTiers() {
  return (
    <section
      id="access"
      className="lp-section lp-reveal"
      aria-label="Transparent Access Options"
    >
      <div className="lp-container">
        {/* Numbered Left-Aligned Editorial Chapter Header */}
        <div className="lp-chapter-header">
          <div className="lp-chapter-header__lead">
            <div className="lp-chapter-eyebrow">
              <span className="lp-chapter-index">03</span>
              <span>/ Access &amp; Deployment</span>
            </div>
            <h2 className="lp-section-title">
              Simple, Transparent Access.
            </h2>
          </div>

          <p className="lp-section-desc">
            No gatekept free trials or credit card walls. Core commodity telemetry and
            alerts are freely accessible to Indian SME manufacturers.
          </p>
        </div>

        {/* 3-Column SaaS Pricing Section */}
        <PricingPlansSection mode="landing" />

        {/* Multi-Plant Transparency Link */}
        <div className="lp-tiers-transparency">
          <p className="lp-tiers-transparency__text">
            Operating multiple manufacturing plants with custom ERP ingestion needs?{' '}
            <a
              href={GMAIL_COMPOSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-tiers-link"
            >
              Contact Engineering for Multi-Plant &amp; ERP Sync &rarr;
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
