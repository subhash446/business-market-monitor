'use strict';

/**
 * Unit tests for News Impact Scorer Service (V3-M2).
 */

const newsImpactScorer = require('../src/services/newsImpactScorer.service');
const { IMPACT_DIRECTION, SCORING_METHOD } = require('../src/constants/enums');

describe('newsImpactScorer.service — Deterministic & AI Scorer (V3-M2)', () => {
  describe('1. scoreArticleDeterministic() — Pure Heuristic Scorer', () => {
    test('classifies high-severity supply disruption as COST_UP with 7d lag (energy/refinery)', () => {
      const article = {
        title: 'Massive refinery fire causes force majeure and crude supply crunch in Gujarat',
        summary: 'Emergency plant shutdown announced following major explosion. Logistics and port shipments halted.',
      };

      const result = newsImpactScorer.scoreArticleDeterministic(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.COST_UP);
      expect(result.severityScore).toBeGreaterThanOrEqual(4);
      expect(result.expectedLagDays).toBe(7);
      expect(result.scoringMethod).toBe(SCORING_METHOD.DETERMINISTIC_HEURISTIC);
      expect(result.impactRationale).toContain('Upward cost pressure detected');
      expect(result.impactScoredAt).toBeDefined();
    });

    test('classifies tariff and duty hikes as COST_UP with 14d lag (policy/regulation)', () => {
      const article = {
        title: 'Government announces 15% tariff hike and anti-dumping duty on imported polymers',
        summary: 'Domestic manufacturers petition for higher rates as input cost surge bites small units.',
      };

      const result = newsImpactScorer.scoreArticleDeterministic(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.COST_UP);
      expect(result.severityScore).toBeGreaterThanOrEqual(3);
      expect(result.expectedLagDays).toBe(14);
      expect(result.impactRationale).toContain('Upward cost pressure');
    });

    test('classifies bumper harvest and duty cuts as COST_DOWN with 21d lag (agriculture)', () => {
      const article = {
        title: 'Bumper crop and record harvest expected for domestic wheat and mustard acreage',
        summary: 'Central government slashes import duty and announces export surplus to cool mandi rates.',
      };

      const result = newsImpactScorer.scoreArticleDeterministic(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.COST_DOWN);
      expect(result.severityScore).toBeGreaterThanOrEqual(4);
      expect(result.expectedLagDays).toBe(21);
      expect(result.scoringMethod).toBe(SCORING_METHOD.DETERMINISTIC_HEURISTIC);
      expect(result.impactRationale).toContain('Downward price softening detected');
    });

    test('classifies price cuts and demand slowdown as COST_DOWN with moderate severity', () => {
      const article = {
        title: 'Leading petrochemical producer announces sharp price cut across polymer grades',
        summary: 'Softening prices and cooling rates reflect demand slowdown and inventory rebound.',
      };

      const result = newsImpactScorer.scoreArticleDeterministic(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.COST_DOWN);
      expect(result.severityScore).toBeGreaterThanOrEqual(2);
      expect(result.impactRationale).toContain('Downward price softening');
    });

    test('classifies routine corporate meetings and MOUs as NEUTRAL', () => {
      const article = {
        title: 'Steel manufacturer signs routine MoU for green energy transition; quarterly results next week',
        summary: 'Board meeting scheduled for tomorrow to discuss corporate CSR and appointment of new director.',
      };

      const result = newsImpactScorer.scoreArticleDeterministic(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.NEUTRAL);
      expect(result.severityScore).toBe(1);
      expect(result.expectedLagDays).toBe(0);
      expect(result.impactRationale).toContain('Routine corporate or market operational update');
    });

    test('handles empty or missing title/summary safely as NEUTRAL', () => {
      expect(newsImpactScorer.scoreArticleDeterministic(null)).toEqual(
        expect.objectContaining({
          impactDirection: IMPACT_DIRECTION.NEUTRAL,
          severityScore: 1,
          expectedLagDays: 0,
        })
      );

      expect(newsImpactScorer.scoreArticleDeterministic({ title: '', summary: '' })).toEqual(
        expect.objectContaining({
          impactDirection: IMPACT_DIRECTION.NEUTRAL,
          severityScore: 1,
          expectedLagDays: 0,
        })
      );
    });

    test('applies 2x weight to title keywords vs 1x summary keywords', () => {
      // Title says price hike (COST_UP), summary mentions softening (COST_DOWN)
      const article = {
        title: 'Urgent price hike announced by primary steel mills',
        summary: 'Some traders reported mild softening in secondary cash markets.',
      };

      const result = newsImpactScorer.scoreArticleDeterministic(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.COST_UP);
    });
  });

  describe('2. scoreArticle() and scoreAndPersistArticle()', () => {
    test('scoreArticle falls back gracefully to deterministic heuristic when Gemini is not configured', async () => {
      const article = {
        title: 'Major worker strike at national freight hub threatens container flow',
        summary: 'Port congestion escalates as logistics bottleneck worsens.',
      };

      const result = await newsImpactScorer.scoreArticle(article);
      expect(result.impactDirection).toBe(IMPACT_DIRECTION.COST_UP);
      expect(result.scoringMethod).toBe(SCORING_METHOD.DETERMINISTIC_HEURISTIC);
    });

    test('scoreAndPersistArticle executes parameterized UPDATE on news_items', async () => {
      const mockPool = {
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
      };

      const article = {
        title: 'Government cuts import duty on key polymer feedstocks',
        summary: 'Move aimed at cooling prices for domestic SME packaging processors.',
      };

      const scored = await newsImpactScorer.scoreAndPersistArticle(mockPool, 101, article);
      expect(scored.impactDirection).toBe(IMPACT_DIRECTION.COST_DOWN);
      expect(mockPool.execute).toHaveBeenCalledTimes(1);

      const [sql, params] = mockPool.execute.mock.calls[0];
      expect(sql).toContain('UPDATE news_items');
      expect(sql).toContain('SET impact_direction = ?');
      expect(params[0]).toBe(IMPACT_DIRECTION.COST_DOWN);
      expect(params[params.length - 1]).toBe(101); // articleId
    });
  });
});
