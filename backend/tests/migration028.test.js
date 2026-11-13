'use strict';

/**
 * Unit & Idempotency tests for Migration 028 (V2-01C Procurement Action Recommendations).
 * Uses a mock database pool to verify query shape, column existence checks, and idempotency.
 */

const migration028 = require('../src/migrations/028_add_procurement_recommendations_to_ai_insights');

describe('Migration 028 — V2-01C: Procurement Action Recommendations', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql) => {
        executedQueries.push(sql);
        // Default behavior: column does not exist
        if (sql.includes('information_schema.COLUMNS')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) adds columns when action_recommendation does not exist', async () => {
    await migration028.up(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
    expect(executedQueries[1]).toContain('ALTER TABLE ai_insights');
    expect(executedQueries[1]).toContain('ADD COLUMN action_recommendation');
    expect(executedQueries[1]).toContain('ADD COLUMN recommendation_rationale');
    expect(executedQueries[1]).toContain('ADD COLUMN recommendation_horizon');
    expect(executedQueries[1]).toContain('ADD COLUMN is_downgraded');
    expect(executedQueries[1]).toContain('ADD COLUMN downgrade_reason');
  });

  test('up(pool) skips ALTER TABLE idempotently when columns already exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration028.up(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
  });

  test('down(pool) drops columns when action_recommendation exists', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration028.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
    expect(executedQueries[1]).toContain('ALTER TABLE ai_insights');
    expect(executedQueries[1]).toContain('DROP COLUMN action_recommendation');
    expect(executedQueries[1]).toContain('DROP COLUMN recommendation_rationale');
    expect(executedQueries[1]).toContain('DROP COLUMN recommendation_horizon');
    expect(executedQueries[1]).toContain('DROP COLUMN is_downgraded');
    expect(executedQueries[1]).toContain('DROP COLUMN downgrade_reason');
  });

  test('down(pool) skips DROP COLUMN idempotently when columns do not exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 0 }]];
      }
      return [[]];
    });

    await migration028.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
  });
});
