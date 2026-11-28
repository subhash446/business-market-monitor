import { useState } from 'react';
import { SAMPLE_DATA_TAG, SILENT_SLOPE } from '../../data/landingSample.js';
import { DigestPreview } from './DigestPreview.jsx';
import { RollingMetric } from './RollingMetric.jsx';
import { SlopeChart } from './SlopeChart.jsx';

function formatMonthlySpend(lakhs) {
  if (lakhs >= 100) {
    return `₹${(lakhs / 100).toFixed(2)} Cr / mo`;
  }
  return `₹${lakhs}L / mo`;
}

/**
 * SilentSlope Section — Chapter 02 Supplier Pricing Asymmetry & Digest
 *
 * Explains the "Rockets & Feathers" pricing asymmetry where quotes rise fast
 * but fall slow, paired with a monthly spend leak simulator and WhatsApp/Email brief.
 */
export function SilentSlope() {
  const { verdictChip, stats, summary } = SILENT_SLOPE;
  const [spendLakhs, setSpendLakhs] = useState(50);

  const spendIntensity = (spendLakhs - 10) / 190;
  const annualLeakLakhs = spendLakhs * 12 * 0.048;

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
            weeks. AI Market Intelligence Agent gives procurement teams benchmark proof before negotiating.
          </p>
        </div>

        <div className="lp-slope-grid">
          {/* Left Column: Asymmetry Graph, Speed Stats & Margin-Leak Simulator */}
          <div className="lp-slope-col">
            <div className="lp-slope-card lp-spotlight-card">
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
                <SlopeChart spendIntensity={spendIntensity} />
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

              {/* Interactive Spend-Synced Margin-Leak Simulator */}
              <div className="lp-leak-simulator" data-testid="leak-simulator">
                <div className="lp-leak-sim__top">
                  <div className="lp-leak-sim__input-meta">
                    <label htmlFor="monthly-spend-slider" className="lp-leak-sim__label">
                      Monthly Raw-Material Spend
                    </label>
                    <span className="lp-leak-sim__spend font-mono">
                      {formatMonthlySpend(spendLakhs)}
                    </span>
                  </div>

                  <div className="lp-leak-sim__output">
                    <span className="lp-leak-sim__output-label">Est. Annual Margin Leak</span>
                    <RollingMetric
                      value={annualLeakLakhs}
                      prefix="₹"
                      suffix="L / yr"
                      decimals={1}
                      durationMs={220}
                      className="lp-leak-sim__output-val font-mono"
                      testId="annual-leak-value"
                    />
                  </div>
                </div>

                <input
                  id="monthly-spend-slider"
                  type="range"
                  min={10}
                  max={200}
                  step={5}
                  value={spendLakhs}
                  onChange={(e) => setSpendLakhs(Number(e.target.value))}
                  className="lp-leak-slider"
                  style={{ '--slider-pct': `${(spendIntensity * 100).toFixed(1)}%` }}
                />

                <div className="lp-leak-sim__scale font-mono" aria-hidden="true">
                  <span>₹10L/mo</span>
                  <span>₹50L/mo</span>
                  <span>₹1 Cr/mo</span>
                  <span>₹2 Cr/mo</span>
                </div>

                <div className="lp-leak-sim__disclaimer">
                  Illustrative estimate &middot; 4.8% avg asymmetric pass-through lag
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
