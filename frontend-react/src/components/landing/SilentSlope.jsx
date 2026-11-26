import { SAMPLE_DATA_TAG, SILENT_SLOPE } from '../../data/landingSample.js';
import { DigestPreview } from './DigestPreview.jsx';
import { SlopeChart } from './SlopeChart.jsx';

/**
 * SilentSlope Section — Chapter 02 Supplier Pricing Asymmetry & Digest
 *
 * Explains the "Rockets & Feathers" pricing asymmetry where quotes rise fast
 * but fall slow, paired with WhatsApp & Email morning brief previews.
 */
export function SilentSlope() {
  const { verdictChip, stats, summary } = SILENT_SLOPE;

  return (
    <section
      id="supplier-benchmark"
      className="lp-section lp-reveal"
      aria-label="Supplier Pricing Asymmetry"
    >
      <div className="lp-container">
        {/* Numbered Left-Aligned Editorial Chapter Header */}
        <div className="lp-chapter-header">
          <div className="lp-chapter-header__lead">
            <div className="lp-chapter-eyebrow">
              <span className="lp-chapter-index">02</span>
              <span>/ Supplier Quote Benchmarking</span>
            </div>
            <h2 className="lp-section-title">
              Unmask the &ldquo;Silent Slope&rdquo; in Quotes.
            </h2>
          </div>

          <p className="lp-section-desc">
            When upstream benchmarks surge, vendors cite crude and mandi shortages to hike
            rates within days. But when commodity costs drop, quotes linger high for
            weeks. BMM gives procurement teams benchmark proof before negotiating.
          </p>
        </div>

        <div className="lp-slope-grid">
          {/* Left Column: Asymmetry Graph & Speed Stats */}
          <div className="lp-slope-col">
            <div className="lp-slope-card">
              <div className="lp-slope-card__header">
                <div className="lp-slope-card__badge-row">
                  <span className="lp-verdict-chip font-mono">{verdictChip}</span>
                  <span className="lp-sample-tag">{SAMPLE_DATA_TAG}</span>
                </div>
                <h3 className="lp-slope-card__title">
                  24-Week Pass-Through Velocity Disparity
                </h3>
              </div>

              <div className="lp-slope-card__chart">
                <SlopeChart />
              </div>

              <div className="lp-speed-stats-grid">
                <div className="lp-speed-stat-card lp-speed-stat-card--up">
                  <span className="lp-speed-stat-card__val font-mono">{stats.up}</span>
                  <span className="lp-speed-stat-card__label">{stats.upLabel}</span>
                  <span className="lp-speed-stat-card__badge">Immediate Hike</span>
                </div>

                <div className="lp-speed-stat-card lp-speed-stat-card--down">
                  <span className="lp-speed-stat-card__val font-mono">{stats.down}</span>
                  <span className="lp-speed-stat-card__label">{stats.downLabel}</span>
                  <span className="lp-speed-stat-card__badge">Lagged Drop</span>
                </div>
              </div>

              <p className="lp-slope-summary">{summary}</p>
            </div>
          </div>

          {/* Right Column: Multi-Channel Morning Digest Preview */}
          <div className="lp-digest-col">
            <DigestPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
