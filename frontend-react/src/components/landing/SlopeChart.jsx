import { useCallback, useMemo, useState } from 'react';
import { SILENT_SLOPE } from '../../data/landingSample.js';
import { nearestIndex, scaleLinear } from '../../lib/chartGeometry.js';

const WIDTH = 520;
const HEIGHT = 210;
const PAD = { top: 22, right: 16, bottom: 28, left: 16 };
const DIVERGE_START_IDX = 5; // Week 6 peak where benchmark cools and supplier quote stays high
const PEAK_GAP_IDX = 11; // Week 12 (Benchmark Plunge)

function pointsToLinePath(values, xScale, yScale) {
  if (!values.length) return '';
  return values
    .map((val, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(2)} ${yScale(val).toFixed(2)}`)
    .join(' ');
}

/**
 * SlopeChart — Interactive Dual-Line Rockets & Feathers Visualizer
 *
 * - Unified domain scale across benchmark and supplier curves
 * - Subtle breathing opacity shimmer on trapped-margin spread wedge + Week-12 pulse ring when idle
 * - Yields immediately to crisp static crosshair tracking on pointer scrub
 */
export function SlopeChart() {
  const weeks = SILENT_SLOPE.weeks;
  const n = weeks.length;
  const [hoverIdx, setHoverIdx] = useState(null);

  const benchmarkPoints = useMemo(() => weeks.map((w) => w.benchmark), [weeks]);
  const supplierPoints = useMemo(() => weeks.map((w) => w.supplier), [weeks]);

  const { xScale, yScale, benchmarkPath, supplierPath, spreadWedgePath } = useMemo(() => {
    const allVals = [...benchmarkPoints, ...supplierPoints];
    const yMin = allVals.length ? Math.min(...allVals) : 90;
    const yMax = allVals.length ? Math.max(...allVals) : 130;

    const xS = scaleLinear({
      domain: [0, Math.max(1, n - 1)],
      range: [PAD.left, WIDTH - PAD.right],
    });
    const yS = scaleLinear({
      domain: [yMin, yMax === yMin ? yMax + 1 : yMax],
      range: [HEIGHT - PAD.bottom, PAD.top],
    });

    const bPath = pointsToLinePath(benchmarkPoints, xS, yS);
    const sPath = pointsToLinePath(supplierPoints, xS, yS);

    let wedge = '';
    if (n > DIVERGE_START_IDX) {
      const topPts = [];
      const bottomPts = [];
      for (let i = DIVERGE_START_IDX; i < n; i += 1) {
        topPts.push(`${xS(i).toFixed(2)} ${yS(supplierPoints[i]).toFixed(2)}`);
      }
      for (let i = n - 1; i >= DIVERGE_START_IDX; i -= 1) {
        bottomPts.push(`${xS(i).toFixed(2)} ${yS(benchmarkPoints[i]).toFixed(2)}`);
      }
      wedge = `M ${topPts[0]} ${topPts
        .slice(1)
        .map((p) => `L ${p}`)
        .join(' ')} ${bottomPts.map((p) => `L ${p}`).join(' ')} Z`;
    }

    return {
      xScale: xS,
      yScale: yS,
      benchmarkPath: bPath,
      supplierPath: sPath,
      spreadWedgePath: wedge,
    };
  }, [benchmarkPoints, supplierPoints, n]);

  const handlePointerMove = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width) return;
      const clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
      const relX = ((clientX - rect.left) / rect.width) * WIDTH;
      const idx = nearestIndex(relX - PAD.left, n, WIDTH - PAD.left - PAD.right);
      setHoverIdx(idx);
    },
    [n]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverIdx(null);
  }, []);

  const activeWeek = hoverIdx !== null ? weeks[hoverIdx] : null;
  const activeX = hoverIdx !== null ? xScale(hoverIdx) : 0;
  const activeBenchmarkY = activeWeek ? yScale(activeWeek.benchmark) : 0;
  const activeSupplierY = activeWeek ? yScale(activeWeek.supplier) : 0;
  const gapPct =
    activeWeek && activeWeek.benchmark > 0
      ? ((activeWeek.supplier - activeWeek.benchmark) / activeWeek.benchmark) * 100
      : 0;

  const peakWeek = weeks[PEAK_GAP_IDX];
  const peakX = peakWeek ? xScale(PEAK_GAP_IDX) : 0;
  const peakBenchY = peakWeek ? yScale(peakWeek.benchmark) : 0;
  const peakSuppY = peakWeek ? yScale(peakWeek.supplier) : 0;

  return (
    <div className="lp-slope-chart-wrap">
      <div className="lp-slope-top-bar">
        <div className="lp-slope-legend">
          <div className="lp-slope-legend-item">
            <span className="lp-slope-legend-line lp-slope-legend-line--benchmark" />
            <span>Market Benchmark Index</span>
          </div>
          <div className="lp-slope-legend-item">
            <span className="lp-slope-legend-line lp-slope-legend-line--supplier" />
            <span>Supplier A Quote Index</span>
          </div>
          <div className="lp-slope-legend-item">
            <span className="lp-slope-legend-swatch--gap" />
            <span>Trapped Margin Spread</span>
          </div>
        </div>

        <span className="lp-slope-scrub-readout" data-testid="slope-scrub-readout">
          {activeWeek
            ? `W${activeWeek.week} · Bench ${activeWeek.benchmark} vs Quote ${activeWeek.supplier} (${
                gapPct >= 0 ? '+' : ''
              }${gapPct.toFixed(1)}% spread)`
            : 'Hover chart to inspect week spread'}
        </span>
      </div>

      <svg
        className="lp-slope-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="24-week comparison chart illustrating supplier pricing asymmetry: benchmark rises and falls, but supplier quote remains elevated."
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
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

        {/* Shaded Trapped Margin Wedge (gentle breathing shimmer when idle) */}
        {spreadWedgePath && (
          <path
            d={spreadWedgePath}
            fill="#f59e0b"
            className={`lp-slope-wedge ${activeWeek ? 'lp-slope-wedge--static' : 'lp-slope-wedge--breathing'}`}
            data-testid="slope-spread-wedge"
          />
        )}

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

        {/* Supplier line (Amber — stays sticky high) */}
        {supplierPath && (
          <path
            d={supplierPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}

        {/* Annotation Labels */}
        <text
          x={xScale(3)}
          y={PAD.top + 12}
          fill="#38bdf8"
          fontSize="9.5"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          Rally (W1&ndash;W6)
        </text>

        <text
          x={xScale(16)}
          y={yScale(106)}
          fill="#fbbf24"
          fontSize="10"
          fontWeight="600"
          fontFamily="var(--font-mono)"
          textAnchor="middle"
        >
          Margin Spread Trapped
        </text>

        {/* Idle Peak Week-12 Spread Pulse Marker */}
        {!activeWeek && peakWeek && (
          <g>
            <line
              x1={peakX}
              y1={peakSuppY}
              x2={peakX}
              y2={peakBenchY}
              stroke="rgba(245, 158, 11, 0.45)"
              strokeWidth="1.25"
              strokeDasharray="2 2"
            />
            <g transform={`translate(${peakX}, ${peakSuppY})`}>
              <circle
                r="4"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                className="lp-slope-peak-ring"
              />
              <circle r="3.5" fill="#f59e0b" stroke="#09090b" strokeWidth="1.2" />
            </g>
            <circle
              cx={peakX}
              cy={peakBenchY}
              r="3.5"
              fill="#38bdf8"
              stroke="#09090b"
              strokeWidth="1.2"
            />
          </g>
        )}

        {/* Interactive Scrubbing Crosshair & Snap Points */}
        {activeWeek && (
          <g>
            <line
              x1={activeX}
              y1={PAD.top}
              x2={activeX}
              y2={HEIGHT - PAD.bottom}
              stroke="rgba(255, 255, 255, 0.28)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <line
              x1={activeX}
              y1={activeSupplierY}
              x2={activeX}
              y2={activeBenchmarkY}
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
            <circle
              cx={activeX}
              cy={activeBenchmarkY}
              r="4"
              fill="#38bdf8"
              stroke="#09090b"
              strokeWidth="1.5"
            />
            <circle
              cx={activeX}
              cy={activeSupplierY}
              r="4"
              fill="#f59e0b"
              stroke="#09090b"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* X-axis labels */}
        <text
          x={PAD.left}
          y={HEIGHT - 7}
          fill="#9494a0"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          W1
        </text>
        <text
          x={WIDTH / 2}
          y={HEIGHT - 7}
          textAnchor="middle"
          fill="#9494a0"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          W12 (Benchmark Plunge)
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 7}
          textAnchor="end"
          fill="#9494a0"
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
