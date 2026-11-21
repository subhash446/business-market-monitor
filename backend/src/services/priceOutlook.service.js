'use strict';

/**
 * Directional Price Band & Outlook Engine (V3-M2 / Migration 032).
 *
 * Combines:
 *   1. Single-series price history (native quotes or benchmarks, never mixed).
 *   2. Date-gap normalized realized volatility with square-root scaling & clamps.
 *   3. Price momentum (MA7 vs MA30, or latest 3 vs full window for 5 <= N < 10).
 *   4. Structured news impact signals with recency decay & supply-chain proximity.
 *   5. Lazy deterministic fallback for legacy unscored news articles.
 *
 * Strict Guardrails:
 *   - Minimum 5 observations floor (fewer -> insufficientData: true).
 *   - Stale data suppression (> 30 days old -> isDataStale: true, confidence capped at LOW).
 *   - Strict single-currency & single-unit isolation.
 *   - Invariant: Low <= Mid <= High.
 */

const {
  EXPECTED_DIRECTION,
  CONFIDENCE_TIER,
  IMPACT_DIRECTION,
} = require('../constants/enums');
const newsImpactScorer = require('./newsImpactScorer.service');

const MIN_OBSERVATIONS = 5;
const MAX_14D_VOLATILITY = 0.18; // 18% max 14d swing
const MAX_30D_VOLATILITY = 0.28; // 28% max 30d swing
const MIN_DAILY_VOLATILITY = 0.012; // 1.2% daily volatility floor

/**
 * Compute days between two date strings or timestamps.
 */
function daysBetween(dateStrA, dateStrB) {
  const tA = new Date(dateStrA).getTime();
  const tB = new Date(dateStrB).getTime();
  if (isNaN(tA) || isNaN(tB)) return 1;
  const diffDays = Math.abs(tB - tA) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(diffDays));
}

/**
 * Isolate a single consistent price series sharing the same currency & unit (Tech Lead Refinement 1).
 */
function isolateSingleSeries(prices, fallbackUnit = null) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return { series: [], seriesSource: 'NONE', currency: 'INR', unit: fallbackUnit || 'unit' };
  }

  // Separate supplier quotes from benchmark/proxy prices
  const quotes = prices.filter(
    (p) => p.data_class === 'SUPPLIER_QUOTE' || p.source === 'MANUAL' || p.source === 'SUPPLIER_INTEGRATION'
  );
  const benchmarks = prices.filter(
    (p) => p.data_class === 'OFFICIAL_BENCHMARK' || p.data_class === 'MARKET_INDICATIVE' || (p.source !== 'MANUAL' && p.source !== 'SUPPLIER_INTEGRATION')
  );

  let chosen = [];
  let source = 'NONE';

  if (quotes.length >= MIN_OBSERVATIONS) {
    chosen = quotes;
    source = 'SUPPLIER_QUOTE';
  } else if (benchmarks.length >= MIN_OBSERVATIONS) {
    chosen = benchmarks;
    source = 'BENCHMARK';
  } else if (quotes.length > 0 && quotes.length >= benchmarks.length) {
    chosen = quotes;
    source = 'SUPPLIER_QUOTE';
  } else if (benchmarks.length > 0) {
    chosen = benchmarks;
    source = 'BENCHMARK';
  } else {
    chosen = prices;
    source = 'BENCHMARK';
  }

  // Isolate dominant currency
  const currCounts = new Map();
  for (const p of chosen) {
    const c = (p.currency || 'INR').toUpperCase();
    currCounts.set(c, (currCounts.get(c) || 0) + 1);
  }
  let dominantCurr = 'INR';
  let maxCount = -1;
  for (const [c, cnt] of currCounts.entries()) {
    if (cnt > maxCount) {
      maxCount = cnt;
      dominantCurr = c;
    }
  }

  // Filter chosen points to strictly share dominant currency
  const isolated = chosen.filter((p) => (p.currency || 'INR').toUpperCase() === dominantCurr);

  // Determine unit label
  const unit = isolated.find((p) => p.unit_label || p.unit)?.unit_label ||
               isolated.find((p) => p.unit_label || p.unit)?.unit ||
               fallbackUnit || 'unit';

  // Sort ascending by recordedAt (oldest to newest)
  isolated.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  return {
    series: isolated,
    seriesSource: source,
    currency: dominantCurr,
    unit,
  };
}

