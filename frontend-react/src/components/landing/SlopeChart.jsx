import { useMemo } from 'react';
import { SILENT_SLOPE } from '../../data/landingSample.js';
import { buildLinePath } from '../../lib/chartGeometry.js';

const WIDTH = 520;
const HEIGHT = 200;
const PAD = { top: 20, right: 16, bottom: 28, left: 16 };

/**
 * SlopeChart — Dual-line comparison showing Rockets & Feathers asymmetry
 */
export function SlopeChart() {
  const weeks = SILENT_SLOPE.weeks;

  const benchmarkPoints = useMemo(() => weeks.map((w) => w.benchmark), [weeks]);
  const supplierPoints = useMemo(() => weeks.map((w) => w.supplier), [weeks]);

  // Custom paths with identical domain bounds
  const benchmarkPath = useMemo(() => {
    return buildLinePath(benchmarkPoints, WIDTH, HEIGHT, PAD);
  }, [benchmarkPoints]);

  const supplierPath = useMemo(() => {
    return buildLinePath(supplierPoints, WIDTH, HEIGHT, PAD);
  }, [supplierPoints]);

  return (
    <div className="lp-slope-chart-wrap">
      {/* Legend bar */}
      <div className="lp-slope-legend">
        <div className="lp-slope-legend-item">
          <span className="lp-slope-legend-line lp-slope-legend-line--benchmark" />
          <span>Market Benchmark Index</span>
        </div>
        <div className="lp-slope-legend-item">
          <span className="lp-slope-legend-line lp-slope-legend-line--supplier" />
          <span>Supplier A Quote Index</span>
        </div>
      </div>

      <svg
        className="lp-slope-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="24-week comparison chart illustrating supplier pricing asymmetry: benchmark rises and falls, but supplier quote remains elevated."
      >
        {/* Horizontal grid lines */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={WIDTH - PAD.right}
          y2={PAD.top}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeDasharray="3 3"
        />
        <line
          x1={PAD.left}
          y1={HEIGHT / 2}
          x2={WIDTH - PAD.right}
          y2={HEIGHT / 2}
          stroke="rgba(255, 255, 255, 0.05)"
          strokeDasharray="3 3"
        />
        <line
          x1={PAD.left}
          y1={HEIGHT - PAD.bottom}
          x2={WIDTH - PAD.right}
          y2={HEIGHT - PAD.bottom}
          stroke="rgba(255, 255, 255, 0.08)"
        />

        {/* Benchmark line (Cyan) */}
        {benchmarkPath && (
          <path
            d={benchmarkPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
        )}

        {/* Supplier line (Amber/Coral — stays sticky high) */}
        {supplierPath && (
          <path
            d={supplierPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}

        {/* Annotation Marker: Rally Zone */}
        <text
          x={110}
          y={PAD.top + 14}
          fill="#38bdf8"
          fontSize="9"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          Rally (Week 1–6)
        </text>

        {/* Annotation Marker: Asymmetric Spread */}
        <text
          x={360}
          y={PAD.top + 35}
          fill="#f59e0b"
          fontSize="10"
          fontWeight="600"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          Margin Spread Trapped
        </text>

        {/* X-axis labels */}
        <text
          x={PAD.left}
          y={HEIGHT - 8}
          fill="#71717a"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          W1
        </text>
        <text
          x={WIDTH / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          fill="#71717a"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          W12 (Benchmark Plunge)
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
          textAnchor="end"
          fill="#71717a"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          W24
        </text>
      </svg>

      {/* Accessible data table for screen readers */}
      <div className="lp-sr-only">
        <table>
          <caption>24-Week Benchmark vs Supplier Quote Price Trajectory</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Benchmark Index</th>
              <th scope="col">Supplier Quote Index</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td>Week {w.week}</td>
                <td>{w.benchmark}</td>
                <td>{w.supplier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
