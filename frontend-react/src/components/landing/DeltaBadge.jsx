/**
 * DeltaBadge Component
 *
 * Enforces Procurement Color Logic for Raw Material Buyers:
 * - Rising cost is bad (Amber #f59e0b, severe #f87171)
 * - Falling cost is good (Emerald #34d399)
 */

export function DeltaBadge({ deltaPct, period = '30d', className = '' }) {
  const isUp = deltaPct > 0;
  const isSevere = deltaPct >= 5.0;
  const isDown = deltaPct < 0;

  const modifier = isSevere
    ? 'lp-delta-badge--severe'
    : isUp
    ? 'lp-delta-badge--up'
    : isDown
    ? 'lp-delta-badge--down'
    : 'lp-delta-badge--neutral';

  const sign = isUp ? '+' : '';
  const formatted = `${sign}${deltaPct.toFixed(1)}%`;

  return (
    <span className={`lp-delta-badge ${modifier} ${className}`}>
      <span className="lp-delta-badge__arrow" aria-hidden="true">
        {isUp ? '▲' : isDown ? '▼' : '■'}
      </span>
      <span className="lp-delta-badge__value">{formatted}</span>
      {period && <span className="lp-delta-badge__period">{period}</span>}
    </span>
  );
}