/**
 * Evaluate deterministic directional price bands and market outlook.
 *
 * @param {{
 *   prices: Array<object>,
 *   newsHeadlines?: Array<object>,
 *   kbImpact?: object|null,
 *   materialUnit?: string|null,
 *   materialName?: string|null,
 *   now?: string|Date,
 * }} options
 */
function evaluatePriceOutlook({
  prices = [],
  newsHeadlines = [],
  kbImpact = null,
  materialUnit = null,
  materialName = null,
  now = new Date(),
} = {}) {
  const evaluatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const evalDate = new Date(evaluatedAt);

  // 1. Single-Series Isolation Guardrail (Tech Lead Refinement 1)
  const { series, seriesSource, currency, unit } = isolateSingleSeries(prices, materialUnit);

  if (series.length < MIN_OBSERVATIONS) {
    return {
      insufficientData: true,
      dataPointCount: series.length,
      minimumRequired: MIN_OBSERVATIONS,
      reason: `Minimum ${MIN_OBSERVATIONS} historical price points required to calculate statistical volatility and directional bands.`,
      seriesSource,
      currency,
      unit,
      currentPrice: series.length > 0 ? Number(series[series.length - 1].price) : null,
      band14d: null,
      band30d: null,
      expectedDirection: EXPECTED_DIRECTION.RANGE_BOUND,
      confidenceTier: CONFIDENCE_TIER.LOW,
      confidenceScore: 0,
      confidenceDrivers: ['Insufficient historical price observations'],
      newsDrivers: [],
      isDataStale: false,
      disclaimer: 'Risk-adjusted statistical & news estimate — not a guaranteed price forecast.',
      evaluatedAt,
    };
  }

  // 2. Check Data Staleness
  const latestPoint = series[series.length - 1];
  const latestPrice = Number(latestPoint.price);
  const latestDate = new Date(latestPoint.recorded_at);
  const daysSinceLatest = Math.max(0, Math.round((evalDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)));
  const isDataStale = daysSinceLatest > 30;

  // 3. Date-Gap Normalized Volatility (Tech Lead Refinement 2)
  const returns = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevPrice = Number(series[i - 1].price);
    const currPrice = Number(series[i].price);
    if (prevPrice > 0) {
      const deltaDays = daysBetween(series[i - 1].recorded_at, series[i].recorded_at);
      const rawPctReturn = (currPrice - prevPrice) / prevPrice;
      // Normalize by sqrt(deltaDays) to avoid over-inflating daily variance on irregular/weekly series
      const normalizedDailyReturn = rawPctReturn / Math.sqrt(deltaDays);
      returns.push(normalizedDailyReturn);
    }
  }

  let dailyStdDev = MIN_DAILY_VOLATILITY;
  if (returns.length > 1) {
    const meanReturn = returns.reduce((acc, r) => acc + r, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
    dailyStdDev = Math.max(MIN_DAILY_VOLATILITY, Math.sqrt(variance));
  }

  // Scale volatility to 14d and 30d with sane clamps (Tech Lead Refinement 2)
  const vol14d = Math.min(MAX_14D_VOLATILITY, dailyStdDev * Math.sqrt(14));
  const vol30d = Math.min(MAX_30D_VOLATILITY, dailyStdDev * Math.sqrt(30));

  // 4. Momentum Calculation (handle 5 <= N < 10 gracefully)
  let momentumPct = 0;
  if (series.length >= 10) {
    const last7Prices = series.slice(-Math.min(7, series.length)).map((p) => Number(p.price));
    const ma7 = last7Prices.reduce((a, b) => a + b, 0) / last7Prices.length;
    const allPrices = series.map((p) => Number(p.price));
    const ma30 = allPrices.reduce((a, b) => a + b, 0) / allPrices.length;
    if (ma30 > 0) {
      momentumPct = ((ma7 - ma30) / ma30) * 100;
    }
  } else {
    // 5 <= N < 10: compare latest 3-point average vs full-window average
    const latest3 = series.slice(-3).map((p) => Number(p.price));
    const avgLatest3 = latest3.reduce((a, b) => a + b, 0) / latest3.length;
    const all = series.map((p) => Number(p.price));
    const avgAll = all.reduce((a, b) => a + b, 0) / all.length;
    if (avgAll > 0) {
      momentumPct = ((avgLatest3 - avgAll) / avgAll) * 100;
    }
  }
  // Clamp momentum to reasonable range [-15%, +15%]
  momentumPct = Math.max(-15, Math.min(15, Number(momentumPct.toFixed(2))));

  // 5. News Impact Scoring with Lazy Deterministic Fallback (Tech Lead Refinement 3)
  const scoredNews = [];
  let totalNewsImpact = 0;
  let countCostUpNews = 0;
  let countCostDownNews = 0;

  for (const article of (newsHeadlines || [])) {
    if (!article || typeof article !== 'object') continue;

    let impactDirection = article.impact_direction || article.impactDirection;
    let severityScore = article.severity_score || article.severityScore;
    let expectedLagDays = article.expected_lag_days || article.expectedLagDays;
    let impactRationale = article.impact_rationale || article.impactRationale;

    // Refinement 3: Lazy deterministic fallback if unscored
    if (!impactDirection) {
      const fallback = newsImpactScorer.scoreArticleDeterministic(article);
      impactDirection = fallback.impactDirection;
      severityScore = fallback.severityScore;
      expectedLagDays = fallback.expectedLagDays;
      impactRationale = fallback.impactRationale;
    }

    const pubDate = article.published_at || article.publishedAt || evaluatedAt;
    const articleAgeDays = Math.max(0, Math.round((evalDate.getTime() - new Date(pubDate).getTime()) / (1000 * 60 * 60 * 24)));

    // Recency decay within 30 days
    const ageWeight = Math.max(0.1, 1 - (articleAgeDays / 30));

    // Hop proximity weight
    let hopWeight = 0.75; // candidate news from industry/curated feed
    const titleLower = String(article.title || '').toLowerCase();
    if (materialName) {
      const mLower = String(materialName).toLowerCase();
      if (titleLower.includes(mLower)) {
        hopWeight = 1.0;
      } else {
        const tokens = mLower.split(/\s+/).filter((t) => t.length >= 4);
        if (tokens.some((t) => titleLower.includes(t))) {
          hopWeight = 0.9;
        }
      }
    } else if (kbImpact?.relevanceTerms && Array.isArray(kbImpact.relevanceTerms)) {
      for (const term of kbImpact.relevanceTerms) {
        if (titleLower.includes(String(term).toLowerCase())) {
          hopWeight = 0.9;
          break;
        }
      }
    }

    const dirMultiplier =
      impactDirection === IMPACT_DIRECTION.COST_UP ? 1 :
      impactDirection === IMPACT_DIRECTION.COST_DOWN ? -1 : 0;

    if (impactDirection === IMPACT_DIRECTION.COST_UP) countCostUpNews += 1;
    if (impactDirection === IMPACT_DIRECTION.COST_DOWN) countCostDownNews += 1;

    const netImpact = dirMultiplier * ((severityScore || 2) / 5) * ageWeight * hopWeight;
    totalNewsImpact += netImpact;

    scoredNews.push({
      id: article.id || null,
      title: article.title || 'Market News Update',
      url: article.url || null,
      sourceName: article.source_name || article.sourceName || null,
      publishedAt: pubDate,
      impactDirection,
      severityScore: severityScore || 1,
      expectedLagDays: expectedLagDays || 14,
      impactRationale: impactRationale || 'Evaluated market signal',
      ageDays: articleAgeDays,
      netScore: Number(netImpact.toFixed(3)),
    });
  }

  // Sort scored news by net magnitude descending, pick top 3
  scoredNews.sort((a, b) => Math.abs(b.netScore) - Math.abs(a.netScore));
  const topNewsDrivers = scoredNews.slice(0, 3);

  // Clamped news drift factor (at most +-5%)
  const newsDriftFactor = Math.tanh(totalNewsImpact) * 0.05;

  // 6. Midpoint and Directional Price Bands (Sane Clamps)
  const drift14dPct = Math.max(-8, Math.min(8, (momentumPct / 2) + (newsDriftFactor * 100 * (14 / 30))));
  const drift30dPct = Math.max(-15, Math.min(15, momentumPct + (newsDriftFactor * 100)));

  const mid14d = Number((latestPrice * (1 + (drift14dPct / 100))).toFixed(2));
  const mid30d = Number((latestPrice * (1 + (drift30dPct / 100))).toFixed(2));

  // Low <= Mid <= High invariant strictly enforced
  const low14d = Math.max(0.01, Number((mid14d * (1 - vol14d)).toFixed(2)));
  const high14d = Number((mid14d * (1 + vol14d)).toFixed(2));

  const low30d = Math.max(0.01, Number((mid30d * (1 - vol30d)).toFixed(2)));
  const high30d = Number((mid30d * (1 + vol30d)).toFixed(2));

  // 7. Expected Direction Classification
  let expectedDirection = EXPECTED_DIRECTION.RANGE_BOUND;
  if (drift14dPct >= 1.0 || drift30dPct >= 1.5 || (drift30dPct > 0.3 && countCostUpNews > countCostDownNews && totalNewsImpact >= 0.2)) {
    expectedDirection = EXPECTED_DIRECTION.UPWARD_PRESSURE;
  } else if (drift14dPct <= -1.0 || drift30dPct <= -1.5 || (drift30dPct < -0.3 && countCostDownNews > countCostUpNews && totalNewsImpact <= -0.2)) {
    expectedDirection = EXPECTED_DIRECTION.DOWNWARD_PRESSURE;
  }

  // 8. Confidence Scoring & Drivers
  let confidenceScore = Math.min(35, series.length * 3.5); // sample depth (up to 35)

  const confidenceDrivers = [];
  confidenceDrivers.push(`${series.length} price points evaluated across ${seriesSource === 'SUPPLIER_QUOTE' ? 'domestic supplier quotes' : 'market benchmark'}`);

  if (Math.abs(momentumPct) >= 2.0) {
    confidenceDrivers.push(`Price momentum is ${momentumPct > 0 ? 'bullish' : 'bearish'} (${momentumPct > 0 ? '+' : ''}${momentumPct}%)`);
  } else {
    confidenceDrivers.push('Price series is currently range-bound');
  }

  // Signal alignment bonus
  const momentumBullish = momentumPct >= 1.5;
  const momentumBearish = momentumPct <= -1.5;
  const newsBullish = totalNewsImpact >= 0.25 || (countCostUpNews > countCostDownNews && totalNewsImpact > 0);
  const newsBearish = totalNewsImpact <= -0.25 || (countCostDownNews > countCostUpNews && totalNewsImpact < 0);

  if ((momentumBullish && newsBullish) || (momentumBearish && newsBearish)) {
    confidenceScore += 30;
    confidenceDrivers.push('Price momentum and news impact signals are aligned');
  } else if ((momentumBullish && newsBearish) || (momentumBearish && newsBullish)) {
    confidenceScore -= 10;
    confidenceDrivers.push('Price momentum and news signals diverge (volatility expected)');
  } else if (countCostUpNews > 0 || countCostDownNews > 0) {
    confidenceScore += 15;
    confidenceDrivers.push(`${countCostUpNews + countCostDownNews} recent relevant news article(s) scored`);
  }

  // Volatility bonus
  if (dailyStdDev <= 0.025) {
    confidenceScore += 20;
    confidenceDrivers.push(`Market volatility is controlled (${(dailyStdDev * 100).toFixed(1)}% daily std dev)`);
  } else {
    confidenceDrivers.push(`Higher volatility detected (${(dailyStdDev * 100).toFixed(1)}% daily std dev)`);
  }

  // Recency bonus
  if (daysSinceLatest <= 3) {
    confidenceScore += 15;
  }

  confidenceScore = Math.max(10, Math.min(100, Math.round(confidenceScore)));

  // Stale data suppression
  if (isDataStale) {
    confidenceScore = Math.min(confidenceScore, 40);
    confidenceDrivers.unshift(`Notice: Latest price is ${daysSinceLatest} days old; outlook confidence downgraded`);
  }

  let confidenceTier = CONFIDENCE_TIER.LOW;
  if (confidenceScore >= 70) {
    confidenceTier = CONFIDENCE_TIER.HIGH;
  } else if (confidenceScore >= 45) {
    confidenceTier = CONFIDENCE_TIER.MODERATE;
  }

  return {
    insufficientData: false,
    expectedDirection,
    confidenceTier,
    confidenceScore,
    confidenceDrivers,
    currentPrice: latestPrice,
    currency,
    unit,
    seriesSource,
    dataPointCount: series.length,
    momentumPct,
    volatility14dPct: Number((vol14d * 100).toFixed(1)),
    volatility30dPct: Number((vol30d * 100).toFixed(1)),
    band14d: { low: low14d, mid: mid14d, high: high14d },
    band30d: { low: low30d, mid: mid30d, high: high30d },
    newsDrivers: topNewsDrivers,
    isDataStale,
    daysSinceLatest,
    disclaimer: 'Risk-adjusted statistical & news estimate — not a guaranteed price forecast.',
    evaluatedAt,
  };
}

module.exports = {
  evaluatePriceOutlook,
  isolateSingleSeries,
  daysBetween,
  MIN_OBSERVATIONS,
  MAX_14D_VOLATILITY,
  MAX_30D_VOLATILITY,
  MIN_DAILY_VOLATILITY,
};
