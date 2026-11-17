/**
 * SignalPill Component
 *
 * Renders exact backend ACTION_RECOMMENDATION enums:
 * - ACCELERATE_PURCHASE
 * - MONITOR_ONLY
 * - DELAY_PURCHASE
 */

export function SignalPill({ signal, className = '' }) {
  const normalized = signal || 'MONITOR_ONLY';
  const label = normalized.replace(/_/g, ' ');

  const modifier =
    normalized === 'ACCELERATE_PURCHASE'
      ? 'lp-signal-pill--accelerate'
      : normalized === 'DELAY_PURCHASE'
      ? 'lp-signal-pill--delay'
      : 'lp-signal-pill--monitor';

  return (
    <span className={`lp-signal-pill ${modifier} ${className}`}>
      <span className="lp-signal-pill__dot" aria-hidden="true" />
      <span className="lp-signal-pill__label">{label}</span>
    </span>
  );
}
