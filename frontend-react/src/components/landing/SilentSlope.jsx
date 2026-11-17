import { SAMPLE_DATA_TAG, SILENT_SLOPE } from '../../data/landingSample.js';
import { DigestPreview } from './DigestPreview.jsx';
import { SlopeChart } from './SlopeChart.jsx';

/**
 * SilentSlope Section — Benchmark vs Supplier Sourcing Analysis
 *
 * Explains the "Rockets & Feathers" pricing asymmetry where quotes rise fast
 * but fall slow, coupled with the daily mobile digest preview.
 */
export function SilentSlope() {
  const { verdictChip, stats, summary } = SILENT_SLOPE;

  return (
    <section id="supplier-benchmark" className="lp-section" aria-label="Supplier Pricing Asymmetry">
      <div className="lp-container">
        <div className="lp-section-header">
          <div className="lp-section-tag">Supplier Quote Benchmarking</div>
          <h2 className="lp-section-title">
            Unmask the <span className="lp-text-gradient">"Silent Slope"</span> in Quotes.
          </h2>
          <p className="lp-section-desc">
            When upstream benchmarks surge, vendors cite oil and mandi shortages to hike
            rates within days. But when commodity costs drop, quotes linger high for
            weeks. BMM provides grounded benchmark telemetry to negotiate lower prices.
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

              {/* Dual-line SVG Chart */}
              <div className="lp-slope-card__chart">
                <SlopeChart />
              </div>

              {/* Speed Stats Comparison Grid */}
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

              {/* Analysis Summary */}
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
