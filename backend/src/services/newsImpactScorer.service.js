'use strict';

/**
 * News Impact Scorer Service (V3-M2 / Migration 032).
 *
 * Classifies news articles into structured procurement impact metadata:
 *   - impact_direction: 'COST_UP' | 'COST_DOWN' | 'NEUTRAL'
 *   - severity_score: 1 to 5 (1 = negligible ripple, 5 = severe disruption/black swan)
 *   - expected_lag_days: transmission lag (7, 14, 21, or 30 days)
 *   - impact_rationale: concise 1-sentence explanation of cost driver
 *   - scoring_method: 'DETERMINISTIC_HEURISTIC' | 'AI_ASSISTED'
 *   - impact_scored_at: ISO timestamp
 *
 * Invariants:
 *   - 100% deterministic heuristic fallback that runs offline/in tests without network or LLM.
 *   - Title keywords weighted 2.0x; summary keywords weighted 1.0x.
 *   - Category-aware transmission lag (energy/freight = 7d, policy/tariffs = 14d, agro/harvest = 21d).
 */

const { IMPACT_DIRECTION, SCORING_METHOD } = require('../constants/enums');

// Cost-Up High Severity (severity 4-5)
const COST_UP_HIGH = [
  'force majeure', 'plant shutdown', 'refinery fire', 'explosion', 'export ban',
  'import ban', 'sanctions', 'embargo', 'war', 'conflict', 'missile strike',
  'port congestion', 'worker strike', 'labor strike', 'supply crunch', 'severe shortage',
  'critical deficit', 'drought', 'crop failure', 'anti-dumping duty', 'tariff hike',
  'tariff hikes', 'duty hike', 'duty hikes', 'duty increase', 'duty increases',
  'hikes duty', 'hike duty', 'hikes tariff', 'hike tariff', 'import duty hike',
  'freight surge', 'crude spike', 'production halt', 'factory fire',
];

// Cost-Up Moderate Severity (severity 2-3)
const COST_UP_MODERATE = [
  'price hike', 'price increase', 'prices rise', 'prices rose', 'prices jump',
  'cost increase', 'upward revision', 'higher rates', 'input cost surge',
  'inflation', 'supply constraint', 'tight supply', 'production cut', 'opec cut',
  'output decline', 'curtailed output', 'curtailed production', 'freight hike',
  'shipping delay', 'logistics bottleneck', 'higher demand',
];

// Cost-Down High Severity (severity 4-5)
const COST_DOWN_HIGH = [
  'bumper crop', 'record harvest', 'record production', 'record output',
  'duty cut', 'duty cuts', 'tariff cut', 'tariff cuts', 'cuts duty', 'cut duty',
  'cuts tariff', 'cut tariff', 'cuts import duty', 'cut import duty',
  'import duty cut', 'import duty cuts', 'import duty slashed', 'slashes import duty',
  'slashed import duty', 'tariff reduction', 'windfall tax cut',
  'export quota increase', 'massive surplus', 'supply glut', 'price crash',
  'price plunge', 'demand collapse', 'oversupply',
];

// Cost-Down Moderate Severity (severity 2-3)
const COST_DOWN_MODERATE = [
  'price cut', 'price drop', 'prices fall', 'prices fell', 'prices decline',
  'cost reduction', 'downward revision', 'softening prices', 'cooling prices',
  'cooling rates', 'easing supply', 'inventory rebound', 'demand slowdown',
  'sluggish demand', 'higher imports', 'subsidy announced', 'discounts offered',
];

// Neutral / Routine
const NEUTRAL_TERMS = [
  'mou signed', 'quarterly results', 'annual report', 'routine meeting',
  'board meeting', 'appointment', 'tender invited', 'steady prices',
  'flat prices', 'unchanged', 'range-bound', 'neutral outlook',
];

// Category markers for lag estimation
const CATEGORY_ENERGY_FREIGHT = [
  'crude', 'oil', 'brent', 'wti', 'fuel', 'petrol', 'diesel', 'freight',
  'shipping', 'port congestion', 'port strike', 'port closure', 'sea port', 'dry port',
  'strike', 'fire', 'explosion', 'refinery', 'naphtha',
];

const CATEGORY_POLICY_TARIFF = [
  'tariff', 'duty', 'tax', 'gst', 'msp', 'subsidy', 'ban', 'quota',
  'policy', 'regulation', 'anti-dumping', 'government',
];

const CATEGORY_AGRO_CROP = [
  'wheat', 'sugar', 'mustard', 'edible oil', 'crop', 'harvest', 'monsoon',
  'drought', 'acreage', 'sowing', 'mandi', 'grain',
];

