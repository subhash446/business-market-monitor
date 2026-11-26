/**
 * LandingTicker — Seamless 36px Procurement Telemetry Marquee
 *
 * - Displays illustrative procurement market telemetry in JetBrains Mono (tabular-nums)
 * - Uses procurement color semantics (rising cost = amber, falling cost = emerald)
 * - Duplicated track inside overflow-hidden + edge fade mask; pauses on hover/focus
 * - 100% deterministic SSR & zero horizontal overflow down to 360px
 */

const TICKER_ITEMS = [
  {
    id: 'pet',
    label: 'PET RESIN',
    value: '₹114.50/kg (+6.4%)',
    tone: 'up',
  },
  {
    id: 'brent',
    label: 'BRENT CRUDE',
    value: '$82.40/bbl (+3.2%)',
    tone: 'up',
  },
  {
    id: 'wheat',
    label: 'WHEAT INDORE',
    value: '₹2,640/qtl (-1.8%)',
    tone: 'down',
  },
  {
    id: 'naphtha',
    label: 'NAPHTHA & FREIGHT',
    value: '(+4.1% · 11d lag)',
    tone: 'up',
  },
  {
    id: 'gap',
    label: 'SUPPLIER QUOTE GAP',
    value: '+8.2% PREMIUM',
    tone: 'severe',
  },
  {
    id: 'feed',
    label: 'ILLUSTRATIVE MARKET FEED',
    value: 'SAMPLE TELEMETRY',
    tone: 'muted',
  },
];

function TickerTrack({ ariaHidden = false }) {
  return (
    <div className="lp-ticker__group" aria-hidden={ariaHidden || undefined}>
      {TICKER_ITEMS.map((item) => (
        <div key={item.id} className="lp-ticker__item">
          <span className="lp-ticker__label">{item.label}</span>
          <span className={`lp-ticker__val lp-ticker__val--${item.tone}`}>
            {item.value}
          </span>
          <span className="lp-ticker__sep" aria-hidden="true">/</span>
        </div>
      ))}
    </div>
  );
}

export function LandingTicker() {
  return (
    <div
      className="lp-ticker"
      id="market-ticker"
      role="region"
      aria-label="Illustrative Commodity Telemetry Ticker"
    >
      <div className="lp-ticker__track">
        <TickerTrack />
        <TickerTrack ariaHidden />
      </div>
    </div>
  );
}
