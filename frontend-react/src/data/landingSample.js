/**
 * Hand-Authored Realistic Sample Data for Public Landing Page
 * Business Market Monitor
 *
 * 100% Deterministic & Honest:
 * - Every dataset reflects authentic SME manufacturing dynamics in India
 * - All math matches stated deltas within 0.1%
 * - Fixed timestamps (no dynamic Date/random calls during render for SSR safety)
 */

export const SAMPLE_DATA_TAG = 'Sample data · illustrative';

/**
 * 30-day realistic price points for the Hero interactive comparison widget.
 * Math invariant: ((last / first) - 1) * 100 matches deltaPct within 0.1%.
 */
export const HERO_SERIES = {
  pet: {
    key: 'pet',
    name: 'PET Resin',
    ticker: 'PET-RESIN-IN',
    category: 'Polymer & Packaging',
    unit: 'INR/kg',
    currency: '₹',
    currencyCode: 'INR',
    firstPrice: 107.6,
    lastPrice: 114.5,
    deltaPct: 6.4,
    supplierQuote: '₹123.90',
    supplierQuoteNum: 123.90,
    benchmarkPrice: '₹114.50',
    benchmarkPriceNum: 114.50,
    supplierVariance: '+8.2% Premium',
    variancePct: 8.2,
    signal: 'ACCELERATE_PURCHASE',
    tone: 'act',
    rationale:
      'Upstream crude and naphtha pressures indicate domestic resin price revisions within 10-14 days. Secure current price or accelerate planned monthly buy before refinery hikes take effect.',
    points: [
      107.6, 107.9, 107.4, 108.0, 108.5, 108.2, 108.9, 109.4, 109.1, 109.8,
      110.2, 109.9, 110.5, 111.0, 110.7, 111.4, 111.8, 111.2, 112.0, 112.6,
      112.3, 113.0, 113.4, 112.9, 113.5, 113.8, 113.2, 114.0, 114.2, 114.5,
    ],
  },

  brent: {
    key: 'brent',
    name: 'Brent Crude (proxy)',
    ticker: 'BRENT',
    category: 'Global Upstream Precursor',
    unit: 'USD/bbl',
    currency: '$',
    currencyCode: 'USD',
    firstPrice: 79.84,
    lastPrice: 82.40,
    deltaPct: 3.2,
    supplierQuote: null,
    supplierQuoteNum: null,
    benchmarkPrice: '$82.40',
    benchmarkPriceNum: 82.40,
    supplierVariance: null,
    variancePct: null,
    signal: 'MONITOR_ONLY',
    tone: 'watch',
    rationale:
      'Global energy proxy. Upstream crude firming at $82.40/bbl transmits to domestic packaging and solvent derivatives with an observed 11-14 day delay.',
    points: [
      79.84, 80.10, 79.95, 80.35, 80.20, 80.65, 80.50, 80.90, 80.75, 81.10,
      80.95, 81.30, 81.15, 81.55, 81.40, 81.70, 81.50, 81.85, 81.60, 81.95,
      81.75, 82.10, 81.85, 82.05, 81.90, 82.20, 82.05, 82.35, 82.20, 82.40,
    ],
  },

  wheat: {
    key: 'wheat',
    name: 'Wheat (Indore mandi)',
    ticker: 'WHEAT_GOI',
    category: 'Agri Commodity (Agmarknet)',
    unit: 'INR/quintal',
    currency: '₹',
    currencyCode: 'INR',
    firstPrice: 2688,
    lastPrice: 2640,
    deltaPct: -1.8,
    supplierQuote: '₹2,710',
    supplierQuoteNum: 2710,
    benchmarkPrice: '₹2,640',
    benchmarkPriceNum: 2640,
    supplierVariance: '+2.7% Premium',
    variancePct: 2.7,
    signal: 'DELAY_PURCHASE',
    tone: 'hold',
    rationale:
      'Official wholesale mandi modal prices easing following steady rabi arrivals in Madhya Pradesh mandis. Supplier quote of ₹2,710 retains a 2.7% premium over modal wholesale rates; hold discretionary buys.',
    points: [
      2688, 2685, 2690, 2682, 2678, 2680, 2674, 2670, 2675, 2668,
      2665, 2670, 2662, 2658, 2660, 2655, 2652, 2656, 2650, 2648,
      2652, 2646, 2644, 2648, 2645, 2642, 2646, 2641, 2643, 2640,
    ],
  },
};

/**
 * 3-Node Interactive Upstream-to-Target Impact Flow
 */
