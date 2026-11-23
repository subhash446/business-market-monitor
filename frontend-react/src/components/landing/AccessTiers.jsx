import { PricingPlansSection } from '../billing/PricingPlansSection.jsx';

const ENTERPRISE_EMAIL = 'subhashyadav25177@gmail.com';
const INQUIRY_SUBJECT = 'Business Market Monitor — Multi-Plant & ERP Inquiry';
const INQUIRY_BODY = `Hi Subhash,

We are interested in Multi-Plant & ERP Sync for Business Market Monitor.

- Company Name:
- Number of Plants / Locations:
- Key Raw Materials Tracked:
- Current ERP / Accounting Tool (e.g., Tally, SAP, Zoho):

Thanks,`;

const GMAIL_COMPOSE_URL = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
  ENTERPRISE_EMAIL
)}&su=${encodeURIComponent(INQUIRY_SUBJECT)}&body=${encodeURIComponent(INQUIRY_BODY)}`;

/**
 * AccessTiers — Transparent, Honest 3-Column SaaS Tier Experience (V3-M5).
 *
 * Rules:
 * - Free tier for Indian SME manufacturers (unlimited materials, alerts, WhatsApp)
 * - Growth tier with landed-cost parity & reorder engine
 * - Custom tier for multi-plant ERP operations with direct Gmail web compose CTA
 * - Zero gatekept trials or fake checkout dead-ends
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

        {/* 3-Column SaaS Pricing Section */}
        <PricingPlansSection mode="landing" />

        {/* Multi-Plant Transparency Link */}
        <div className="lp-tiers-transparency" style={{ marginTop: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: '#a1a1aa', fontSize: '0.875rem' }}>
            Operating multiple manufacturing plants with custom ERP ingestion needs?{' '}
            <a
              href={GMAIL_COMPOSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Contact Engineering for Multi-Plant &amp; ERP Sync &rarr;
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