/**
 * Clean and normalize text for regex matching.
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().replace(/['"`]/g, '').trim();
}

/**
 * Check if a term exists in text (using word boundary for single words to avoid substring false positives).
 */
function termMatches(text, term) {
  if (term.includes(' ')) {
    return text.includes(term);
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:[^a-zA-Z0-9]|$)`, 'i');
  return regex.test(text);
}

/**
 * Score matches in normalized text.
 */
function countMatches(text, termList) {
  let count = 0;
  const matched = [];
  for (const term of termList) {
    if (termMatches(text, term)) {
      count += 1;
      matched.push(term);
    }
  }
  return { count, matched };
}

/**
 * Estimate expected transmission lag in days based on event category.
 * Agro/harvest = 21d, Policy/tariff = 14d, Energy/freight = 7d.
 */
function estimateLagDays(text) {
  for (const term of CATEGORY_AGRO_CROP) {
    if (termMatches(text, term)) return 21;
  }
  for (const term of CATEGORY_POLICY_TARIFF) {
    if (termMatches(text, term)) return 14;
  }
  for (const term of CATEGORY_ENERGY_FREIGHT) {
    if (termMatches(text, term)) return 7;
  }
  return 14;
}

/**
 * Pure deterministic heuristic scorer.
 * Zero external network calls. Safe in all environments.
 *
 * @param {{ title: string, summary?: string|null }} article
 * @returns {{
 *   impactDirection: 'COST_UP' | 'COST_DOWN' | 'NEUTRAL',
 *   severityScore: number,
 *   expectedLagDays: number,
 *   impactRationale: string,
 *   scoringMethod: 'DETERMINISTIC_HEURISTIC',
 *   impactScoredAt: string,
 * }}
 */
function scoreArticleDeterministic(article) {
  const title = normalizeText(article?.title);
  const summary = normalizeText(article?.summary);
  const fullText = `${title} ${summary}`.trim();

  if (!fullText) {
    return {
      impactDirection: IMPACT_DIRECTION.NEUTRAL,
      severityScore: 1,
      expectedLagDays: 0,
      impactRationale: 'No content available for news impact scoring.',
      scoringMethod: SCORING_METHOD.DETERMINISTIC_HEURISTIC,
      impactScoredAt: new Date().toISOString(),
    };
  }

  // Weight title 2.0x, summary 1.0x
  const titleUpHigh = countMatches(title, COST_UP_HIGH);
  const summaryUpHigh = countMatches(summary, COST_UP_HIGH);
  const titleUpMod = countMatches(title, COST_UP_MODERATE);
  const summaryUpMod = countMatches(summary, COST_UP_MODERATE);

  const titleDownHigh = countMatches(title, COST_DOWN_HIGH);
  const summaryDownHigh = countMatches(summary, COST_DOWN_HIGH);
  const titleDownMod = countMatches(title, COST_DOWN_MODERATE);
  const summaryDownMod = countMatches(summary, COST_DOWN_MODERATE);

  const titleNeutral = countMatches(title, NEUTRAL_TERMS);
  const summaryNeutral = countMatches(summary, NEUTRAL_TERMS);

  const totalUpScore =
    (titleUpHigh.count * 4.0) + (summaryUpHigh.count * 2.0) +
    (titleUpMod.count * 2.0) + (summaryUpMod.count * 1.0);

  const totalDownScore =
    (titleDownHigh.count * 4.0) + (summaryDownHigh.count * 2.0) +
    (titleDownMod.count * 2.0) + (summaryDownMod.count * 1.0);

  const totalNeutralScore = (titleNeutral.count * 2.0) + (summaryNeutral.count * 1.0);

  const lagDays = estimateLagDays(fullText);

  // Direction resolution
  if (totalUpScore >= 1.0 && totalUpScore > totalDownScore) {
    const hasHighTerm = titleUpHigh.count > 0 || summaryUpHigh.count > 0;
    let severity = 2;
    if (totalUpScore >= 6.0 || (hasHighTerm && totalUpScore >= 4.0)) {
      severity = 5;
    } else if (totalUpScore >= 4.0 || hasHighTerm) {
      severity = 4;
    } else if (totalUpScore >= 2.0) {
      severity = 3;
    }

    const matchedTerms = [
      ...titleUpHigh.matched,
      ...summaryUpHigh.matched,
      ...titleUpMod.matched,
      ...summaryUpMod.matched,
    ].slice(0, 3);

    const rationale = matchedTerms.length > 0
      ? `Upward cost pressure detected from supply disruption signals (${matchedTerms.join(', ')}).`
      : 'Upward cost pressure detected from input market movement.';

    return {
      impactDirection: IMPACT_DIRECTION.COST_UP,
      severityScore: severity,
      expectedLagDays: lagDays,
      impactRationale: rationale,
      scoringMethod: SCORING_METHOD.DETERMINISTIC_HEURISTIC,
      impactScoredAt: new Date().toISOString(),
    };
  }

  if (totalDownScore >= 1.0 && totalDownScore > totalUpScore) {
    const hasHighTerm = titleDownHigh.count > 0 || summaryDownHigh.count > 0;
    let severity = 2;
    if (totalDownScore >= 6.0 || (hasHighTerm && totalDownScore >= 4.0)) {
      severity = 5;
    } else if (totalDownScore >= 4.0 || hasHighTerm) {
      severity = 4;
    } else if (totalDownScore >= 2.0) {
      severity = 3;
    }

    const matchedTerms = [
      ...titleDownHigh.matched,
      ...summaryDownHigh.matched,
      ...titleDownMod.matched,
      ...summaryDownMod.matched,
    ].slice(0, 3);

    const rationale = matchedTerms.length > 0
      ? `Downward price softening detected from supply easing signals (${matchedTerms.join(', ')}).`
      : 'Downward price softening detected from market signals.';

    return {
      impactDirection: IMPACT_DIRECTION.COST_DOWN,
      severityScore: severity,
      expectedLagDays: lagDays,
      impactRationale: rationale,
      scoringMethod: SCORING_METHOD.DETERMINISTIC_HEURISTIC,
      impactScoredAt: new Date().toISOString(),
    };
  }

  // Neutral or balanced signals
  const rationale = totalNeutralScore > 0
    ? 'Routine corporate or market operational update; neutral cost impact.'
    : 'Balanced or negligible cost movement signals detected; range-bound impact.';

  return {
    impactDirection: IMPACT_DIRECTION.NEUTRAL,
    severityScore: 1,
    expectedLagDays: 0,
    impactRationale: rationale,
    scoringMethod: SCORING_METHOD.DETERMINISTIC_HEURISTIC,
    impactScoredAt: new Date().toISOString(),
  };
}

/**
 * Score an article using Gemini AI if available and enabled, otherwise fallback to deterministic heuristic.
 *
 * @param {{ title: string, summary?: string|null }} article
 * @returns {Promise<{
 *   impactDirection: 'COST_UP' | 'COST_DOWN' | 'NEUTRAL',
 *   severityScore: number,
 *   expectedLagDays: number,
 *   impactRationale: string,
 *   scoringMethod: string,
 *   impactScoredAt: string,
 * }>}
 */
async function scoreArticle(article) {
  // Always produce a safe deterministic baseline
  const deterministicScore = scoreArticleDeterministic(article);

  // In test or non-AI mode, return deterministic score directly
  if (process.env.NODE_ENV === 'test' || !process.env.GEMINI_API_KEY) {
    return deterministicScore;
  }

  try {
    // Lazy load gemini provider to avoid unnecessary setup when offline
    const env = require('../config/env');
    if (!env.gemini || !env.gemini.apiKey) {
      return deterministicScore;
    }

    // AI scoring attempt can be plugged in here; if it fails or times out, return deterministicScore
    return deterministicScore;
  } catch {
    return deterministicScore;
  }
}

/**
 * Score and persist impact columns to news_items.
 *
 * @param {object} pool
 * @param {number} articleId
 * @param {{ title: string, summary?: string|null }} article
 */
async function scoreAndPersistArticle(pool, articleId, article) {
  const scored = await scoreArticle(article);
  await pool.execute(
    `UPDATE news_items
     SET impact_direction = ?,
         severity_score = ?,
         expected_lag_days = ?,
         impact_rationale = ?,
         scoring_method = ?,
         impact_scored_at = ?
     WHERE id = ?`,
    [
      scored.impactDirection,
      scored.severityScore,
      scored.expectedLagDays,
      scored.impactRationale,
      scored.scoringMethod,
      scored.impactScoredAt ? new Date(scored.impactScoredAt) : new Date(),
      articleId,
    ]
  );
  return scored;
}

module.exports = {
  scoreArticleDeterministic,
  scoreArticle,
  scoreAndPersistArticle,
  estimateLagDays,
  normalizeText,
  COST_UP_HIGH,
  COST_UP_MODERATE,
  COST_DOWN_HIGH,
  COST_DOWN_MODERATE,
  NEUTRAL_TERMS,
};
