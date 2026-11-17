import { useCallback, useId, useMemo, useState } from 'react';
import {
  buildAreaPath,
  buildLinePath,
  nearestIndex,
  scaleLinear,
} from '../../lib/chartGeometry.js';

const WIDTH = 560;
const HEIGHT = 220;
const PAD = { top: 24, right: 20, bottom: 28, left: 20 };

/**
 * PriceChart — Pure SVG interactive chart
 *
 * Accessible:
 * - role="img" with descriptive aria-label
 * - Visually hidden data table for screen readers
 * - 250ms line transition (disabled under prefers-reduced-motion)
 * - Pointer scrubbing with floating crosshair and tooltip
 */
export function PriceChart({ series, onScrub = null }) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState(null);

  const points = series?.points ?? [];
  const n = points.length;

  const yMin = useMemo(() => (n ? Math.min(...points) : 0), [points, n]);
  const yMax = useMemo(() => (n ? Math.max(...points) : 100), [points, n]);

  const linePath = useMemo(() => buildLinePath(points, WIDTH, HEIGHT, PAD), [points]);
  const areaPath = useMemo(() => buildAreaPath(points, WIDTH, HEIGHT, PAD), [points]);

  const xScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, Math.max(1, n - 1)],
        range: [PAD.left, WIDTH - PAD.right],
      }),
    [n]
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [yMin, yMax === yMin ? yMin + 1 : yMax],
        range: [HEIGHT - PAD.bottom, PAD.top],
      }),
    [yMin, yMax]
  );

  const activeIdx = hoverIdx !== null ? hoverIdx : n - 1;
  const activeVal = points[activeIdx] ?? 0;
  const activeX = n > 0 ? xScale(activeIdx) : 0;
  const activeY = n > 0 ? yScale(activeVal) : 0;

  const handlePointerMove = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width) return;
      const clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
      const relX = ((clientX - rect.left) / rect.width) * WIDTH;
      const idx = nearestIndex(relX - PAD.left, n, WIDTH - PAD.left - PAD.right);
      setHoverIdx(idx);
      onScrub?.(idx, points[idx]);
    },
    [n, onScrub, points]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverIdx(null);
    onScrub?.(null, null);
  }, [onScrub]);

  // Subtle reference grid lines
  const gridYs = [
    PAD.top,
    PAD.top + (HEIGHT - PAD.top - PAD.bottom) * 0.5,
    HEIGHT - PAD.bottom,
  ];

  const strokeColor =
    series.tone === 'act'
      ? 'var(--lp-cost-up, #f59e0b)'
      : series.tone === 'hold'
      ? 'var(--lp-cost-down, #34d399)'
      : 'var(--lp-primary, #38bdf8)';

  const fillColor =
    series.tone === 'act'
      ? 'rgba(245, 158, 11, 0.12)'
      : series.tone === 'hold'
      ? 'rgba(52, 211, 153, 0.12)'
      : 'rgba(56, 189, 248, 0.12)';

  // Tooltip positioning clamps
  const tooltipWidth = 100;
  const tooltipX = Math.min(
    Math.max(activeX - tooltipWidth / 2, PAD.left),
    WIDTH - PAD.right - tooltipWidth
  );
  const tooltipY = Math.max(activeY - 44, 4);

  return (
    <div className="lp-chart-wrap">
      <svg
        className="lp-price-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Price trend chart for ${series.name}. 30-day movement: ${series.deltaPct > 0 ? '+' : ''}${series.deltaPct}%`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="90%" stopColor={strokeColor} stopOpacity="0.00" />
          </linearGradient>
        </defs>

        {/* Horizontal reference grid lines */}
        {gridYs.map((gy, i) => (
          <line
            key={i}
            x1={PAD.left}
            y1={gy}
            x2={WIDTH - PAD.right}
            y2={gy}
            stroke="rgba(255, 255, 255, 0.06)"
            strokeDasharray="3 3"
          />
        ))}

        {/* Filled area under curve */}
        {areaPath && (
          <path d={areaPath} fill={`url(#${gradientId})`} className="lp-chart-area" />
        )}

        {/* Main trend line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lp-chart-line"
          />
        )}

        {/* Pointer crosshair line */}
        {hoverIdx !== null && (
          <line
            x1={activeX}
            y1={PAD.top}
            x2={activeX}
            y2={HEIGHT - PAD.bottom}
            stroke="rgba(255, 255, 255, 0.25)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}

        {/* Active data point circle */}
        {n > 0 && (
          <g transform={`translate(${activeX}, ${activeY})`}>
            <circle r="7" fill={fillColor} />
            <circle r="4" fill={strokeColor} stroke="#09090b" strokeWidth="1.5" />
          </g>
        )}

        {/* SVG Tooltip */}
        {hoverIdx !== null && (
          <g transform={`translate(${tooltipX}, ${tooltipY})`} className="lp-chart-tooltip">
            <rect
              width={tooltipWidth}
              height="36"
              rx="6"
              fill="#18181b"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="1"
            />
            <text
              x="10"
              y="15"
              fill="#a1a1aa"
              fontSize="10"
              fontFamily="var(--font-mono)"
            >
              Day {activeIdx + 1} of 30
            </text>
            <text
              x="10"
              y="29"
              fill="#f4f4f5"
              fontSize="12"
              fontWeight="600"
              fontFamily="var(--font-mono)"
            >
              {series.currency}
              {activeVal.toFixed(2)}
            </text>
          </g>
        )}

        {/* Baseline axis label */}
        <text
          x={PAD.left}
          y={HEIGHT - 8}
          fill="#71717a"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          Day 1 (30d ago)
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
          textAnchor="end"
          fill="#71717a"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          Day 30 (Latest)
        </text>
      </svg>

      {/* Accessible data table for screen readers */}
      <div className="lp-sr-only">
        <table>
          <caption>{`30-day price records for ${series.name} (${series.unit})`}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Price ({series.unit})</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, idx) => (
              <tr key={idx}>
                <td>Day {idx + 1}</td>
                <td>
                  {series.currency}
                  {p.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
