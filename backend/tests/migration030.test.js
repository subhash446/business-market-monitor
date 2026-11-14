'use strict';

/**
 * Unit & Idempotency tests for Migration 030 (T-08: News Digest Enhancements & Supplier Recommendations).
 */

const migration030 = require('../src/migrations/030_add_news_digest_enhancements');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 030 — T-08: News Digest Enhancements (FR-ALERT-06)', () => {
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

  test('up(pool) adds columns to businesses and widens sync_statuses.job_type when not present', async () => {
    await migration030.up(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(3);
    // 1. check businesses column
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
    expect(executedQueries[0]).toContain('businesses');
    // 2. alter businesses
    expect(executedQueries[1]).toContain('ALTER TABLE businesses');
    expect(executedQueries[1]).toContain('ADD COLUMN news_digest_channel ENUM(\'EMAIL\',\'WHATSAPP\',\'BOTH\')');
    expect(executedQueries[1]).toContain('ADD COLUMN last_digest_sent_at DATETIME');
    // 3. widen sync_statuses.job_type
    expect(executedQueries[2]).toContain('ALTER TABLE sync_statuses');
    expect(executedQueries[2]).toContain('MODIFY COLUMN job_type ENUM(\'PRICE_INGESTION\',\'NEWS_INGESTION\',\'AI_INSIGHTS\',\'ALERT_EVALUATION\',\'NEWS_DIGEST\')');
  });

  test('up(pool) skips ALTER TABLE businesses idempotently when columns already exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration030.up(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
    expect(executedQueries.some((q) => q.includes('ALTER TABLE businesses'))).toBe(false);
    expect(executedQueries[1]).toContain('ALTER TABLE sync_statuses');
  });

  test('down(pool) drops columns when columns exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration030.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(3);
    expect(executedQueries[1]).toContain('ALTER TABLE businesses');
    expect(executedQueries[1]).toContain('DROP COLUMN last_digest_sent_at');
    expect(executedQueries[1]).toContain('DROP COLUMN news_digest_channel');
    expect(executedQueries[2]).toContain('ALTER TABLE sync_statuses');
    expect(executedQueries[2]).toContain('MODIFY COLUMN job_type ENUM(\'PRICE_INGESTION\',\'NEWS_INGESTION\',\'AI_INSIGHTS\',\'ALERT_EVALUATION\')');
  });

  test('down(pool) skips DROP COLUMN idempotently when columns do not exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 0 }]];
      }
      return [[]];
    });

    await migration030.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(executedQueries.some((q) => q.includes('ALTER TABLE businesses'))).toBe(false);
  });

  test('migrationLedger registers migration 030 in BASELINE_SCHEMA_SPECS', () => {
    const spec = BASELINE_SCHEMA_SPECS['030_add_news_digest_enhancements.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.businesses).toBeDefined();
    expect(spec.tables.businesses.columns.news_digest_channel).toBeDefined();
    expect(spec.tables.businesses.columns.last_digest_sent_at).toBeDefined();
    expect(spec.tables.sync_statuses.columns.job_type).toBeDefined();
    expect(spec.tables.sync_statuses.columns.job_type.columnTypeIncludes).toContain('NEWS_DIGEST');
  });
});
