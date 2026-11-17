/**
 * SourcesStrip — Verification & Public Data Transparency
 *
 * Explicitly cites genuine, grounded public sources and system verification.
 * Zero fabricated customer logos or stock testimonials.
 */
export function SourcesStrip() {
  const sources = [
    {
      label: 'EIA Official Data',
      desc: 'WTI & Brent Crude Proxies',
      meta: 'Daily API Sync',
    },
    {
      label: 'Agmarknet (Govt. of India)',
      desc: 'Wholesale Mandi Modal Rates',
      meta: 'Ministry of Agriculture',
    },
    {
      label: 'Supply Chain Graph',
      desc: 'Multi-Hop Dependency Engine',
      meta: 'Deterministic BFS',
    },
    {
      label: 'WhatsApp Cloud API',
      desc: 'Instant Threshold Alerts',
      meta: 'Meta Business Platform',
    },
    {
      label: '775+ Verified Tests',
      desc: 'Cross-Stack Integration Suite',
      meta: 'Strict Test Invariants',
    },
  ];

  return (
    <section className="lp-sources-section" aria-label="Grounded Data Sources">
      <div className="lp-container">
        <div className="lp-sources-bar">
          <div className="lp-sources-title">
            <span>Verified Public Data Streams &amp; Test Invariants</span>
          </div>

          <div className="lp-sources-grid">
            {sources.map((item, idx) => (
              <div key={idx} className="lp-source-item">
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