export const IMPACT_FLOW = {
  nodes: [
    {
      id: 'node-brent',
      title: 'Brent Crude Oil',
      metric: '$82.40/bbl (+3.2%)',
      sublabel: 'Commodity Benchmark · EIA',
      type: 'COMMODITY',
      badge: 'Upstream Anchor',
      note: 'International crude benchmark. Transmits energy and cracking cost pressures downstream to petrochemical feedstocks.',
    },
    {
      id: 'node-naphtha',
      title: 'Naphtha & Freight',
      metric: '+4.1% 30d shift',
      sublabel: 'Intermediate Cost Driver',
      type: 'COST_DRIVER',
      badge: 'Refinery Spread',
      note: 'Naphtha cracker margins and coastal shipping fuel surcharges determine monomer pricing prior to polymer synthesis.',
    },
    {
      id: 'node-pet',
      title: 'PET Resin',
      metric: '₹114.50/kg (+6.4%)',
      sublabel: 'Tracked Raw Material',
      type: 'RAW_MATERIAL',
      badge: 'Plant Input',
      note: 'Bottle and packaging grade granules purchased by food, beverage, and plastic packaging converters.',
    },
  ],
  edges: [
    {
      from: 'node-brent',
      to: 'node-naphtha',
      type: 'STRUCTURAL',
      nature: 'dashed',
      label: 'Refinery Cost Driver',
      description: 'Structural knowledge base dependency: crude oil drives naphtha production cost.',
    },
    {
      from: 'node-naphtha',
      to: 'node-pet',
      type: 'OBSERVED',
      nature: 'solid',
      label: 'Observed · 11-day lag · r 0.71',
      description: 'Empirical telemetry: price shifts in naphtha correlate with domestic PET prices with an 11-day transmission lag.',
    },
  ],
};

/**
 * 24-Week Comparison of Pricing Asymmetry ("Silent Slope" / "Rockets & Feathers")
 */
export const SILENT_SLOPE = {
  verdictChip: 'SILENT SLOPE DETECTED',
  stats: {
    up: '92% in 6 days',
    down: '23% in 34 days',
    upLabel: 'Pass-through speed on benchmark rally',
    downLabel: 'Pass-through speed on benchmark crash',
  },
  summary:
    'Suppliers cite global crude and freight surges within 6 days to justify immediate invoice hikes. But when commodity benchmarks crash, supplier quotes only ease by 23% over 34 days — quietly pocketing the margin gap.',
  weeks: [
    { week: 1,  benchmark: 100, supplier: 100 },
    { week: 2,  benchmark: 103, supplier: 102 },
    { week: 3,  benchmark: 108, supplier: 107 },
    { week: 4,  benchmark: 118, supplier: 117 }, // Peak rally
    { week: 5,  benchmark: 124, supplier: 123 },
    { week: 6,  benchmark: 125, supplier: 125 }, // Top
    { week: 7,  benchmark: 119, supplier: 125 }, // Benchmark falls, quote stays pinned
    { week: 8,  benchmark: 112, supplier: 124 },
    { week: 9,  benchmark: 105, supplier: 124 },
    { week: 10, benchmark: 98,  supplier: 123 }, // Benchmark is back below start
    { week: 11, benchmark: 95,  supplier: 122 },
    { week: 12, benchmark: 94,  supplier: 121 },
    { week: 13, benchmark: 93,  supplier: 120 },
    { week: 14, benchmark: 94,  supplier: 119 },
    { week: 15, benchmark: 95,  supplier: 118 },
    { week: 16, benchmark: 93,  supplier: 117 },
    { week: 17, benchmark: 94,  supplier: 116 },
    { week: 18, benchmark: 96,  supplier: 116 },
    { week: 19, benchmark: 98,  supplier: 117 },
    { week: 20, benchmark: 100, supplier: 118 },
    { week: 21, benchmark: 102, supplier: 119 },
    { week: 22, benchmark: 101, supplier: 118 },
    { week: 23, benchmark: 99,  supplier: 117 },
    { week: 24, benchmark: 98,  supplier: 116 },
  ],
};

/**
 * Fixed deterministic morning procurement brief preview
 */
export const DIGEST_PREVIEW_SAMPLE = {
  fixedDateString: 'Tue 17 Nov · 7:00 AM',
  recipient: '+91 98200 12345 · Factory Procurement',
  title: 'AMIA Morning Procurement Digest',
  materials: [
    {
      name: 'PET Resin (Injection Grade)',
      benchmark: '₹114.50/kg (+6.4%)',
      supplierQuote: '₹123.90/kg',
      variance: '+8.2% vs Benchmark',
      action: 'ACCELERATE_PURCHASE',
      actionLabel: 'ACCELERATE PURCHASE',
      tone: 'act',
      urgency: 'Action recommended before Friday weekly supplier revisions.',
    },
    {
      name: 'Brent Crude Proxy Benchmark',
      benchmark: '$82.40/bbl (+3.2%)',
      supplierQuote: null,
      variance: 'Indicative Proxy',
      action: 'MONITOR_ONLY',
      actionLabel: 'MONITOR ONLY',
      tone: 'watch',
      urgency: 'Transmitting upward pressure to downstream packaging polymer.',
    },
    {
      name: 'Wheat (Indore Mandi Modal)',
      benchmark: '₹2,640/quintal (-1.8%)',
      supplierQuote: '₹2,710/quintal',
      variance: '+2.7% vs Benchmark',
      action: 'DELAY_PURCHASE',
      actionLabel: 'DELAY PURCHASE',
      tone: 'hold',
      urgency: 'Mandi arrivals firming. Hold non-critical buffer purchases.',
    },
  ],
};
