'use strict';

/**
 * Unit & Contract tests for Directional Price Outlook & Bands Engine (V3-M2).
 *
 * Enforces all 4 Mandatory Tech Lead Refinements:
 *   1. Single-Series Isolation Guardrail: Never mixes INR quotes with USD proxies.
 *   2. Date-gap normalized volatility, sane band clamps (Low <= Mid <= High), and 5 <= N < 10 momentum.
 *   3. Lazy deterministic fallback for legacy unscored news articles.
 *   4. Deterministic evaluation and transparency guardrails.
 */

const priceOutlookService = require('../src/services/priceOutlook.service');
const {
  EXPECTED_DIRECTION,
  CONFIDENCE_TIER,
  IMPACT_DIRECTION,
} = require('../src/constants/enums');

describe('priceOutlook.service — Directional Price Bands & Outlook Engine (V3-M2)', () => {
  const FIXED_EVAL_DATE = '2026-11-20T10:00:00.000Z';

  function generatePrices(count, startPrice = 100, trendStep = 1, options = {}) {
    const prices = [];
    const baseDate = new Date('2026-11-19T00:00:00.000Z');
    const currency = options.currency || 'INR';
    const unitLabel = options.unitLabel || 'kg';
    const dataClass = options.dataClass || 'SUPPLIER_QUOTE';
    const source = options.source || 'MANUAL';

    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(baseDate.getTime() - (i * 24 * 60 * 60 * 1000));
      prices.push({
        id: 1000 + i,
        price: Number((startPrice + ((count - 1 - i) * trendStep)).toFixed(2)),
        recorded_at: d.toISOString().split('T')[0],
        currency,
        unit_label: unitLabel,
        data_class: dataClass,
        source,
        is_valid: true,
      });
    }
    return prices;
  }

  describe('1. Single-Series Isolation Guardrail (Tech Lead Refinement 1)', () => {
    test('isolates native SUPPLIER_QUOTE series when >= 5 quotes exist, ignoring mixed USD benchmark proxies', () => {
      const quotes = generatePrices(6, 120, 1.5, { currency: 'INR', unitLabel: 'kg', dataClass: 'SUPPLIER_QUOTE', source: 'MANUAL' });
      const proxies = generatePrices(6, 75, -0.5, { currency: 'USD', unitLabel: 'bbl', dataClass: 'MARKET_INDICATIVE', source: 'EIA' });

      // Intentionally interleave quotes and proxies
      const mixed = [...quotes, ...proxies];

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices: mixed,
        materialUnit: 'kg',
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.insufficientData).toBe(false);
      expect(outlook.seriesSource).toBe('SUPPLIER_QUOTE');
      expect(outlook.currency).toBe('INR');
      expect(outlook.unit).toBe('kg');
      expect(outlook.dataPointCount).toBe(6);
      expect(outlook.currentPrice).toBe(quotes[quotes.length - 1].price);
    });

    test('falls back to single-currency BENCHMARK series when < 5 supplier quotes exist', () => {
      const quotes = generatePrices(2, 120, 1.0, { currency: 'INR', unitLabel: 'kg', dataClass: 'SUPPLIER_QUOTE' });
      const benchmarks = generatePrices(12, 2600, 10, { currency: 'INR', unitLabel: 'quintal', dataClass: 'OFFICIAL_BENCHMARK', source: 'DATA_GOV_IN' });

      const mixed = [...quotes, ...benchmarks];

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices: mixed,
        materialUnit: 'quintal',
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.insufficientData).toBe(false);
      expect(outlook.seriesSource).toBe('BENCHMARK');
      expect(outlook.currency).toBe('INR');
      expect(outlook.unit).toBe('quintal');
      expect(outlook.dataPointCount).toBe(12);
    });
  });

  describe('2. Date-Gap Normalized Volatility & Sane Band Clamps (Tech Lead Refinement 2)', () => {
    test('normalizes returns by sqrt(deltaDays) for irregular/weekly price points without blowup', () => {
      // 5 points spaced 7 days apart (weekly logs)
      const irregularPrices = [
        { price: 100, recorded_at: '2026-10-01', currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE' },
        { price: 104, recorded_at: '2026-10-08', currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE' },
        { price: 102, recorded_at: '2026-10-15', currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE' },
        { price: 106, recorded_at: '2026-10-22', currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE' },
        { price: 105, recorded_at: '2026-10-29', currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE' },
      ];

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices: irregularPrices,
        now: '2026-10-30T10:00:00Z',
      });

      expect(outlook.insufficientData).toBe(false);
      expect(outlook.volatility14dPct).toBeLessThanOrEqual(18); // clamped <= 18%
      expect(outlook.volatility30dPct).toBeLessThanOrEqual(28); // clamped <= 28%
      expect(outlook.band14d.low).toBeLessThanOrEqual(outlook.band14d.mid);
      expect(outlook.band14d.mid).toBeLessThanOrEqual(outlook.band14d.high);
    });

    test('handles 5 <= N < 10 observations gracefully using latest 3 vs full-window momentum', () => {
      // Exactly 6 price points with upward trend
      const prices = generatePrices(6, 100, 3.0, { currency: 'INR', unitLabel: 'kg' });

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices,
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.insufficientData).toBe(false);
      expect(outlook.dataPointCount).toBe(6);
      expect(outlook.momentumPct).toBeGreaterThan(0);
      expect(outlook.expectedDirection).toBe(EXPECTED_DIRECTION.UPWARD_PRESSURE);
    });

    test('enforces strict mathematical invariant Low <= Mid <= High for both 14d and 30d bands', () => {
      const prices = generatePrices(15, 2500, -15, { currency: 'INR', unitLabel: 'quintal' });

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices,
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.band14d.low).toBeLessThanOrEqual(outlook.band14d.mid);
      expect(outlook.band14d.mid).toBeLessThanOrEqual(outlook.band14d.high);

      expect(outlook.band30d.low).toBeLessThanOrEqual(outlook.band30d.mid);
      expect(outlook.band30d.mid).toBeLessThanOrEqual(outlook.band30d.high);

      // 30d range is wider than 14d range due to sqrt(30) > sqrt(14)
      const width14d = outlook.band14d.high - outlook.band14d.low;
      const width30d = outlook.band30d.high - outlook.band30d.low;
      expect(width30d).toBeGreaterThanOrEqual(width14d);
    });
  });

  describe('3. Ingestion Wiring + Lazy Deterministic Fallback (Tech Lead Refinement 3)', () => {
    test('lazily scores legacy unscored news items on the fly and integrates their direction', () => {
      const prices = generatePrices(10, 100, 0, { currency: 'INR', unitLabel: 'kg' });

      // Legacy news row without impact_direction
      const legacyNews = [
        {
          id: 501,
          title: 'Severe polymer export ban and plant shutdown in major producing hub',
          summary: 'Force majeure declared as raw material supply crunch intensifies.',
          published_at: '2026-11-18T08:00:00Z',
          impact_direction: null, // Legacy row
        },
      ];

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices,
        newsHeadlines: legacyNews,
        materialName: 'Polymer Granules',
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.newsDrivers).toHaveLength(1);
      const scoredDriver = outlook.newsDrivers[0];
      expect(scoredDriver.impactDirection).toBe(IMPACT_DIRECTION.COST_UP);
      expect(scoredDriver.severityScore).toBeGreaterThanOrEqual(4);
      expect(outlook.expectedDirection).toBe(EXPECTED_DIRECTION.UPWARD_PRESSURE);
    });

    test('uses already scored news metadata directly when available', () => {
      const prices = generatePrices(10, 100, 0, { currency: 'INR', unitLabel: 'kg' });

      const preScoredNews = [
        {
          id: 502,
          title: 'Record sugar harvest reported across Maharashtra mills',
          impact_direction: 'COST_DOWN',
          severity_score: 4,
          expected_lag_days: 21,
          impact_rationale: 'Bumper crop easing mandi supplies',
          published_at: '2026-11-17T08:00:00Z',
        },
      ];

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices,
        newsHeadlines: preScoredNews,
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.newsDrivers).toHaveLength(1);
      expect(outlook.newsDrivers[0].impactDirection).toBe('COST_DOWN');
      expect(outlook.expectedDirection).toBe(EXPECTED_DIRECTION.DOWNWARD_PRESSURE);
    });
  });

  describe('4. Guardrails & Confidence Scoring', () => {
    test('returns insufficientData: true when observations < 5', () => {
      const fewPrices = generatePrices(4, 100, 1.0);

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices: fewPrices,
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.insufficientData).toBe(true);
      expect(outlook.dataPointCount).toBe(4);
      expect(outlook.minimumRequired).toBe(5);
      expect(outlook.band14d).toBeNull();
      expect(outlook.band30d).toBeNull();
      expect(outlook.confidenceTier).toBe(CONFIDENCE_TIER.LOW);
    });

    test('caps confidence at LOW when latest price is > 30 days old (stale data suppression)', () => {
      // Old prices from September 2026 evaluated in November 2026
      const oldPrices = generatePrices(15, 100, 1.0).map((p) => ({
        ...p,
        recorded_at: '2026-09-01',
      }));

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices: oldPrices,
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.insufficientData).toBe(false);
      expect(outlook.isDataStale).toBe(true);
      expect(outlook.confidenceTier).toBe(CONFIDENCE_TIER.LOW);
      expect(outlook.confidenceScore).toBeLessThanOrEqual(45);
      expect(outlook.confidenceDrivers[0]).toContain('Notice: Latest price is');
    });

    test('awards HIGH confidence tier when sample depth, signal alignment, and low volatility concur', () => {
      // 20 points with strong upward momentum
      const prices = generatePrices(20, 100, 2.0);

      const alignedNews = [
        {
          id: 601,
          title: 'Refinery fire triggers supply crunch and price hike',
          impact_direction: 'COST_UP',
          severity_score: 4,
          published_at: '2026-11-19T00:00:00Z',
        },
      ];

      const outlook = priceOutlookService.evaluatePriceOutlook({
        prices,
        newsHeadlines: alignedNews,
        now: FIXED_EVAL_DATE,
      });

      expect(outlook.insufficientData).toBe(false);
      expect(outlook.expectedDirection).toBe(EXPECTED_DIRECTION.UPWARD_PRESSURE);
      expect(outlook.confidenceTier).toBe(CONFIDENCE_TIER.HIGH);
      expect(outlook.confidenceScore).toBeGreaterThanOrEqual(70);
      expect(outlook.confidenceDrivers.some((d) => d.includes('aligned'))).toBe(true);
    });
  });
});
