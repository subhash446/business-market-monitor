'use strict';

/**
 * Unit & Idempotency tests for Migration 032 (V3-M2: Structured News Impact Metadata).
 */

const migration032 = require('../src/migrations/032_add_news_impact_scoring_to_news_items');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 032 — V3-M2: News Impact Scoring for news_items', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        // Default behavior: column/index does not exist
        if (sql.includes('information_schema.COLUMNS') || sql.includes('information_schema.STATISTICS')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) adds all 6 impact scoring columns and index when none exist', async () => {
    await migration032.up(mockPool);

    // 6 col checks + 6 alters + 1 index check + 1 index alter = 14 queries
    expect(mockPool.query).toHaveBeenCalledTimes(14);

    const colAlters = executedQueries.filter((q) => q.sql.includes('ALTER TABLE news_items ADD COLUMN'));
    expect(colAlters).toHaveLength(6);
    expect(colAlters[0].sql).toContain("impact_direction ENUM('COST_UP', 'COST_DOWN', 'NEUTRAL')");
    expect(colAlters[1].sql).toContain('severity_score TINYINT UNSIGNED');
    expect(colAlters[2].sql).toContain('expected_lag_days SMALLINT UNSIGNED');
    expect(colAlters[3].sql).toContain('impact_rationale VARCHAR(500)');
    expect(colAlters[4].sql).toContain("scoring_method ENUM('DETERMINISTIC_HEURISTIC', 'AI_ASSISTED')");
    expect(colAlters[5].sql).toContain('impact_scored_at DATETIME');

    const indexAlters = executedQueries.filter((q) => q.sql.includes('ADD KEY idx_news_items_impact'));
    expect(indexAlters).toHaveLength(1);
    expect(indexAlters[0].sql).toContain('(impact_direction, severity_score, published_at DESC)');
  });

  test('up(pool) skips creation idempotently when columns and index already exist', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS') || sql.includes('information_schema.STATISTICS')) {
        return [[{ cnt: 1 }]]; // Already exists
      }
      return [[]];
    });

    await migration032.up(mockPool);

    // 6 col checks + 1 index check = 7 queries, 0 alters
    expect(mockPool.query).toHaveBeenCalledTimes(7);
    const alters = executedQueries.filter((q) => q.sql.includes('ALTER TABLE news_items ADD'));
    expect(alters).toHaveLength(0);
  });

  test('down(pool) drops index and all 6 columns when they exist', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS') || sql.includes('information_schema.STATISTICS')) {
        return [[{ cnt: 1 }]]; // Exists to drop
      }
      return [[]];
    });

    await migration032.down(mockPool);

    // 1 index check + 1 index drop + 6 col checks + 6 col drops = 14 queries
    expect(mockPool.query).toHaveBeenCalledTimes(14);
    const indexDrops = executedQueries.filter((q) => q.sql.includes('DROP KEY idx_news_items_impact'));
    expect(indexDrops).toHaveLength(1);

    const colDrops = executedQueries.filter((q) => q.sql.includes('DROP COLUMN'));
    expect(colDrops).toHaveLength(6);
  });

  test('down(pool) skips drop idempotently when columns and index do not exist', async () => {
    await migration032.down(mockPool);

    // 1 index check + 6 col checks = 7 queries, 0 drops
    expect(mockPool.query).toHaveBeenCalledTimes(7);
    const drops = executedQueries.filter((q) => q.sql.includes('DROP'));
    expect(drops).toHaveLength(0);
  });

  test('migrationLedger BASELINE_SCHEMA_SPECS registers 032 with exact column types and index', () => {
    const spec = BASELINE_SCHEMA_SPECS['032_add_news_impact_scoring_to_news_items.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.news_items).toBeDefined();

    const cols = spec.tables.news_items.columns;
    expect(cols.impact_direction.dataType).toBe('enum');
    expect(cols.impact_direction.columnTypeIncludes).toEqual(['COST_UP', 'COST_DOWN', 'NEUTRAL']);
    expect(cols.severity_score.isNullable).toBe('YES');
    expect(cols.expected_lag_days.isNullable).toBe('YES');
    expect(cols.impact_rationale.dataType).toBe('varchar');
    expect(cols.scoring_method.dataType).toBe('enum');
    expect(cols.impact_scored_at.isNullable).toBe('YES');

    expect(spec.tables.news_items.indexes.idx_news_items_impact).toBeDefined();
  });
});
