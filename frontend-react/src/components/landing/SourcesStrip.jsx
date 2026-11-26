/**
 * SourcesStrip — Open Architectural Verification Ledger
 *
 * Explicitly cites genuine buyer-relevant market streams and delivery rails.
 * Bounded cleanly by hairline rules (no nested card-inside-card borders).
 */
export function SourcesStrip() {
  const sources = [
    {
      label: 'EIA Global Energy',
      desc: 'WTI & Brent Crude Proxies',
      meta: 'Daily API Sync',
    },
    {
      label: 'Agmarknet Mandis',
      desc: 'Wholesale Mandi Modal Rates',
      meta: 'Ministry of Agriculture',
    },
    {
      label: 'Supply Chain Graph',
      desc: 'Multi-Hop Dependency Engine',
      meta: 'Empirical Lag Tracing',
    },
    {
      label: 'Live FX Parity',
      desc: 'USD/INR Landed-Cost Normalization',
      meta: 'Daily Exchange Sync',
    },
    {
      label: 'WhatsApp & Email Rails',
      desc: 'Instant Alerts & Morning Digests',
      meta: '7:00 AM Briefings',
    },
  ];

  return (
    <section className="lp-sources-section" aria-label="Grounded Data Sources">
      <div className="lp-container">
        <div className="lp-sources-ledger">
          <div className="lp-sources-ledger__eyebrow">
            Verified Public Market Feeds &amp; Procurement Delivery Rails
          </div>

          <div className="lp-sources-grid">
            {sources.map((item) => (
              <div key={item.label} className="lp-source-item">
                <span className="lp-source-item__label">{item.label}</span>
                <span className="lp-source-item__desc">{item.desc}</span>
                <span className="lp-source-item__meta font-mono">{item.meta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
